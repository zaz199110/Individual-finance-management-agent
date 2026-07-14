import type { SceneId } from "@/harness/registry/load";
import { attachmentsToImageUrls } from "@/harness/attachments";
import { CAPABILITY_REPLY } from "@/harness/planner/planner";
import { emitHook } from "@/harness/hooks";
import { writeStage } from "@/harness/tasks/stage";
import { executeTool } from "@/harness/tools/router";
import { callVisionGeneralQa } from "@/harness/tools/vision_parse";
import {
  staticReply,
  streamChatCompletionWithRetry,
} from "@/harness/llm/client";
import { throwIfAborted } from "@/lib/chat/stop-generation";
import { answerFundQuestion } from "@/lib/fund/fund-qa";
import { resolveFundCode } from "@/lib/fund/lookup";
import { isFundFullReportIntent } from "@/lib/fund/report-intent";
import type { HoldingsPosition } from "@/lib/portfolio/types";
import {
  handoffCrossSceneAskText,
  handoffPortfolioScreenshotSuffix,
} from "@/lib/handoff/copy";
import { SCENE_LABELS } from "@/lib/handoff/constants";
import type {
  ContentBlock,
  ExecutionPlan,
  ExecutionPlanStep,
  QueryState,
  SseWriter,
} from "@/harness/types";

function isCapabilityQuestion(text: string): boolean {
  return /你能做什么|你会什么|有什么功能|能帮我什么/.test(text);
}

function needsWebSearch(text: string): boolean {
  // 明确要求联网搜索
  if (/联网|搜索|查一下|帮我查/.test(text)) return true;

  // 时效性意图：含时间标记词即触发（宁多勿漏）
  const hasTimeMarker =
    /今天|今日|昨日|昨天|前天|最近|近期|这几天|这两天|本周|上周|这周|本月|上个月|近一个月|近两个月|近三个月|半年|今年|去年|刚刚|实时|最新|目前|当前|当下|此刻/.test(
      text,
    ) ||
    /\d{4}[年\-/]/.test(text) || // 2026年、2026-01、2026/06 等年份提及
    /近\d+[天周月年]/.test(text); // 近一周、近一个月、近半年 等

  if (hasTimeMarker) return true;

  // 精确实时数据：需要具体标的 + 价格/点位/收盘等关键词
  const hasPreciseDataIntent = /多少|涨跌|收盘|开盘|点|元|股价|指数/.test(text);
  if (hasPreciseDataIntent && hasTimeMarker) return true;

  // "行情" 需要结合具体标的才触发，避免泛知识问题误触发
  if (/行情/.test(text) && /股|基金|大盘|指数/.test(text)) return true;

  return false;
}

function needsFundDataLookup(scene: SceneId, text: string): boolean {
  if (scene !== "fund") return false;
  if (isFundFullReportIntent(text)) return false;
  return (
    Boolean(resolveFundCode(text)) ||
    /管理费|业绩|净值|回撤|费率|持仓|风险|适合|基金经理|规模|分红/.test(text)
  );
}

async function writePlanStep(
  state: QueryState,
  step: ExecutionPlanStep,
  sse: SseWriter,
  status: "running" | "done" | "failed",
): Promise<void> {
  await writeStage(sse, state, {
    task_key: step.key,
    label: step.label,
    status,
  });
}

/** 卡片/跳转等路径：逐步快速标记完成 */
async function finishSteps(
  state: QueryState,
  plan: ExecutionPlan,
  sse: SseWriter,
): Promise<void> {
  for (const step of plan.steps) {
    await writePlanStep(state, step, sse, "running");
    await writePlanStep(state, step, sse, "done");
  }
}

/** 短问：先完成「理解」，再检索，最后「组织回答」 */
async function runUnderstandStep(
  state: QueryState,
  plan: ExecutionPlan,
  sse: SseWriter,
): Promise<void> {
  if (plan.steps.length <= 1) return;
  await writePlanStep(state, plan.steps[0], sse, "running");
  await writePlanStep(state, plan.steps[0], sse, "done");
}

async function runFundDataLookup(
  userMessage: string,
  hookReminders: string[],
): Promise<void> {
  const code = resolveFundCode(userMessage);
  if (!code) return;

  const qa = await answerFundQuestion({ fundCode: code, query: userMessage });
  if (qa.ok && qa.answer) {
    hookReminders.push(
      `基金资料检索结果（本轮参考，勿原样复制）：\n${qa.answer}`,
    );
  }
}

