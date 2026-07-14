/**
 * 端到端验证：Mock持仓 → 启用定时任务 → 触发tick → 验证报告+日志
 *
 * 用法: npx tsx scripts/e2e-mock-scheduled.ts
 * 前置: dev server 已启动 (npm run dev)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, rmSync } from "fs";
import { join } from "path";

// ── 1. 读取环境变量 ──────────────────────────────────
const envPath = join(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf8");
const envVars: Record<string, string> = {};
envContent.split("\n").forEach((line) => {
  const eq = line.indexOf("=");
  if (eq > 0) {
    envVars[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
});

const supabaseUrl = envVars.SUPABASE_URL;
const supabaseKey =
  envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_ANON_KEY;
const BASE_URL = envVars.SERVER_URL || "http://localhost:3000";

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ 缺少 SUPABASE_URL 或 SUPABASE key");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ── Mock 持仓数据 ────────────────────────────────────
const mockPositions = [
  {
    fund_code: "003547",
    fund_name: "鹏华丰享债券",
    invested_at: "2025-08-12",
    paid_amount: 30000,
    shares: 28412.35,
    source: "mock",
    status: "active",
  },
  {
    fund_code: "000509",
    fund_name: "广发钱袋子货币A",
    invested_at: "2025-08-12",
    paid_amount: 20000,
    shares: 20000,
    source: "mock",
    status: "active",
  },
  {
    fund_code: "161725",
    fund_name: "招商中证白酒指数(LOF)A",
    invested_at: "2026-01-08",
    paid_amount: 38500,
    shares: 32105.88,
    source: "mock",
    status: "active",
  },
  {
    fund_code: "110017",
    fund_name: "易方达增强回报债券A",
    invested_at: "2026-02-20",
    paid_amount: 50000,
    shares: 38264.22,
    source: "mock",
    status: "active",
  },
];

function log(msg: string) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

// ── 2. 插入 Mock 持仓 ────────────────────────────────
async function insertMockHoldings() {
  log("📦 插入 Mock 持仓…");

  // 检查是否已有 current 持仓
  const { data: existing } = await supabase
    .from("holdings_versions")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  if (existing) {
    log(`  已有 current 持仓 ${existing.id}，取消 current 状态…`);
    await supabase
      .from("holdings_versions")
      .update({ is_current: false })
      .eq("id", existing.id);
  }

  const { data, error } = await supabase
    .from("holdings_versions")
    .insert({
      is_current: true,
      positions: mockPositions,
      change_summary: {
        kind: "initial",
        narrative: "E2E 测试 Mock 持仓",
      },
      confirmed_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("❌ 插入失败:", error);
    process.exit(1);
  }

  log(`✅ 持仓已插入: ${data.id}`);
  return data.id;
}

// ── 3. 启用定时任务 ──────────────────────────────────
async function enableScheduledJob() {
  log("⏰ 启用定时任务…");

  // 获取当前 portfolio 任务
  const { data: job } = await supabase
    .from("scheduled_jobs")
    .select("*")
    .eq("job_type", "portfolio")
    .maybeSingle();

  if (!job) {
    // 不存在则创建
    log("  不存在 portfolio 任务，创建新任务…");
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const weekday = now.getDay();
    const { data: created } = await supabase
      .from("scheduled_jobs")
      .insert({
        job_type: "portfolio",
        enabled: true,
        schedule_kind: "weekly",
        schedule_days: [weekday],
        run_at_time: hhmm,
        last_run_at: null,
        consecutive_failures: 0,
      })
      .select()
      .single();

    if (!created) {
      console.error("❌ 创建任务失败");
      process.exit(1);
    }
    log(`✅ 任务已创建: ${created.id}`);
    return created;
  }

  // 更新为启用状态，重置连续失败计数
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const weekday = now.getDay();

  const { data: updated } = await supabase
    .from("scheduled_jobs")
    .update({
      enabled: true,
      schedule_kind: "weekly" as string,
      schedule_days: [weekday],
      run_at_time: hhmm,
      consecutive_failures: 0,
    })
    .eq("id", job.id)
    .select()
    .single();

  if (!updated) {
    console.error("❌ 启用任务失败");
    process.exit(1);
  }
    log(`✅ 任务已启用: ${updated.id} (频率=weekly, 日=${weekday}, 时间=${hhmm})`);
  return updated;
}

// ── 3.5. 清理今日已有报告（避免 skip） ──────────────
async function cleanupTodayReports() {
  log("🧹 清理今日已有 portfolio 报告…");
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  // 删除今日 portfolio 类型的 report_index
  const { data: todaysReports } = await supabase
    .from("report_index")
    .select("id, file_path")
    .eq("report_type", "portfolio")
    .gte("generated_at", `${todayIso}T00:00:00`)
    .lte("generated_at", `${todayIso}T23:59:59`);

  if (todaysReports && todaysReports.length > 0) {
    for (const r of todaysReports) {
      log(`  删除报告: ${r.id}`);
      // 删除文件
      if (r.file_path) {
        try {
          rmSync(r.file_path, { force: true });
          log(`    已删除文件: ${r.file_path}`);
        } catch {
          // 文件可能不存在，忽略
        }
      }
    }

    // 批量删除 report_index
    const { error: delError } = await supabase
      .from("report_index")
      .delete()
      .in(
        "id",
        todaysReports.map((r) => r.id),
      );

    if (delError) {
      log(`  ⚠️ 删除报告记录失败: ${delError.message}`);
    } else {
      log(`  ✅ 已清理 ${todaysReports.length} 条今日报告`);
    }
  } else {
    log("  无今日报告，无需清理");
  }

  // 同时清理今日的 scheduled_job_runs（避免旧记录干扰验证）
  const { error: runDelError } = await supabase
    .from("scheduled_job_runs")
    .delete()
    .gte("triggered_at", `${todayIso}T00:00:00`)
    .lte("triggered_at", `${todayIso}T23:59:59`);

  if (runDelError) {
    log(`  ⚠️ 清理运行日志失败: ${runDelError.message}`);
  } else {
    log(`  ✅ 已清理今日运行日志`);
  }
}

// ── 4. 触发 tick ─────────────────────────────────────
async function triggerTick(): Promise<{ action: string; runId?: string; reportId?: string }> {
  log(`🚀 触发 tick (POST ${BASE_URL}/api/scheduled-jobs/tick) …`);

  const res = await fetch(`${BASE_URL}/api/scheduled-jobs/tick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  const body = await res.text();
  log(`  响应: ${res.status} ${body.slice(0, 300)}`);

  if (!res.ok) {
    return { action: "error" };
  }

  try {
    return JSON.parse(body);
  } catch {
    return { action: "unknown" };
  }
}

// ── 5. 轮询验证 ──────────────────────────────────────
async function verifyResults() {
  log("🔍 验证结果…");

  // 5a. 查询最新一次运行日志
  const { data: runLogs } = await supabase
    .from("scheduled_job_runs")
    .select("*")
    .order("triggered_at", { ascending: false })
    .limit(5);

  log(`  运行日志 (最近${runLogs?.length ?? 0}条):`);
  if (runLogs && runLogs.length > 0) {
    runLogs.forEach((r) => {
      const status = r.status === "success" ? "✅" : r.status === "failed" ? "❌" : "⏭️";
      log(
        `  ${status} [${new Date(r.triggered_at).toLocaleString()}] status=${r.status} report=${r.report_index_id ?? "-"}`,
      );
      if (r.failure_reason) log(`    原因: ${r.failure_reason}`);
      if (r.skip_reason) log(`    原因: ${r.skip_reason}`);
    });
  }

  // 5b. 查询最新报告
  const { data: reports } = await supabase
    .from("report_index")
    .select("*")
    .eq("report_type", "portfolio")
    .order("generated_at", { ascending: false })
    .limit(3);

  log(`  报告 (最近${reports?.length ?? 0}条):`);
  if (reports && reports.length > 0) {
    reports.forEach((r) => {
      log(`  📄 [${new Date(r.generated_at).toLocaleString()}] ${r.report_name} (${r.id})`);
      log(`     文件: ${r.file_path}`);
    });
  }

  // 5c. 查询定时任务当前状态
  const { data: job } = await supabase
    .from("scheduled_jobs")
    .select("*")
    .eq("job_type", "portfolio")
    .maybeSingle();

  if (job) {
    log(`  定时任务状态:`);
    log(`    enabled: ${job.enabled}`);
    log(`    consecutive_failures: ${job.consecutive_failures}`);
    log(`    last_run_at: ${job.last_run_at ?? "从未运行"}`);
  }

  return { runLogs, reports, job };
}

// ── main ─────────────────────────────────────────────
async function main() {
  log("═══ 端到端验证：Mock持仓 → 定时任务 → 报告生成 ═══\n");

  try {
    // Step 1: Mock 持仓
    const holdingsId = await insertMockHoldings();
    console.log();

    // Step 2: 启用定时任务
    const job = await enableScheduledJob();
    console.log();

    // Step 2.5: 清理今日已有报告（避免 hasManualPortfolioReportToday skip）
    await cleanupTodayReports();
    console.log();

    // Step 3: 触发 tick
    const tickResult = await triggerTick();
    console.log();

    if (tickResult.action === "idle") {
      log("⚠️  tick 返回 idle（可能刚刚运行过），等待30秒后重试…");
      await new Promise((r) => setTimeout(r, 30_000));
      const retryResult = await triggerTick();
      console.log();
    }

    // Step 4: 等待报告生成（可能需要30-60秒，涉及LLM调用和基金数据采集）
    log("⏳ 等待报告生成（最多120秒）…");
    for (let i = 0; i < 24; i++) {
      await new Promise((r) => setTimeout(r, 5_000));

      const { data: latestRun } = await supabase
        .from("scheduled_job_runs")
        .select("status")
        .order("triggered_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestRun?.status === "success") {
        log(`✅ 报告生成成功!`);
        break;
      }
      if (latestRun?.status === "failed") {
        log("⚠️  运行状态为 failed，继续等待看是否有其他尝试…");
      }

      if (i % 3 === 2) log(`  已等待 ${(i + 1) * 5}s…`);
    }

    console.log();
    // Step 5: 验证
    await verifyResults();

    log("\n═══ 验证完成 ═══");
  } catch (error) {
    console.error("❌ 执行错误:", error);
    process.exit(1);
  }
}

main();
