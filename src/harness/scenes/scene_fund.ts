import { executeTool } from "@/harness/tools/router";

import { seedWorkflowTasks, writeStage } from "@/harness/tasks/stage";

import {

  streamTextViaSse,

} from "@/harness/stream/sse-stream";

import type {

  ContentBlock,

  ExecutionPlan,

  QueryState,

  SseWriter,

} from "@/harness/types";

import { answerFundQuestion } from "@/lib/fund/fund-qa";

import { fundLookupAsync, resolveFundCode } from "@/lib/fund/lookup";

import {

  isFundFullReportIntent,

  resolveFundCodeForFullReport,

} from "@/lib/fund/report-intent";

import { buildFundPlaceholder } from "@/lib/fund/placeholder";

import { predictFullReportNeedsEnrich, predictFullReportNeedsL3 } from "@/lib/fund/gather-plan";
import { enrichFundKnowledgeVault } from "@/harness/infra/fund_knowledge/enrich";
import { syncFundL0Local } from "@/lib/l0/l0-sync";

import type { ReportPublishCardBlock } from "@/lib/profile/types";



const FUND_HINT = buildFundPlaceholder();



const FUND_QA_KEYS = ["fund.qa.understand", "fund.qa.answer"] as const;



const FUND_FULL_KEYS_BASE = [

  "fund.prep.intent",

  "fund.prep.lookup",

  "fund.prep.l0_sync",

  "fund.prep.enrich.fetch",

  "fund.prep.enrich.index",

  "fund.gather.l0",

  "fund.gather.l1",

  "fund.gather.profile",

  "fund.rpt.draft.compose",

  "fund.rpt.wait",

] as const;

function buildFundFullTaskKeys(needsEnrich: boolean, needsL3: boolean): string[] {
  const keys: string[] = [...FUND_FULL_KEYS_BASE];
  if (!needsEnrich) {
    keys.splice(keys.indexOf("fund.prep.enrich.fetch"), 2);
  }
  if (needsL3) {
    const profileIdx = keys.indexOf("fund.gather.profile");
    keys.splice(profileIdx, 0, "fund.gather.l3");
  }
  return keys;
}



function isFundQaIntent(text: string): boolean {

  return /\d{6}/.test(text) && !isFundFullReportIntent(text);

}



async function emitAssistantText(

  sse: SseWriter,

  text: string,

  contentBlocks: ContentBlock[],

): Promise<void> {

  await streamTextViaSse(sse, text);

  if (!contentBlocks.some((b) => b.type === "text")) {

    contentBlocks.unshift({ type: "text", text });

  }

}