async function runWebSearch(
  state: QueryState,
  userMessage: string,
  sse: SseWriter,
  hookReminders: string[],
): Promise<Array<{ title: string; url: string }> | undefined> {
  await writeStage(sse, state, {
    task_key: "web_search",
    status: "running",
  });

  const pre = await emitHook("PreToolUse", {
    event: "PreToolUse",
    conversationId: state.conversationId,
    runId: state.runId,
    scene: state.scene,
    toolName: "web_search",
    toolInput: { query: userMessage },
  });
  if (pre.blocked) {
    throw new Error(pre.blockReason ?? "联网检索被拦截。");
  }

  const toolResult = await executeTool({
    tool: "web_search",
    input: { query: userMessage },
    scene: state.scene,
  });

  await emitHook("PostToolUse", {
    event: "PostToolUse",
    conversationId: state.conversationId,
    runId: state.runId,
    scene: state.scene,
    toolName: "web_search",
    toolResultPreview: toolResult.preview,
  });

  if (toolResult.ok && toolResult.data) {
    hookReminders.push(
      `联网检索摘要（勿写入 system block，仅本轮参考）：\n${toolResult.preview}`,
      "重要：本轮已获取联网检索结果，请直接基于检索结果回答用户问题，不要拒绝或说无法提供。用户的问题与金融市场、基金、投资相关时均应积极回答。\n\n回答格式要求：\n1. 使用 Markdown 标题（##）、分段和列表组织内容，让回答层次清晰\n2. 关键数据、涨跌幅、时间节点等用**加粗**突出\n3. 避免大段连续无格式文字，每个要点独立成段\n4. 面向C端普通投资者，语言通俗易懂，专业术语做简要解释",
    );
    await writeStage(sse, state, { task_key: "web_search", status: "done" });
    return toolResult.citations;
  }

  await writeStage(sse, state, { task_key: "web_search", status: "failed" });
  hookReminders.push(
    '联网检索未返回有效结果，请根据你已有的知识尽力回答用户问题，不要说\u201c查不到\u201d或\u201c无法检索\u201d。',
  );
  return undefined;
}

function formatHoldingsPreview(positions: HoldingsPosition[]): string {
  const header = "| 基金代码 | 基金名称 | 买入日期 | 金额（元） |";
  const sep = "| --- | --- | --- | --- |";
  const rows = positions.map((p) => {
    const date =
      p.invested_at && p.invested_at !== "1970-01-01" ? p.invested_at : "—";
    const amount = p.paid_amount > 0 ? String(p.paid_amount) : "—";
    return `| ${p.fund_code} | ${p.fund_name ?? "—"} | ${date} | ${amount} |`;
  });
  return [header, sep, ...rows].join("\n");
}

/** CH-10 / 通用发图：先 Vision，持仓截图走跳转卡，其余注入本轮推理 */
async function processImageAttachments(
  state: QueryState,
  userMessage: string,
  sse: SseWriter,
): Promise<{
  handled: boolean;
  assistantContent?: string;
  contentBlocks?: ContentBlock[];
}> {
  const imageUrls = attachmentsToImageUrls(state.attachments);
  if (!imageUrls.length) return { handled: false };

  await writeStage(sse, state, {
    task_key: "vision_parse",
    label: "识别图片",
    status: "running",
  });

  const pre = await emitHook("PreToolUse", {
    event: "PreToolUse",
    conversationId: state.conversationId,
    runId: state.runId,
    scene: state.scene,
    toolName: "vision_parse",
    toolInput: { image_count: imageUrls.length },
  });
  if (pre.blocked) {
    throw new Error(pre.blockReason ?? "图片识别被拦截。");
  }

  const parsed = await executeTool({
    tool: "vision_parse",
    input: { image_urls: imageUrls, user_hint: userMessage },
    scene: state.scene,
  });

  await emitHook("PostToolUse", {
    event: "PostToolUse",
    conversationId: state.conversationId,
    runId: state.runId,
    scene: state.scene,
    toolName: "vision_parse",
    toolResultPreview: parsed.preview,
  });

  await writeStage(sse, state, {
    task_key: "vision_parse",
    label: "识别图片",
    status: "done",
  });

  const positions =
    parsed.ok && parsed.data && typeof parsed.data === "object"
      ? ((parsed.data as { positions?: HoldingsPosition[] }).positions ?? [])
      : [];

  if (positions.length > 0) {
    const table = formatHoldingsPreview(positions);
    const askText = [
      "识别到以下持仓：",
      "",
      table,
      "",
      handoffPortfolioScreenshotSuffix(),
    ].join("\n");
    const contentBlocks: ContentBlock[] = [
      { type: "text", text: askText },
      {
        type: "handoff_card",
        target_scene: "portfolio",
        target_label: SCENE_LABELS.portfolio,
        status: "pending",
      },
    ];
    return { handled: true, assistantContent: askText, contentBlocks };
  }

  const general = await callVisionGeneralQa(imageUrls, userMessage);
  if (general.ok && general.text) {
    const contentBlocks: ContentBlock[] = [{ type: "text", text: general.text }];
    return { handled: true, assistantContent: general.text, contentBlocks };
  }

  const err =
    general.error ??
    parsed.error ??
    "图片识别失败，请换清晰截图或改用文字描述。";
  const failText = `图片识别未成功：${err}`;
  const contentBlocks: ContentBlock[] = [{ type: "text", text: failText }];
  return { handled: true, assistantContent: failText, contentBlocks };
}

