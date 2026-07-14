import {
  createBackgroundJob,
  finishBackgroundJob,
} from "@/harness/background";
import { createRunId, ensureRunWorkspace } from "@/harness/runs/workspace";
import { runReportDraft } from "@/harness/tools/report_draft";
import { holdingsRead } from "@/lib/portfolio/read";
import { getSupabase } from "@/lib/supabase/server";
import { resolveAsOfTradeDate } from "@/lib/scheduled/calendar";
import {
  getPortfolioScheduledJob,
  hasManualPortfolioReportToday,
  recordScheduledJobRun,
} from "@/lib/scheduled/jobs";
import {
  formatLocalDateKey,
  toShanghaiDateString,
} from "@/lib/scheduled/tick-logic";
import {
  isAnyWorkflowLockHeld,
  releaseWorkflowLock,
  tryAcquireWorkflowLock,
} from "@/harness/locks/store";
import fs from "node:fs";

export interface ScheduledTickResult {
  action: "idle" | "skipped" | "success" | "failed";
  reason?: string;
  run_id?: string;
  report_id?: string;
}

let portfolioJobRunning = false;

export async function runScheduledPortfolioJob(
  now = new Date(),
  opts?: { force?: boolean },
): Promise<ScheduledTickResult> {
  if (portfolioJobRunning) {
    return { action: "skipped", reason: "已有定时任务在运行。" };
  }

  if (await isAnyWorkflowLockHeld()) {
    return { action: "skipped", reason: "手动写流程进行中，跳过本次定时任务。" };
  }

  const supabase = await getSupabase();
  if (!supabase) {
    return { action: "failed", reason: "数据库未连接。" };
  }

  const job = await getPortfolioScheduledJob();
  const holdings = await holdingsRead(supabase);
  if (!holdings.has_current || !holdings.holdings_version_id) {
    await supabase
      .from("scheduled_jobs")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("job_type", "portfolio");
    return { action: "failed", reason: "当前无持仓，已自动关闭定时任务。" };
  }

  const localDate = formatLocalDateKey(now);
  if (!opts?.force && (await hasManualPortfolioReportToday(localDate))) {
    await recordScheduledJobRun({
      jobId: job.id,
      status: "skipped",
      skipReason: "当日已有手动分析，行情相同不再重复生成",
      asOfTradeDate: await resolveAsOfTradeDate(toShanghaiDateString(now)),
    });
    return {
      action: "skipped",
      reason: "当日已有手动分析报告。",
    };
  }

  portfolioJobRunning = true;
  try {
    const asOfTradeDate = await resolveAsOfTradeDate(toShanghaiDateString(now));
    const conversationTitle = `定时持仓分析 · ${localDate}`;

    const { data: currentHoldings } = await supabase
      .from("holdings_versions")
      .select("positions")
      .eq("id", holdings.holdings_version_id)
      .single();
    const positions = ((currentHoldings?.positions ?? []) as Array<{ fund_name?: string; fund_code?: string; market_value?: number }>);
    const totalMv = positions.reduce((s, p) => s + (Number(p.market_value) || 0), 0);
    const qdiiMv = positions
      .filter((p) => /QDII/i.test(`${p.fund_name ?? ""} ${p.fund_code ?? ""}`))
      .reduce((s, p) => s + (Number(p.market_value) || 0), 0);
    const qdiiNote =
      totalMv > 0 && qdiiMv / totalMv >= 0.3
        ? "部分 QDII 基金净值披露节奏可能与 A 股交易日不同，本报告已取各持仓共同可用的最近截止日。"
        : undefined;

    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .insert({
        title: conversationTitle,
        conversation_type: "portfolio",
        metadata: {
          type_locked: true,
          active_tab: "portfolio",
          has_unconfirmed: false,
          scheduled_run: true,
        },
      })
      .select("id")
      .single();

    if (convError || !conv?.id) {
      await recordScheduledJobRun({
        jobId: job.id,
        status: "failed",
        failureReason: convError?.message ?? "创建后台对话失败",
        asOfTradeDate,
      });
      return { action: "failed", reason: convError?.message ?? "创建对话失败" };
    }

    const conversationId = conv.id as string;
    const runId = createRunId();
    ensureRunWorkspace(conversationId, runId);

    const lockAcquired = await tryAcquireWorkflowLock("portfolio", conversationId);
    if (!lockAcquired) {
      await recordScheduledJobRun({
        jobId: job.id,
        status: "skipped",
        skipReason: "写流程互斥锁被占用",
        asOfTradeDate,
      });
      return { action: "skipped", reason: "写流程进行中，跳过本次定时任务。" };
    }

    try {
    const bgJob = await createBackgroundJob({
      conversationId,
      runId,
      jobType: "scheduled",
    });

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: "请基于当前持仓生成持仓分析报告",
      metadata: { scene: "portfolio", scheduled: true },
    });

    const draft = await runReportDraft(
      {
        report_type: "portfolio",
        holdings_version_id: holdings.holdings_version_id,
      },
      { conversationId, runId },
    );

    if (!draft.ok || !draft.data || typeof draft.data !== "object") {
      if (bgJob) await finishBackgroundJob(bgJob.id, "failed");
      await recordScheduledJobRun({
        jobId: job.id,
        status: "failed",
        conversationId,
        failureReason: draft.error ?? "生成报告草稿失败",
        asOfTradeDate,
      });
      return { action: "failed", reason: draft.error ?? "生成草稿失败" };
    }

    const d = draft.data as {
      draft_path?: string;
      holdings_version_id?: string;
      report_name?: string;
    };

    if (qdiiNote && d.draft_path && fs.existsSync(d.draft_path)) {
      const original = fs.readFileSync(d.draft_path, "utf8");
      fs.writeFileSync(d.draft_path, `> ${qdiiNote}\n\n${original}`, "utf8");
    }

    const { publishPortfolioReport } = await import("@/lib/portfolio/report-publish");
    const published = await publishPortfolioReport(supabase, {
      conversationId,
      holdingsVersionId:
        d.holdings_version_id ?? holdings.holdings_version_id,
      draftPath: d.draft_path,
      triggerSource: "scheduled",
      asOfTradeDate,
    });

    if (!published.ok) {
      if (bgJob) await finishBackgroundJob(bgJob.id, "failed");
      await recordScheduledJobRun({
        jobId: job.id,
        status: "failed",
        conversationId,
        failureReason: published.error ?? "发布报告失败",
        asOfTradeDate,
      });
      return { action: "failed", reason: published.error ?? "发布失败" };
    }

    if (bgJob) await finishBackgroundJob(bgJob.id, "done");

    const run = await recordScheduledJobRun({
      jobId: job.id,
      status: "success",
      conversationId,
      reportIndexId: published.report_id ?? null,
      asOfTradeDate,
      reportName: d.report_name ?? `持仓分析报告-${localDate}`,
    });

    await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: `定时持仓分析已完成，报告已写入「我的报告 · 持仓分析」（数据截至 ${asOfTradeDate} 最近交易日）。`,
      metadata: { scene: "portfolio", scheduled: true, report_id: published.report_id },
    });

    return {
      action: "success",
      run_id: run.id,
      report_id: published.report_id,
    };
    } finally {
      await releaseWorkflowLock(conversationId);
    }
  } finally {
    portfolioJobRunning = false;
  }
}
