import { executeTool } from "@/harness/tools/router";
import { writeStage, seedWorkflowTasks } from "@/harness/tasks/stage";
import { streamTextViaSse } from "@/harness/stream/sse-stream";
import type {
  ContentBlock,
  ExecutionPlan,
  QueryState,
  SseWriter,
} from "@/harness/types";
import { getSupabase } from "@/lib/supabase/server";
import { holdingsRead } from "@/lib/portfolio/read";
import { loadSampleHoldingsInitial } from "@/lib/portfolio/propose";
import type { ConfirmCardBlock, ReportPublishCardBlock } from "@/lib/profile/types";
import type { HoldingsPosition } from "@/lib/portfolio/types";
import { actionLabel } from "@/lib/portfolio/types";

const PORT_HANDOFF_OPEN = "好的，我们开始**持仓分析**。";

function actionHint(userMessage?: string): string {
  const msg = userMessage ?? "";
  if (/现金分红|分红到账|红利再投|分红再投|强增|强减|份额调整/.test(msg)) {
    return "现金分红、红利再投、强增、强减等功能暂不支持。如需调整，请修改持仓表格中的买入金额或持有份额后回复。";
  }
  // 所有修改意图：复制表格 → 修改 → 回复
  return "请复制上方持仓表格，在输入框中修改后直接回复，我会为您全量更新持仓。";
}

function buildPortGuide(positions?: HoldingsPosition[], userMessage?: string): string {
  const hint = actionHint(userMessage);
  if (positions && positions.length > 0) {
    // 管道符分隔，无 Markdown 表格语法，方便用户复制修改
    const header = "基金名称 | 基金代码 | 买入时间 | 买入金额 | 持有份额";
    const rows = positions
      .map((p) => {
        const name = p.fund_name ?? p.fund_code;
        return `${name} | ${p.fund_code} | ${p.invested_at} | ${p.paid_amount.toLocaleString("zh-CN")} | ${p.shares.toLocaleString("zh-CN")}`;
      })
      .join("\n\n");
    return `${header}\n\n${rows}\n\n${hint}`;
  }
  return "暂无持仓记录。\n\n请描述您的持仓，例如：买入 110020 易方达沪深300 2024-06-01 10000元 8000份";
}

async function finishPortReply(
  sse: SseWriter,
  assistantContent: string,
  contentBlocks: ContentBlock[],
): Promise<{ assistantContent: string; contentBlocks: ContentBlock[] }> {
  await streamTextViaSse(sse, assistantContent);
  if (!contentBlocks.some((b) => b.type === "text")) {
    contentBlocks.unshift({ type: "text", text: assistantContent });
  }
  return { assistantContent, contentBlocks };
}

