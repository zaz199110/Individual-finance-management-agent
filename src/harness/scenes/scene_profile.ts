import fs from "node:fs";
import path from "node:path";
import { loadSkillContent } from "@/harness/skills/loader";
import { writeStage, seedWorkflowTasks } from "@/harness/tasks/stage";
import { streamTextViaSse } from "@/harness/stream/sse-stream";
import { executeTool } from "@/harness/tools/router";
import type {
  ContentBlock,
  ExecutionPlan,
  QueryState,
  SseWriter,
} from "@/harness/types";
import { getSupabase } from "@/lib/supabase/server";
import {
  getActiveGoalTypes,
  goalPickLabel,
  listGoalPickShortPrompt,
  loadSampleGoalPayload,
  parseGoalKeyValueFormat,
  resolveGoalTypeFromMessage,
} from "@/lib/profile/goal-constraint";
import { profileParseBasicInfo } from "@/lib/profile/profile-parse";
import {
  buildProfilePlaceholderHint,
  buildRemainingGoalsHint,
  getCurrentBasicInfo,
  getCurrentGoalConstraint,
  profileRead,
} from "@/lib/profile/read";
import { formatBasicInfoAsCopyableExample } from "@/lib/profile/basic-info";
import { formatGoalConstraintAsCopyableExample } from "@/lib/profile/goal-constraint";
import { loadSampleBasicPayload } from "@/lib/profile/propose";
import { formatProfileDraftNotice } from "@/lib/profile/report-draft";
import { draftAllGoalsProfileReport, type ReportProgressCallback } from "@/lib/profile/report-merge";
import type { ConfirmCardBlock, ReportPublishCardBlock } from "@/lib/profile/types";
import { getProjectRoot } from "@/lib/paths";
import { throwIfAborted } from "@/lib/chat/stop-generation";
import { profileConfirmArtifact, syncConversationAfterConfirm } from "@/lib/profile/confirm";
import { resetGoalConstraints } from "@/lib/profile/reset-goals";

const QUESTIONNAIRE_HINT = `**第一步 · 基本情况**
可前往「当前画像」页，点击基本信息旁的「复制」按钮，修改后发送给我。`;

const GOAL_PICK_HINT = `**第二步 · 选择投资场景**
${listGoalPickShortPrompt()}

可前往「当前画像」页，点击对应场景旁的「复制」按钮，修改后发送给我。`;