export async function handleSceneChat(
  state: QueryState,
  userMessage: string,
  sse: SseWriter,
  plan: ExecutionPlan,
): Promise<{
  plan: ExecutionPlan;
  assistantContent: string;
  contentBlocks: ContentBlock[];
  citations?: Array<{ title: string; url: string }>;
}> {
  if (plan.intent === "cross_scene_handoff" && plan.target_scene) {
    const targetLabel = SCENE_LABELS[plan.target_scene];
    const askText = handoffCrossSceneAskText(plan.target_scene);

    const contentBlocks: ContentBlock[] = [
      { type: "text", text: askText },
      {
        type: "handoff_card",
        target_scene: plan.target_scene,
        target_label: targetLabel,
        status: "pending",
      },
    ];

    for (const block of contentBlocks) {
      sse.write("content_block", block);
    }

    await finishSteps(state, plan, sse);
    return { plan, assistantContent: askText, contentBlocks };
  }

  let assistantContent = "";
  let citations: Array<{ title: string; url: string }> | undefined;
  const hookReminders: string[] = [...(state.promptReminders ?? [])];

  const visionResult = await processImageAttachments(
    state,
    userMessage,
    sse,
  );
  if (visionResult.handled && visionResult.contentBlocks && visionResult.assistantContent) {
    for (const block of visionResult.contentBlocks) {
      sse.write("content_block", block);
    }
    await finishSteps(state, plan, sse);
    return {
      plan,
      assistantContent: visionResult.assistantContent,
      contentBlocks: visionResult.contentBlocks,
    };
  }

  if (isCapabilityQuestion(userMessage)) {
    const capStep = plan.steps[0] ?? {
      key: "capability",
      label: "介绍能力",
      status: "pending" as const,
    };
    await writePlanStep(state, capStep, sse, "running");
    assistantContent = CAPABILITY_REPLY;
    for await (const chunk of staticReply(CAPABILITY_REPLY)) {
      throwIfAborted(state.abortSignal);
      if (chunk.type === "text_delta" && chunk.text) {
        sse.write("token_delta", { text: chunk.text });
      }
    }
    await writePlanStep(state, capStep, sse, "done");
  } else {
    const lastStep = plan.steps[plan.steps.length - 1] ?? {
      key: "answer",
      label: "组织回答",
      status: "pending" as const,
    };

    await runUnderstandStep(state, plan, sse);

    let answerStarted = false;

    if (needsWebSearch(userMessage)) {
      citations = await runWebSearch(state, userMessage, sse, hookReminders);
    } else if (needsFundDataLookup(state.scene, userMessage)) {
      await writePlanStep(state, lastStep, sse, "running");
      answerStarted = true;
      await runFundDataLookup(userMessage, hookReminders);
    }

    if (!answerStarted) {
      await writePlanStep(state, lastStep, sse, "running");
    }

    for await (const chunk of streamChatCompletionWithRetry(state, hookReminders)) {
      throwIfAborted(state.abortSignal);
      if (chunk.type === "text_delta" && chunk.text) {
        assistantContent += chunk.text;
        sse.write("token_delta", { text: chunk.text });
      }
    }

    if (plan.steps.length >= 1) {
      await writePlanStep(state, lastStep, sse, "done");
    }
  }

  const contentBlocks: ContentBlock[] = [{ type: "text", text: assistantContent }];
  sse.write("content_block", contentBlocks[0]);

  return { plan, assistantContent, contentBlocks, citations };
}