async function emitProposeTool(
  state: QueryState,
  sse: SseWriter,
  input: Record<string, unknown>,
  contentBlocks: ContentBlock[],
): Promise<{ ok: boolean; assistantExtra: string }> {
  const tool = await executeTool({
    tool: "holdings_propose",
    input,
    scene: "portfolio",
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

export async function handleScenePortfolio(
  state: QueryState,
  userMessage: string,
  sse: SseWriter,
  plan: ExecutionPlan,
): Promise<{
  assistantContent: string;
  contentBlocks: ContentBlock[];
}> {
  if (plan.intent !== "scene_task") {
    throw new Error("portfolio handler 仅处理 scene_task");
  }

  const supabase = await getSupabase();
  const read = await holdingsRead(supabase);
  const normalized = userMessage.trim();
  const contentBlocks: ContentBlock[] = [];
  let assistantContent = "";

  let inputStageOpen = false;
  const openPortInput = async () => {
    if (inputStageOpen) return;
    inputStageOpen = true;
    await writeStage(sse, state, {
      task_key: "port.hold.input",
      label: "起草修改方案",
      status: "running",
    });
  };
  const closePortInput = async (status: "done" | "failed" = "done") => {
    if (!inputStageOpen) return;
    inputStageOpen = false;
    await writeStage(sse, state, { task_key: "port.hold.input", label: "起草修改方案", status });
  };

  if (/^\/holdings_read\b/i.test(normalized)) {
    await openPortInput();
    const tool = await executeTool({ tool: "holdings_read", input: {}, scene: "portfolio" });
    assistantContent = tool.preview || read.summary;
    await closePortInput();
    return finishPortReply(sse, assistantContent, contentBlocks);
  }

  // ── 文字持仓录入（需含基金代码或日期才触发解析，否则走展示指引） ──
  if (
    /\b\d{6}\b/.test(normalized) ||
    /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(normalized)
  ) {
    await openPortInput();
    await writeStage(sse, state, {
      task_key: "port.hold.parse",
      status: "running",
    });
    const parsed = await executeTool({
      tool: "holdings_text_parse",
      input: { user_text: normalized },
      scene: "portfolio",
    });
    await writeStage(sse, state, {
      task_key: "port.hold.parse",
      status: parsed.ok ? "done" : "failed",
    });
    if (!parsed.ok || !parsed.data) {
      assistantContent = parsed.error ?? "文字解析失败，请确认包含基金代码、买入日期和买入金额。";
      await closePortInput("failed");
      return finishPortReply(sse, assistantContent, contentBlocks);
    }
    const data = parsed.data as {
      positions: Array<Record<string, unknown>>;
      missing_fields?: string[];
    };
    const posSummary = data.positions
      .map((p: Record<string, unknown>) => {
        const act = actionLabel(p.action as string | undefined);
        const code = p.fund_code ?? "";
        const name = p.fund_name ?? "";
        return `${act} ${code} ${name}`;
      })
      .join("; ");
    const propose = await emitProposeTool(
      state,
      sse,
      {
        kind: "holdings",
        source: "text",
        positions: data.positions,
        change_summary: {
          kind: read.has_current ? "update" : "initial",
          narrative: posSummary || "修改持仓",
          user_quote: normalized,
        },
      },
      contentBlocks,
    );
    const missingNote =
      data.missing_fields?.length
        ? `\n\n仍缺：${data.missing_fields.join("、")}，确认前请补充。`
        : "";
    const reportHint = read.has_current
      ? "\n\n若本次变更是为了重新做持仓分析，确认后可以说 **「重新分析」** 生成报告。"
      : "\n\n持仓确认后，可以说 **「重新分析」** 生成持仓分析报告。";
    assistantContent =
      (parsed.preview ?? "已整理持仓草案，请确认。") +
      missingNote +
      reportHint;
    await closePortInput();
    return finishPortReply(sse, assistantContent, contentBlocks);
  }

  // ── 有操作意图但无具体数据 → 展示持仓表格 + 操作指引 ──
  if (/新增|卖出|加仓|减仓|调仓|换仓|赎回|买入|现金分红|红利再投|强增|强减|份额调整/.test(normalized)) {
    await openPortInput();
    assistantContent = buildPortGuide(read.positions, normalized);
    await closePortInput();
    return finishPortReply(sse, assistantContent, contentBlocks);
  }

  if (/用样例持仓|样例持仓|演示持仓/.test(normalized)) {
    await openPortInput();
    const sample = loadSampleHoldingsInitial();
    const propose = await emitProposeTool(
      state,
      sse,
      sample as unknown as Record<string, unknown>,
      contentBlocks,
    );
    const reportHint = read.has_current
      ? "\n\n若本次变更是为了重新做持仓分析，确认后可以说 **「重新分析」** 生成报告。"
      : "\n\n持仓确认后，可以说 **「重新分析」** 生成持仓分析报告。";
    assistantContent =
      "我按样例整理了 **4 笔持仓**（债券、货币、白酒指数、增强回报），请核对后确认保存。" +
      reportHint;
    await closePortInput();
    return finishPortReply(sse, assistantContent, contentBlocks);
  }

  if (/重新分析|持仓分析|生成.*报告|持仓报告/.test(normalized)) {
    // 预种所有报告步骤，让进度条一开始就展示完整步骤列表（与基金解析一致的体验）
    const PORT_REPORT_STEPS = [
      "port.prep.read",
      "port.rpt.gather.l0",
      "port.rpt.draft.tpl",
      "port.rpt.draft.compose",
      "port.rpt.draft.verify",
    ];
    await seedWorkflowTasks(state, PORT_REPORT_STEPS, "pending", sse);

    await writeStage(sse, state, {
      task_key: "port.prep.read",
      status: "running",
    });

    if (!read.has_current || !read.holdings_version_id) {
      await writeStage(sse, state, {
        task_key: "port.prep.read",
        status: "failed",
      });
      assistantContent =
        "当前还没有确认的持仓。请先描述您的持仓（基金代码、买入日期、买入金额）。";
      return finishPortReply(sse, assistantContent, contentBlocks);
    }

    await writeStage(sse, state, {
      task_key: "port.prep.read",
      status: "done",
    });

    // ── 阶段 2: gather.l0 ──
    await writeStage(sse, state, {
      task_key: "port.rpt.gather.l0",
      status: "running",
    });
    await writeStage(sse, state, {
      task_key: "port.rpt.gather.l0",
      status: "done",
    });

    // ── 阶段 3: draft.tpl ──
    await writeStage(sse, state, {
      task_key: "port.rpt.draft.tpl",
      status: "running",
    });

    const draft = await executeTool({
      tool: "report_draft",
      input: {
        report_type: "portfolio",
        holdings_version_id: read.holdings_version_id,
      },
      scene: "portfolio",
      conversationId: state.conversationId,
      runId: state.runId,
    });

    if (!draft.ok || !draft.data || typeof draft.data !== "object") {
      assistantContent = draft.error ?? "生成持仓报告草稿失败。";
      await writeStage(sse, state, {
        task_key: "port.rpt.draft.tpl",
        status: "failed",
      });
      return finishPortReply(sse, assistantContent, contentBlocks);
    }
    const d = draft.data as {
      report_name?: string;
      draft_path?: string;
      holdings_version_id?: string;
    };
    await writeStage(sse, state, {
      task_key: "port.rpt.draft.tpl",
      status: "done",
    });

    // ── 阶段 4: draft.compose ──
    await writeStage(sse, state, {
      task_key: "port.rpt.draft.compose",
      status: "running",
    });
    await writeStage(sse, state, {
      task_key: "port.rpt.draft.compose",
      status: "done",
    });

    // ── 阶段 5: draft.verify ──
    await writeStage(sse, state, {
      task_key: "port.rpt.draft.verify",
      status: "running",
    });
    await writeStage(sse, state, {
      task_key: "port.rpt.draft.verify",
      status: "done",
    });

    const card: ReportPublishCardBlock = {
      type: "report_publish_card",
      status: "active",
      report_type: "portfolio",
      holdings_version_id: d.holdings_version_id ?? read.holdings_version_id,
      report_name: d.report_name ?? "持仓分析报告",
      file_path: d.draft_path,
    };
    contentBlocks.push(card);
    sse.write("content_block", card);
    assistantContent = "";
    return finishPortReply(sse, assistantContent, contentBlocks);
  }

  if (state.trigger === "handoff_autostart") {
    assistantContent = read.has_current
      ? PORT_HANDOFF_OPEN + "\n\n" + buildPortGuide(read.positions) +
        (read.has_current ? "\n\n若不变，可以说 **「重新分析」** 生成持仓分析报告。" : "")
      : PORT_HANDOFF_OPEN + "\n\n" + buildPortGuide(read.positions);
    return finishPortReply(sse, assistantContent, contentBlocks);
  }

  if (/录入|持仓|修改|开始/.test(normalized)) {
    await openPortInput();
    assistantContent = buildPortGuide(read.positions, normalized);
    await closePortInput();
    return finishPortReply(sse, assistantContent, contentBlocks);
  }

  assistantContent = buildPortGuide(read.positions, normalized);
  await openPortInput();
  await closePortInput();
  return finishPortReply(sse, assistantContent, contentBlocks);
}