export async function handleSceneFund(

  state: QueryState,

  userMessage: string,

  sse: SseWriter,

  plan: ExecutionPlan,

): Promise<{

  assistantContent: string;

  contentBlocks: ContentBlock[];

}> {

  if (plan.intent !== "scene_task") {

    throw new Error("fund handler 仅处理 scene_task");

  }



  const normalized = userMessage.trim();

  const contentBlocks: ContentBlock[] = [];

  let assistantContent = "";



  const code =

    resolveFundCode(normalized) ??

    (/样例/.test(normalized) ? "019305" : null);



  // Watchlist operations (dispatched from plan steps)
  const watchlistStep = plan.steps.find(
    (s) => s.key === "fund.watchlist.add" || s.key === "fund.watchlist.remove",
  );
  if (watchlistStep) {
    const isAdd = watchlistStep.key === "fund.watchlist.add";
    if (!code) {
      assistantContent = isAdd
        ? "请告诉我您想添加的基金代码（如 019305），我再帮您加入自选。"
        : "请告诉我您想移除的基金代码，我再帮您操作。";
      await emitAssistantText(sse, assistantContent, contentBlocks);
      return { assistantContent, contentBlocks };
    }

    await seedWorkflowTasks(state, [watchlistStep.key], "pending", sse);

    await writeStage(sse, state, {
      task_key: watchlistStep.key,
      label: watchlistStep.label,
      status: "running",
    });

    const tool = await executeTool({
      tool: isAdd ? "fund_watchlist_add" : "fund_watchlist_remove",
      input: { fund_code: code },
      scene: state.scene ?? "fund",
      conversationId: state.conversationId,
      runId: state.runId,
    });

    await writeStage(sse, state, {
      task_key: watchlistStep.key,
      label: watchlistStep.label,
      status: tool.ok ? "done" : "failed",
    });

    assistantContent = tool.preview;
    await emitAssistantText(sse, assistantContent, contentBlocks);
    return { assistantContent, contentBlocks };
  }

  if (isFundQaIntent(normalized) && code) {

    await seedWorkflowTasks(state, [...FUND_QA_KEYS], "pending", sse);



    await writeStage(sse, state, {

      task_key: "fund.qa.understand",

      status: "running",

    });

    await writeStage(sse, state, {

      task_key: "fund.qa.understand",

      status: "done",

    });



    await writeStage(sse, state, {

      task_key: "fund.qa.answer",

      status: "running",

    });



    const qa = await answerFundQuestion({ fundCode: code, query: normalized });

    if (!qa.ok) {

      assistantContent = qa.error ?? "暂时无法回答该问题。";

      await writeStage(sse, state, {

        task_key: "fund.qa.answer",

        status: "failed",

      });

      await emitAssistantText(sse, assistantContent, contentBlocks);

      return { assistantContent, contentBlocks };

    }



    assistantContent = qa.answer;

    await writeStage(sse, state, {

      task_key: "fund.qa.answer",

      status: "done",

    });

    await emitAssistantText(sse, assistantContent, contentBlocks);

    return { assistantContent, contentBlocks };

  }



  if (isFundFullReportIntent(normalized)) {

    const fundCode = await resolveFundCodeForFullReport(

      normalized,

      state.conversationId,

    );

    const lookup = await fundLookupAsync({ fund_code: fundCode });

    const needsEnrich = lookup.ok ? predictFullReportNeedsEnrich(lookup) : false;
    const needsL3 = lookup.ok ? predictFullReportNeedsL3(lookup) : false;

    await seedWorkflowTasks(state, buildFundFullTaskKeys(needsEnrich, needsL3), "pending", sse);



    await writeStage(sse, state, {

      task_key: "fund.prep.intent",

      status: "running",

    });

    await writeStage(sse, state, {

      task_key: "fund.prep.intent",

      status: "done",

    });



    await writeStage(sse, state, {

      task_key: "fund.prep.lookup",

      status: "running",

    });

    if (!lookup.ok) {

      assistantContent = lookup.error ?? "无法识别基金。";

      await writeStage(sse, state, {

        task_key: "fund.prep.lookup",

        status: "failed",

      });

      await emitAssistantText(sse, assistantContent, contentBlocks);

      return { assistantContent, contentBlocks };

    }

    await writeStage(sse, state, {

      task_key: "fund.prep.lookup",

      status: "done",

    });

    await writeStage(sse, state, {
      task_key: "fund.prep.l0_sync",
      status: "running",
    });
    const l0Sync = await syncFundL0Local(fundCode);
    await writeStage(sse, state, {
      task_key: "fund.prep.l0_sync",
      status: l0Sync.ok ? "done" : "failed",
    });
    if (!l0Sync.ok) {
      assistantContent =
        l0Sync.error ??
        "同步行情与持仓失败，请检查 Tushare / AKShare 连接后重试。";
      await emitAssistantText(sse, assistantContent, contentBlocks);
      return { assistantContent, contentBlocks };
    }



    if (needsEnrich) {

      const enrich = await enrichFundKnowledgeVault({

        fundCode,

        fundName: lookup.fund_name ?? fundCode,

        fundType: lookup.fund_type,

        riskLevel: lookup.risk_level,

        onStage: async (stage) => {

          await writeStage(sse, state, stage);

        },

      });

      if (!enrich.ok && !enrich.skipped) {
        await writeStage(sse, state, {
          task_key: "fund.prep.enrich.index",
          status: "failed",
        });
      }

      const refreshed = await fundLookupAsync({ fund_code: fundCode });
      if (refreshed.ok) {
        lookup.has_vault = refreshed.has_vault;
      }
    }



    await writeStage(sse, state, {

      task_key: "fund.gather.l0",

      status: "running",

    });

    await writeStage(sse, state, {

      task_key: "fund.gather.l0",

      status: "done",

    });



    if (lookup.has_vault) {

      await writeStage(sse, state, {

        task_key: "fund.gather.l1",

        status: "running",

      });

      await executeTool({

        tool: "fund_knowledge_explore",

        input: { fund_code: fundCode, query: "投资范围 费率 风险" },

        scene: "fund",

      });

      await writeStage(sse, state, {

        task_key: "fund.gather.l1",

        status: "done",

      });

    }



    await writeStage(sse, state, {

      task_key: "fund.gather.profile",

      status: "running",

    });

    await writeStage(sse, state, {

      task_key: "fund.gather.profile",

      status: "done",

    });



    let draftStagesStarted = false;

    const draft = await executeTool({

      tool: "report_draft",

      input: { report_type: "fund", fund_code: fundCode },

      scene: "fund",

      conversationId: state.conversationId,

      runId: state.runId,

      hooks: {
        onGatherStage: async (stage) => {
          await writeStage(sse, state, stage);
        },
        onGatherComplete: async () => {
          await writeStage(sse, state, {
            task_key: "fund.rpt.draft.compose",
            status: "running",
          });
          draftStagesStarted = true;
        },
      },

    });

    if (!draft.ok || !draft.data || typeof draft.data !== "object") {

      assistantContent = draft.error ?? "生成报告草稿失败。";

      await writeStage(sse, state, {

        task_key: "fund.gather.l0",

        status: "failed",

      });

      if (draftStagesStarted) {
        await writeStage(sse, state, {

          task_key: "fund.rpt.draft.compose",

          status: "failed",

        });
      }

      await emitAssistantText(sse, assistantContent, contentBlocks);

      return { assistantContent, contentBlocks };

    }

    const d = draft.data as {

      report_name?: string;

      draft_path?: string;

      fund_code?: string;

    };



    await writeStage(sse, state, {

      task_key: "fund.rpt.draft.compose",

      status: "done",

    });



    const card: ReportPublishCardBlock = {

      type: "report_publish_card",

      status: "active",

      report_type: "fund",

      fund_code: d.fund_code ?? fundCode,

      report_name: d.report_name ?? `${fundCode} 基金解读`,

      file_path: d.draft_path,

    };

    contentBlocks.push(card);

    sse.write("content_block", card);

    await writeStage(sse, state, {

      task_key: "fund.rpt.wait",

      status: "blocked",

    });

    assistantContent = [

      `已为 **${lookup.fund_name}（${fundCode}）** 生成解读报告草稿，请核对后 **确认发布**。`,

      "",

      draft.preview?.slice(0, 400) ?? "",

    ].join("\n");

    await emitAssistantText(sse, assistantContent, contentBlocks);

    return { assistantContent, contentBlocks };

  }



  if (state.trigger === "handoff_autostart") {
    assistantContent = [
      "好的，进入**基金解读**。请告诉我基金代码或名称；若要完整报告，我会分步检索并生成草稿。",
      "",
      FUND_HINT.empty_body,
      "",
      FUND_HINT.hint,
    ].join("\n");
    await emitAssistantText(sse, assistantContent, contentBlocks);
    return { assistantContent, contentBlocks };
  }



  assistantContent = [FUND_HINT.empty_body, "", FUND_HINT.hint].join("\n");

  await emitAssistantText(sse, assistantContent, contentBlocks);

  return { assistantContent, contentBlocks };

}