function loadDeltaQuestionnaire(): string {
  const p = path.join(
    getProjectRoot(),
    "skills/profile/questionnaire.base.delta.zh.md",
  );
  if (!fs.existsSync(p)) {
    return "你之前已经整理过基本情况。这次有哪些变了？请只写有变化的项目。";
  }
  const raw = fs.readFileSync(p, "utf8");
  const match = raw.match(/# 对客正文[^]*?(?=\n# Agent|$)/);
  return match
    ? match[0].replace(/^# 对客正文[^\n]*\n/m, "").trim()
    : raw.slice(0, 600);
}

function isModifyBasicInfoIntent(text: string): boolean {
  return /(?:修改|更改|更新|调整|改).{0,6}(?:个人|基本).{0,4}(?:信息|情况)|涨工资|换工作|贷款还清|刚结婚|有孩子|开支变了|可投资钱多了|可投资钱少了|收入变了/i.test(
    text,
  );
}

async function emitProposeTool(
  state: QueryState,
  sse: SseWriter,
  input: Record<string, unknown>,
  contentBlocks: ContentBlock[],
): Promise<{ ok: boolean; assistantExtra: string }> {
  const tool = await executeTool({
    tool: "profile_propose",
    input,
    scene: "profile",
    conversationId: state.conversationId,
    runId: state.runId,
  });
  if (tool.ok && tool.data && typeof tool.data === "object") {
    const data = tool.data as { card?: ConfirmCardBlock; preview?: string };
    if (data.card) {
      contentBlocks.push(data.card);
      sse.write("content_block", data.card);
    }
    return {
      ok: true,
      assistantExtra: "\n\n" + (data.preview ?? tool.preview),
    };
  }
  return { ok: false, assistantExtra: tool.error ?? "生成确认卡失败。" };
}

export async function handleSceneProfile(
  state: QueryState,
  userMessage: string,
  sse: SseWriter,
  plan: ExecutionPlan,
): Promise<{
  assistantContent: string;
  contentBlocks: ContentBlock[];
}> {
  if (plan.intent !== "scene_task") {
    throw new Error("profile handler 仅处理 scene_task");
  }

  const supabase = await getSupabase();
  let read = await profileRead(supabase);
  loadSkillContent("profile_intake");

  // Mark onboarding as done — the planner already handled the understanding phase
  await writeStage(sse, state, {
    task_key: "profile.onboarding",
    status: "done",
  });

  let normalized = userMessage.trim();
  const contentBlocks: ContentBlock[] = [];
  let assistantContent = "";

  // Branch 0: 【放弃修改】 — 放弃当前修改管线
  if (/^【放弃修改】$/.test(normalized)) {
    return {
      assistantContent:
        "已放弃当前修改。您可以重新发起任何场景的修改。",
      contentBlocks,
    };
  }

  await writeStage(sse, state, {
    task_key: "profile.basic.form",
    status: "running",
  });

  // Branch 1: "确认" — confirm pending artifacts
  let confirmCount = 0;
  let confirmSummary = "";
  if (/确认/.test(normalized)) {
    if (supabase) {
      const { data: pendingArtifacts } = await supabase
        .from("propose_artifacts")
        .select("id")
        .eq("conversation_id", state.conversationId)
        .eq("status", "pending");
      if (pendingArtifacts && pendingArtifacts.length > 0) {
        for (const artifact of pendingArtifacts) {
          await profileConfirmArtifact(supabase, artifact.id);
          await syncConversationAfterConfirm(supabase, state.conversationId, artifact.id);
        }
        read = await profileRead(supabase);
        confirmCount = pendingArtifacts.length;
        confirmSummary = `已确认 ${confirmCount} 项内容。`;
      } else {
        confirmSummary = "当前没有待确认的内容。";
      }
    }
    normalized = normalized.replace(/确认[,，；;]?\s*/g, "");
  }

  // Branch 2: "删除/清空/重置投资约束" — reset all goal constraints
  let resetSummary = "";
  if (/删除|清空|重置/.test(normalized) && /投资约束|投资目标|场景.*约束|目标场景|goal.constraint/i.test(normalized)) {
    if (supabase) {
      const resetResult = await resetGoalConstraints(supabase);
      read = await profileRead(supabase);
      if (resetResult.deactivated === 0) {
        resetSummary = "当前没有可重置的投资约束。";
      } else {
        const labels = resetResult.goal_types.map((gt) => goalPickLabel(gt)).join("、");
        resetSummary = `已重置全部 ${resetResult.deactivated} 个场景的投资约束（${labels}），现在可以重新选择目标场景。`;
      }
    } else {
      resetSummary = "数据库未连接，无法重置投资约束。";
    }
    normalized = normalized.replace(/删除|清空|重置|投资约束|投资目标|场景.*?约束|目标场景/gi, "").trim();
  }

  // 处理"问卷"关键词，显示当前可用的问卷
  if (/^问卷$|^详细填写说明$/i.test(normalized)) {
    if (!read.has_basic_info) {
      assistantContent = `**基本情况问卷**\n\n${QUESTIONNAIRE_HINT}`;
    } else {
      assistantContent = `**投资目标问卷**\n\n${GOAL_PICK_HINT}`;
    }
    await writeStage(sse, state, { task_key: "profile.basic.form", status: "done" });
  } else if (/^\/profile_read\b/i.test(normalized)) {
    const tool = await executeTool({ tool: "profile_read", input: {}, scene: "profile" });
    assistantContent = tool.preview || "暂无投资需求摘要。";
    await writeStage(sse, state, { task_key: "profile.basic.form", status: "done" });
  } else if (/^\/profile_parse\b/i.test(normalized) || /```/.test(normalized)) {
    const parsed = await profileParseBasicInfo({ text: normalized });
    if (!parsed.ok || !parsed.basic_info) {
      const errorMsg = parsed.error ?? "解析失败";
      assistantContent = `**解析失败**：${errorMsg}

请检查以下常见问题：
1. 确保包含必填字段：姓名、年龄、收入等
2. 数字字段请填写纯数字（如：50000）
3. 选择字段请填写选项文字（如：企业员工）

请修改后重新发送，或回复「问卷」获取详细填写说明。`;
    } else {
      const propose = await emitProposeTool(
        state,
        sse,
        {
          kind: "profile_basic",
          basic_info: parsed.basic_info,
          card_title: "请确认：基本情况",
        },
        contentBlocks,
      );
      assistantContent = "我按您提供的内容整理如下，请核对后确认。";
    }
    await writeStage(sse, state, { task_key: "profile.basic.form", status: "done" });
  } else if (/样例基本情况|样例客户信息|演示基本情况|用样例客户|用样例基本/i.test(normalized)) {
    const propose = await emitProposeTool(
      state,
      sse,
      loadSampleBasicPayload() as unknown as Record<string, unknown>,
      contentBlocks,
    );
    assistantContent = "我按样例数据整理基本情况如下：";
    await writeStage(sse, state, { task_key: "profile.basic.form", status: "done" });
  } else if (/样例养老|演示养老|用样例.*养老|样例.*需求/i.test(normalized)) {
    if (!read.has_basic_info) {
      assistantContent = "请先确认并保存 **基本情况**，再说「用样例养老需求」。";
      await writeStage(sse, state, { task_key: "profile.basic.form", status: "done" });
    } else {
      await writeStage(sse, state, {
        task_key: "profile.goal.form",
        status: "running",
      });
      const sample = loadSampleGoalPayload(read.profile_version_id ?? undefined);
      const propose = await emitProposeTool(
        state,
        sse,
        sample as unknown as Record<string, unknown>,
        contentBlocks,
      );
      assistantContent = "我按样例整理 **退休养老** 本组需求如下：";
      await writeStage(sse, state, { task_key: "profile.goal.form", status: "done" });
    }
  } else if (/生成.*报告|发报告|report_draft/i.test(normalized)) {
    // 预种前置步骤（标记已完成）和报告子步骤，让进度条一开始就展示完整步骤列表
    await seedWorkflowTasks(state, ["profile.basic.form", "profile.goal.form"], "done", sse);

    const reportSubKeys = [
      "profile.rpt.draft.gather",
      "profile.rpt.draft.compose",
      "profile.rpt.draft.cross",
      "profile.rpt.draft.merge",
    ];
    await seedWorkflowTasks(state, reportSubKeys, "pending", sse);
    await writeStage(sse, state, { task_key: "profile.rpt.draft.gather", status: "running" });

    const onProgress: ReportProgressCallback = async (taskKey, status) => {
      await writeStage(sse, state, { task_key: taskKey, status });
    };

    if (!supabase) {
      assistantContent = "数据库未连接，无法生成报告。";
      for (const subKey of reportSubKeys) {
        await writeStage(sse, state, { task_key: subKey, status: "failed" });
      }
    } else {
      // Stream loading message immediately
      await streamTextViaSse(sse, "正在为所有已确认需求生成合并报告...");

      const draft = await draftAllGoalsProfileReport(supabase, {
        conversationId: state.conversationId,
        runId: state.runId,
        sessionId: "",
      }, onProgress);

      if (!draft.ok) {
        // Mark any sub-tasks not yet handled by onProgress as failed
        for (const subKey of reportSubKeys) {
          await writeStage(sse, state, { task_key: subKey, status: "failed" });
        }
        const err = draft.error ?? "生成合并报告草稿失败。";
        assistantContent = err.includes("校验未通过")
          ? `报告草稿已生成，但 **结构校验未通过**，请调整后重新生成：\n\n${err}`
          : err;
      } else {
        // Query goal count for the success message
        const { count: goalCount } = await supabase
          .from("investment_goal_constraints")
          .select("*", { count: "exact", head: true })
          .not("confirmed_at", "is", null)
          .eq("is_active", true);

        const notice = formatProfileDraftNotice({
          refineOk: true,
          verifyWarnings: draft.verify_warnings,
        });
        const card: ReportPublishCardBlock = {
          type: "report_publish_card",
          status: "active",
          report_type: "profile",
          scope: "combined",
          report_name: draft.report_name ?? "投资需求报告",
          file_path: draft.draft_path,
          notice_zh: notice,
        };
        contentBlocks.push(card);
        sse.write("content_block", card);
        assistantContent = "";

        // All sub-tasks already marked done via onProgress inside the function
      }
    }
  } else if (resolveGoalTypeFromMessage(normalized)) {
    // 用户粘贴了场景数据（带【标题】或纯 key-value 格式），直接解析生成确认卡
    await writeStage(sse, state, { task_key: "profile.goal.form", status: "running" });
    const picked = resolveGoalTypeFromMessage(normalized);
    if (picked && read.has_basic_info) {
      const active = supabase ? await getActiveGoalTypes(supabase) : new Set();
      const sceneLabel = goalPickLabel(picked);
      if (active.has(picked)) {
        // 尝试解析用户发送的修改数据，优先生成确认卡
        const parsed = parseGoalKeyValueFormat(normalized, picked, read.profile_version_id ?? undefined);
        if (parsed.ok && parsed.data) {
          const existingConstraint = supabase ? await getCurrentGoalConstraint(supabase, picked) : null;
          if (existingConstraint?.goal_constraint_id) {
            parsed.data.goal_constraint_id = existingConstraint.goal_constraint_id;
          }
          const propose = await emitProposeTool(
            state,
            sse,
            parsed.data as unknown as Record<string, unknown>,
            contentBlocks,
          );
          assistantContent = `我按您提供的内容整理 **${sceneLabel}** 修改如下，请核对后确认。`;
          if (parsed.missingFields && parsed.missingFields.length > 0) {
            assistantContent += `\n\n**请补充以下信息：**\n${parsed.missingFields.map((f) => `- ${f}`).join("\n")}`;
          }
        } else {
          // 解析失败，展示当前数据供用户复制修改
          const currentConstraint = supabase ? await getCurrentGoalConstraint(supabase, picked) : null;
          if (currentConstraint) {
            const copyableExample = formatGoalConstraintAsCopyableExample(currentConstraint);
            assistantContent = `「${sceneLabel}」已有进行中的需求，以下是当前数据，请复制后修改需要变更的项目，然后发送给我：

${copyableExample}

---
修改后发送给我，我会帮您解析并生成确认卡。`;
          } else {
            const remainingHint = buildRemainingGoalsHint(read);
            assistantContent = `「${sceneLabel}」已有进行中的需求，请直接说明要修改的内容，或选其他场景。\n\n${GOAL_PICK_HINT}${remainingHint ? "\n" + remainingHint : ""}`;
          }
        }
      } else {
        // 尝试解析用户粘贴的场景数据
        const parsed = parseGoalKeyValueFormat(normalized, picked, read.profile_version_id ?? undefined);
        if (parsed.ok && parsed.data) {
          const propose = await emitProposeTool(
            state,
            sse,
            parsed.data as unknown as Record<string, unknown>,
            contentBlocks,
          );
          // 成功时只显示文案，缺失字段提示单独处理
          assistantContent = `我按您提供的内容整理 **${sceneLabel}** 需求如下，请核对后确认。`;
          // 如果有缺失字段，在文案中提示
          if (parsed.missingFields && parsed.missingFields.length > 0) {
            assistantContent += `\n\n**请补充以下信息：**\n${parsed.missingFields.map((f) => `- ${f}`).join("\n")}`;
          }
        } else {
          // 解析失败，显示错误信息和修改建议
          const errorMsg = parsed.error ?? "解析失败";
          if (parsed.missingFields && parsed.missingFields.length > 0) {
            const fieldList = parsed.missingFields.map((f) => `- ${f}`).join("\n");
            assistantContent = `**缺少以下信息，请补充：**

${fieldList}

请补充后重新发送。`;
          } else {
            assistantContent = `**解析失败**：${errorMsg}

请确保格式为「【场景名称】」开头，每行「字段名：值」，数字字段填纯数字。

请修改后重新发送。`;
          }
        }
      }
    } else if (!read.has_basic_info) {
      assistantContent = `请先完成基本情况确认。\n\n${QUESTIONNAIRE_HINT}`;
    } else {
      assistantContent = GOAL_PICK_HINT;
    }
    await writeStage(sse, state, { task_key: "profile.goal.form", status: "done" });
  } else if (/选场景|投资目标|第二步/i.test(normalized) || resolveGoalTypeFromMessage(normalized)) {
    if (!read.has_basic_info) {
      // 先尝试解析为基本信息（用户可能粘贴了包含关键词的基本信息文本）
      const previousBasicInfo =
        read.has_basic_info && supabase
          ? await getCurrentBasicInfo(supabase)
          : undefined;
      const parsed = await profileParseBasicInfo({
        text: normalized,
        previous_basic_info: previousBasicInfo ?? undefined,
      });
      if (parsed.ok && parsed.basic_info) {
        const propose = await emitProposeTool(
          state,
          sse,
          {
            kind: "profile_basic",
            basic_info: parsed.basic_info,
            card_title: "请确认：基本情况",
          },
          contentBlocks,
        );
        const note = parsed.warnings?.length
          ? "\n\n" + parsed.warnings.filter((w) => w.startsWith("已提取")).join("\n")
          : "";
        assistantContent = "我按您提供的内容整理如下，请核对后确认。" + note;
      } else {
        assistantContent = `请先完成基本情况确认。\n\n${QUESTIONNAIRE_HINT}`;
      }
      await writeStage(sse, state, { task_key: "profile.basic.form", status: "done" });
    } else {
      await writeStage(sse, state, { task_key: "profile.goal.form", status: "running" });
      const picked = resolveGoalTypeFromMessage(normalized);
      if (picked) {
        const active = supabase ? await getActiveGoalTypes(supabase) : new Set();
        const sceneLabel = goalPickLabel(picked);
        if (active.has(picked)) {
          // 已有该场景的需求，显示当前数据供用户复制修改
          const currentConstraint = supabase ? await getCurrentGoalConstraint(supabase, picked) : null;
          if (currentConstraint) {
            const copyableExample = formatGoalConstraintAsCopyableExample(currentConstraint);
            assistantContent = `「${sceneLabel}」已有进行中的需求，以下是当前数据，请复制后修改需要变更的项目，然后发送给我：

${copyableExample}

---
修改后发送给我，我会帮您解析并生成确认卡。`;
          } else {
            const remainingHint = buildRemainingGoalsHint(read);
            assistantContent = `「${sceneLabel}」已有进行中的需求，请直接说明要修改的内容，或选其他场景。\n\n${GOAL_PICK_HINT}${remainingHint ? "\n" + remainingHint : ""}`;
          }
        } else {
          assistantContent = `好的，已选择「${sceneLabel}」场景。可前往「当前画像」页，点击该场景旁的「复制」按钮，粘贴后加上「我要修改」发送给我。`;
        }
      } else {
        assistantContent = GOAL_PICK_HINT;
      }
      await writeStage(sse, state, { task_key: "profile.goal.form", status: "done" });
    }
  } else if (state.trigger === "handoff_autostart" || /开始梳理|梳理投资需求/i.test(normalized)) {
    await writeStage(sse, state, { task_key: "profile.basic.form", status: read.has_basic_info ? "done" : "running" });
    const hint = buildProfilePlaceholderHint(read);
    assistantContent = `好的，我们开始 **需求梳理**。\n\n${QUESTIONNAIRE_HINT}\n\n${read.has_basic_info ? `基本情况已保存。${GOAL_PICK_HINT}\n\n${hint}` : hint}`;
    if (read.has_basic_info) {
      await writeStage(sse, state, { task_key: "profile.basic.form", status: "done" });
    }
  } else if (/^(?:修改|改|调整|更新|变更)\s*(?:一下|一下下|一哈)?\s*$/i.test(normalized)) {
    await writeStage(sse, state, { task_key: "profile.basic.form", status: "done" });
    if (read.has_basic_info) {
      const remainingHint = buildRemainingGoalsHint(read);
      assistantContent = `好的。已读取您的基本情况（${read.basic_info_summary}）。\n\n可前往「当前画像」页，点击对应区块的「复制」按钮，粘贴后加上「我要修改」发送给我即可。${remainingHint ? "\n" + remainingHint : ""}`;
    } else {
      assistantContent = `您还没有保存过基本情况。可前往「当前画像」页，点击基本信息旁的「复制」按钮，修改后发送给我。`;
    }
  } else if (isModifyBasicInfoIntent(normalized)) {
    await writeStage(sse, state, { task_key: "profile.basic.form", status: "done" });
    if (!read.has_basic_info) {
      assistantContent = `您还没有保存过基本情况，我们先从头开始整理。\n\n${QUESTIONNAIRE_HINT}`;
    } else {
      const currentBasicInfo = supabase ? await getCurrentBasicInfo(supabase) : null;
      if (currentBasicInfo) {
        const copyableExample = formatBasicInfoAsCopyableExample(currentBasicInfo);
        assistantContent = `以下是您当前的基本情况，请复制后修改需要变更的项目，然后发送给我：

${copyableExample}

---
修改后发送给我，我会帮您解析并生成确认卡。`;
      } else {
        assistantContent = `您还没有保存过基本情况，我们先从头开始整理。\n\n${QUESTIONNAIRE_HINT}`;
      }
    }
  } else if (/无变化|没变|没有变化|都一样/i.test(normalized)) {
    await writeStage(sse, state, { task_key: "profile.basic.form", status: "done" });
    if (read.has_basic_info) {
      assistantContent = `好的，基本情况保持上一版不变（${read.basic_info_summary}）。\n\n若后续有变化，随时告诉我。`;
    } else {
      assistantContent = `您还没有保存过基本情况。\n\n${QUESTIONNAIRE_HINT}`;
    }
  } else if (read.has_basic_info) {
    await writeStage(sse, state, { task_key: "profile.goal.form", status: "running" });
    const remainingHint = buildRemainingGoalsHint(read);
    assistantContent = `已读取您的基本情况（${read.basic_info_summary}）。\n\n${GOAL_PICK_HINT}${remainingHint ? "\n" + remainingHint : ""}`;
    await writeStage(sse, state, { task_key: "profile.goal.form", status: "done" });
  } else {
    // 兜底：尝试解析用户文本为基本情况（支持自由文本输入）
    const previousBasicInfo =
      read.has_basic_info && supabase
        ? await getCurrentBasicInfo(supabase)
        : undefined;
    const parsed = await profileParseBasicInfo({
      text: normalized,
      previous_basic_info: previousBasicInfo ?? undefined,
    });
    if (parsed.ok && parsed.basic_info) {
      const propose = await emitProposeTool(
        state,
        sse,
        {
          kind: "profile_basic",
          basic_info: parsed.basic_info,
          card_title: "请确认：基本情况",
        },
        contentBlocks,
      );
      const note = parsed.warnings?.length
        ? "\n\n" + parsed.warnings.filter((w) => w.startsWith("已提取")).join("\n")
        : "";
      assistantContent = "我按您提供的内容整理如下，请核对后确认。" + note;
    } else {
      assistantContent = `收到。\n\n${QUESTIONNAIRE_HINT}`;
    }
    await writeStage(sse, state, { task_key: "profile.basic.form", status: "done" });
  }

  // If confirm/reset summaries were produced, prepend them to the response
  if (confirmSummary || resetSummary) {
    const parts = [confirmSummary, resetSummary].filter(Boolean);
    if (assistantContent) {
      assistantContent = parts.join("\n") + "\n\n" + assistantContent;
    } else {
      if (read.has_basic_info) {
        const progressLine = read.eligible_groups.length > 0
          ? `当前已完成 ${read.eligible_groups.map((g) => g.display_name).join("、")}`
          : "";
        const remainingHint = buildRemainingGoalsHint(read);
        assistantContent = [parts.join("\n"), progressLine, remainingHint, GOAL_PICK_HINT]
          .filter(Boolean)
          .join("\n\n");
        await writeStage(sse, state, { task_key: "profile.goal.form", status: "running" });
        await writeStage(sse, state, { task_key: "profile.goal.form", status: "done" });
      } else {
        assistantContent = parts.join("\n") + "\n\n" + QUESTIONNAIRE_HINT;
        await writeStage(sse, state, { task_key: "profile.basic.form", status: "done" });
      }
    }
  }

  await streamTextViaSse(sse, assistantContent);

  if (!contentBlocks.some((b) => b.type === "text")) {
    contentBlocks.unshift({ type: "text", text: assistantContent });
  }
  if (contentBlocks.length === 1 && contentBlocks[0]?.type === "text") {
    sse.write("content_block", contentBlocks[0]);
  }

  return { assistantContent, contentBlocks };
}

