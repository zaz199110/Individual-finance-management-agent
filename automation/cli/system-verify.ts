/**
 * Pre-manual system verification — maps to docs/MANUAL-VERIFICATION.md sections.
 * Usage: npx tsx automation/cli/system-verify.ts [--base-url http://localhost:3000]
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadTestEnv } from "../tests/helpers/load-env";
import { resolvePythonCommand } from "../lib/resolve-python";

loadTestEnv(true);

type Status = "pass" | "fail" | "skip" | "warn";

interface CaseResult {
  id: string;
  title: string;
  status: Status;
  detail: string;
}

const results: CaseResult[] = [];
const root = process.cwd();
const baseUrl =
  process.argv.find((a) => a.startsWith("--base-url="))?.split("=")[1] ??
  process.env.VERIFY_BASE_URL ??
  "http://localhost:3000";

function record(
  id: string,
  title: string,
  status: Status,
  detail: string,
): void {
  results.push({ id, title, status, detail });
  const icon =
    status === "pass"
      ? "OK"
      : status === "fail"
        ? "FAIL"
        : status === "warn"
          ? "WARN"
          : "SKIP";
  console.log(`[${icon}] ${id} ${title}${detail ? ` — ${detail}` : ""}`);
}

async function fetchJson(
  url: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown; error?: string }> {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* plain text */
    }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      body: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function checkEnv0(): void {
  const dataDir = path.join(root, "data");
  const runsDir = path.join(dataDir, "runs");
  const vaultDir = path.join(dataDir, "fund-knowledge");

  if (!fs.existsSync(dataDir) || !fs.existsSync(runsDir)) {
    record("0-1", "数据目录", "fail", "缺少 data/ 或 data/runs/");
  } else {
    const vaultCount = fs.existsSync(vaultDir)
      ? fs.readdirSync(vaultDir).filter((n) => /^\d{6}-/.test(n)).length
      : 0;
    record(
      "0-1",
      "数据目录",
      vaultCount > 0 ? "pass" : "warn",
      vaultCount > 0
        ? `fund-knowledge ${vaultCount} 个基金目录`
        : "vault 为空（可运行 npm run data:init）",
    );
  }

  const envLocal = path.join(root, ".env.local");
  if (!fs.existsSync(envLocal)) {
    record("0-1", ".env.local", "fail", "未找到 .env.local");
  } else {
    record("0-1", ".env.local", "pass", "存在");
  }

  try {
    const tracked = execSync("git ls-files .env.local", {
      cwd: root,
      encoding: "utf8",
    }).trim();
    if (tracked) {
      record("0-1", ".env.local gitignore", "fail", ".env.local 被 git 跟踪");
    } else {
      record("0-1", ".env.local gitignore", "pass", "未纳入版本库");
    }
  } catch {
    record("0-1", ".env.local gitignore", "skip", "非 git 仓库或 git 不可用");
  }

  try {
    const py = resolvePythonCommand();
    const reg = spawnSync(
      py[0],
      [...py.slice(1), "automation/scripts/validate_registry.py"],
      { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    if (reg.status !== 0) {
      throw new Error(reg.stderr || reg.stdout || "validate_registry failed");
    }
    record("REG", "registry.yaml", "pass", "validate_registry.py OK");
  } catch (e) {
    record(
      "REG",
      "registry.yaml",
      "fail",
      e instanceof Error ? e.message : "validate_registry 失败",
    );
  }
}

async function checkReadiness(): Promise<void> {
  const { getReadiness } = await import("@/lib/settings/readiness");
  const r = await getReadiness();
  if (r.models.chat_ready && r.database.ready) {
    record("0-2", "就绪状态", "pass", "chat_ready + database.ready");
  } else if (r.models.chat_ready) {
    record(
      "0-2",
      "就绪状态",
      "warn",
      `模型就绪；数据库 ${r.database.check_status} — 场景 Tab 可能受限`,
    );
  } else {
    record(
      "0-2",
      "就绪状态",
      "warn",
      r.banners[0] ?? "模型或数据库未就绪（人工验证前请完成设置探活）",
    );
  }
}

async function checkInProcessApis(): Promise<void> {
  const { GET: getCommands } = await import("@/app/api/commands/route");
  const { NextRequest } = await import("next/server");

  for (const scene of ["chat", "profile", "plan", "portfolio", "fund"] as const) {
    const req = new NextRequest(
      `http://localhost/api/commands?scene=${scene}&slash_only=true`,
    );
    const res = await getCommands(req);
    const body = (await res.json()) as { commands?: unknown[] };
    record(
      "1-3",
      `commands scene=${scene}`,
      res.status === 200 && Array.isArray(body.commands) ? "pass" : "fail",
      `status=${res.status} count=${body.commands?.length ?? 0}`,
    );
  }

  const { GET: getPlaceholder } = await import("@/app/api/placeholder/route");
  for (const scene of ["profile", "plan", "portfolio", "fund"] as const) {
    const req = new NextRequest(`http://localhost/api/placeholder?scene=${scene}`);
    const res = await getPlaceholder(req);
    record(
      "1-3",
      `placeholder scene=${scene}`,
      res.status === 200 ? "pass" : "fail",
      `status=${res.status}`,
    );
  }

  const { GET: getReports } = await import("@/app/api/reports/route");
  for (const tab of ["profile", "plan", "portfolio", "fund"] as const) {
    const reportsRes = await getReports(
      new NextRequest(`http://localhost/api/reports?tab=${tab}`),
    );
    const reportsBody = (await reportsRes.json()) as {
      error?: string;
      reports?: unknown[];
    };
    record(
      "8-1",
      `GET /api/reports?tab=${tab}`,
      reportsRes.status === 200
        ? "pass"
        : reportsBody.error?.includes("report_index")
          ? "warn"
          : reportsRes.status === 503
            ? "warn"
            : "fail",
      reportsRes.status === 200
        ? `status=${reportsRes.status} count=${reportsBody.reports?.length ?? 0}`
        : `${reportsRes.status} ${reportsBody.error ?? ""}`.trim(),
    );
  }

  const { GET: getDbSettings } = await import("@/app/api/settings/database/route");
  const dbRes = await getDbSettings();
  const dbBody = (await dbRes.json()) as { configured?: boolean };
  record(
    "2-2",
    "GET /api/settings/database",
    dbRes.status === 200 ? "pass" : "fail",
    dbRes.status === 200
      ? `configured=${String(dbBody.configured)}`
      : `status=${dbRes.status}`,
  );

  const { GET: searchFunds } = await import("@/app/api/funds/search/route");
  const fundSearchRes = await searchFunds(
    new NextRequest("http://localhost/api/funds/search?q=019305"),
  );
  const fundSearchBody = (await fundSearchRes.json()) as { results?: unknown[] };
  record(
    "7-1",
    "GET /api/funds/search",
    fundSearchRes.status === 200 && Array.isArray(fundSearchBody.results)
      ? "pass"
      : "fail",
    `status=${fundSearchRes.status} count=${fundSearchBody.results?.length ?? 0}`,
  );

  const { POST: postTick } = await import("@/app/api/scheduled-jobs/tick/route");
  const tickRes = await postTick();
  const tickBody = (await tickRes.json()) as { checked?: boolean };
  record(
    "9-2",
    "POST /api/scheduled-jobs/tick",
    tickRes.status === 200 && typeof tickBody.checked === "boolean"
      ? "pass"
      : "fail",
    `status=${tickRes.status} checked=${String(tickBody.checked)}`,
  );

  const { GET: getHoldings } = await import("@/app/api/portfolio/holdings/route");
  const holdRes = await getHoldings();
  record(
    "6-1",
    "GET /api/portfolio/holdings",
    holdRes.status === 200 ? "pass" : "fail",
    `status=${holdRes.status}`,
  );

  const { GET: getWatchlist } = await import("@/app/api/fund-watchlist/route");
  const wlRes = await getWatchlist();
  record(
    "7-3",
    "GET /api/fund-watchlist",
    wlRes.status === 200 ? "pass" : "fail",
    `status=${wlRes.status}`,
  );

  try {
    const { buildVaultTree } = await import(
      "@/harness/infra/fund_knowledge/vault-tree"
    );
    const { getFundKnowledgeContext } = await import("@/lib/fund-knowledge/context");
    const ctx = getFundKnowledgeContext();
    const tree = buildVaultTree(ctx.vaultRoot, true);
    record(
      "10-1",
      "fund-knowledge vault tree",
      "pass",
      `${tree.funds.length} 个基金节点`,
    );
  } catch (e) {
    record(
      "10-1",
      "fund-knowledge vault tree",
      "fail",
      e instanceof Error ? e.message : String(e),
    );
  }

  const { GET: getFkTree } = await import("@/app/api/fund-knowledge/tree/route");
  const fkRes = await getFkTree(new NextRequest("http://localhost/api/fund-knowledge/tree"));
  const fkBody = (await fkRes.json()) as { code?: string };
  record(
    "10-1",
    "GET /api/fund-knowledge/tree",
    fkRes.status === 200 ? "pass" : "fail",
    fkRes.status === 200 ? `status=${fkRes.status}` : `${fkRes.status} ${fkBody.code ?? ""}`,
  );

  const { GET: getScheduled } = await import("@/app/api/scheduled-jobs/route");
  const schRes = await getScheduled();
  record(
    "9-1",
    "GET /api/scheduled-jobs",
    schRes.status === 200 ? "pass" : "fail",
    `status=${schRes.status}`,
  );
}

async function runFundDraftVerify(input: {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  convId: string;
  runId: string;
  fundCode: string;
  hasVault: boolean;
  casePrefix: string;
  skipL3: boolean;
}): Promise<void> {
  const { draftFundReport } = await import("@/lib/fund/report-draft");
  const { verifyFundReportDraft } = await import("@/lib/fund/report-verify");
  const { getDraftReportPath } = await import("@/lib/reports/draft-path");

  const draft = await draftFundReport(input.supabase, {
    fundCode: input.fundCode,
    conversationId: input.convId,
    runId: input.runId,
    skip_l3: input.skipL3,
  });

  const expectedPath = getDraftReportPath(input.convId, input.runId);
  const pathOk =
    draft.ok &&
    draft.draft_path === expectedPath &&
    fs.existsSync(expectedPath);
  record(
    `${input.casePrefix}1`,
    `${input.fundCode} 草稿路径`,
    pathOk ? "pass" : "fail",
    pathOk ? expectedPath : draft.error ?? "路径不一致或文件缺失",
  );

  const metaPath = path.join(path.dirname(expectedPath), "draft-meta.json");
  record(
    `${input.casePrefix}1`,
    `${input.fundCode} draft-meta.json`,
    fs.existsSync(metaPath) ? "pass" : "fail",
    metaPath,
  );

  if (draft.draft_path) {
    const verify = verifyFundReportDraft({
      draftPath: draft.draft_path,
      fundCode: input.fundCode,
      hasVault: input.hasVault,
    });
    record(
      `${input.casePrefix}2`,
      `${input.fundCode} FK-18 Verify`,
      verify.ok ? "pass" : "fail",
      verify.ok
        ? `${verify.echarts_count} 张图`
        : verify.errors.slice(0, 3).join("；"),
    );

    const md = fs.readFileSync(draft.draft_path, "utf8");
    const banned = [
      /\bL0\b/,
      /\bL1\b/,
      /\bL2\b/,
      /\bL3\b/,
      /KB-03/,
      /chunk_id/,
      /\bRAG\b/,
      /pgvector/,
      /\bArchetype\b/i,
    ];
    const hits = banned
      .filter((re) => re.test(md))
      .map((re) => re.source);
    record(
      input.casePrefix === "C" ? "7-2" : "7-2b",
      `${input.fundCode} 草稿无内部术语`,
      hits.length === 0 ? "pass" : "fail",
      hits.length === 0 ? "对客文案干净" : `命中: ${hits.join(", ")}`,
    );
  }
}

async function checkL0SyncLog(): Promise<void> {
  const { syncFundL0Local, readLatestL0SyncLogDb } = await import(
    "@/lib/l0/l0-sync"
  );
  const probeCode = "206007";
  const sync = await syncFundL0Local(probeCode);
  record(
    "L0-1",
    "l0_sync 本地缓存",
    sync.ok ? "pass" : "fail",
    sync.ok
      ? `lookup=${sync.snapshot?.lookup_source ?? "?"}`
      : sync.error ?? "sync 失败",
  );

  const dbLog = await readLatestL0SyncLogDb(probeCode);
  if (dbLog.error?.includes("does not exist") || dbLog.error?.includes("l0_sync_log")) {
    record(
      "L0-2",
      "Supabase l0_sync_log 表",
      "fail",
      "表不存在 — 请运行 npm run data:migrate",
    );
    return;
  }
  record(
    "L0-2",
    "Supabase l0_sync_log 写入",
    dbLog.ok && dbLog.row?.ok ? "pass" : "fail",
    dbLog.ok
      ? `${probeCode} @ ${dbLog.row!.synced_at.slice(0, 19)}`
      : dbLog.error ?? "无记录",
  );
}

async function checkDraftPipeline(): Promise<void> {
  const { getSupabase } = await import("@/lib/supabase/server");
  const supabase = await getSupabase();
  if (!supabase) {
    record("C1", "草稿路径 s18", "skip", "无 Supabase");
    record("D1", "FK-18 Verify", "skip", "无 Supabase");
    record("L0-2", "Supabase l0_sync_log", "skip", "无 Supabase");
    return;
  }

  await checkL0SyncLog();

  const { v4: uuidv4 } = await import("uuid");
  const { getRawModelSettings } = await import("@/lib/supabase/server");

  const modelRows = await getRawModelSettings();
  const webReady =
    modelRows.find((r) => r.slot === "web")?.check_status === "passed";
  const skipL3 =
    process.env.HARNESS_SKIP_L3 === "1" || !webReady;

  const fundCases = [
    { fundCode: "019305", casePrefix: "C", hasVault: true },
    { fundCode: "206007", casePrefix: "D", hasVault: true },
  ] as const;

  for (const fc of fundCases) {
    const convId = uuidv4();
    const runId = uuidv4().replace(/-/g, "").slice(0, 16);

    const { error: insErr } = await supabase.from("conversations").insert({
      id: convId,
      title: `sys-verify-${fc.fundCode}-${Date.now()}`,
      conversation_type: "fund",
      metadata: { type_locked: true, active_tab: "fund", has_unconfirmed: false },
    });
    if (insErr) {
      record(`${fc.casePrefix}1`, `${fc.fundCode} 草稿`, "skip", insErr.message);
      continue;
    }

    try {
      await runFundDraftVerify({
        supabase,
        convId,
        runId,
        fundCode: fc.fundCode,
        hasVault: fc.hasVault,
        casePrefix: fc.casePrefix,
        skipL3,
      });
    } finally {
      await supabase.from("conversations").delete().eq("id", convId);
      const runDir = path.join(root, "data", "runs", convId);
      if (fs.existsSync(runDir)) {
        fs.rmSync(runDir, { recursive: true, force: true });
      }
    }
  }

  const convId = uuidv4();
  const runId = uuidv4().replace(/-/g, "").slice(0, 16);
  const { error: insErr } = await supabase.from("conversations").insert({
    id: convId,
    title: `sys-verify-draft-api-${Date.now()}`,
    conversation_type: "fund",
    metadata: { type_locked: true, active_tab: "fund", has_unconfirmed: false },
  });
  if (insErr) {
    record("B1", "GET draft API", "skip", insErr.message);
    return;
  }

  try {
    const { draftFundReport } = await import("@/lib/fund/report-draft");
    await draftFundReport(supabase, {
      fundCode: "019305",
      conversationId: convId,
      runId,
      skip_l3: skipL3,
    });

    const { GET: getDraft } = await import(
      "@/app/api/conversations/[id]/draft/route"
    );
    const draftRes = await getDraft(
      new Request(`http://localhost/api/conversations/${convId}/draft`),
      { params: Promise.resolve({ id: convId }) },
    );
    const draftBody = (await draftRes.json()) as {
      markdown?: string;
      error?: string;
    };
    record(
      "B1",
      "GET draft API（模式 B 数据源）",
      draftRes.status === 200 && (draftBody.markdown?.length ?? 0) > 100
        ? "pass"
        : "fail",
      draftRes.status === 200
        ? `markdown ${draftBody.markdown?.length ?? 0} chars`
        : draftBody.error ?? `status ${draftRes.status}`,
    );
  } finally {
    await supabase.from("conversations").delete().eq("id", convId);
    const runDir = path.join(root, "data", "runs", convId);
    if (fs.existsSync(runDir)) {
      fs.rmSync(runDir, { recursive: true, force: true });
    }
  }
}

async function checkPreviewE2E(httpReady: boolean): Promise<void> {
  if (!httpReady) {
    record("7-2-E2E", "Playwright Preview ECharts", "skip", "dev server 不可用");
    return;
  }
  if (process.env.VERIFY_SKIP_E2E === "1") {
    record("7-2-E2E", "Playwright Preview ECharts", "skip", "VERIFY_SKIP_E2E=1");
    return;
  }

  const spec = path.join(root, "e2e", "fund-preview-smoke.spec.ts");
  if (!fs.existsSync(spec)) {
    record("7-2-E2E", "Playwright Preview ECharts", "fail", "缺少 e2e spec");
    return;
  }

  const result = spawnSync(
    "npx",
    [
      "playwright",
      "test",
      "e2e/fund-preview-smoke.spec.ts",
      "--reporter=line",
    ],
    {
      cwd: root,
      encoding: "utf8",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        PLAYWRIGHT_SKIP_WEBSERVER: "1",
        PLAYWRIGHT_BASE_URL: baseUrl,
      },
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000,
    },
  );
  const tail = (result.stdout + result.stderr).trim().split("\n").slice(-4).join(" ");
  record(
    "7-2-E2E",
    "Playwright Preview ECharts",
    result.status === 0 ? "pass" : "fail",
    result.status === 0 ? "canvas 已渲染" : tail || `exit ${result.status}`,
  );
}

async function checkHttp(base: string): Promise<boolean> {
  const health = await fetchJson(`${base}/api/settings/readiness`);
  if (!health.ok) {
    record(
      "HTTP",
      "dev server",
      "skip",
      health.error ?? `无法连接 ${base}（请先 npm run dev）`,
    );
    return false;
  }
  record("0-2", "GET /api/settings/readiness", "pass", JSON.stringify(health.body));

  const pages = [
    ["/", "0-1"],
    ["/chat", "1-1"],
    ["/reports", "8-1"],
    ["/reports/view", "8-2"],
    ["/scheduled-jobs", "9-1"],
    ["/fund-knowledge", "10-1"],
    ["/settings", "2-1"],
    ["/settings/models", "2-1"],
    ["/settings/database", "2-2"],
  ] as const;

  for (const [p, id] of pages) {
    try {
      const res = await fetch(`${base}${p}`, {
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      record(
        id,
        `页面 ${p}`,
        res.status === 200 ? "pass" : "fail",
        `status=${res.status}`,
      );
    } catch (e) {
      record(
        id,
        `页面 ${p}`,
        "fail",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  const conv = await fetchJson(`${base}/api/conversations`, {
    method: "POST",
  });
  record(
    "1-2",
    "POST /api/conversations",
    conv.status === 200 || conv.status === 201 ? "pass" : "fail",
    `status=${conv.status}`,
  );

  return true;
}

function summarize(): { pass: number; fail: number; warn: number; skip: number } {
  const counts = { pass: 0, fail: 0, warn: 0, skip: 0 };
  for (const r of results) counts[r.status]++;
  return counts;
}

function writeReport(counts: ReturnType<typeof summarize>): void {
  const ts = new Date().toISOString();
  const lines = [
    "# 系统验证报告（人工验证前）",
    "",
    `> 生成时间：${ts}  `,
    `> 脚本：\`npx tsx automation/cli/system-verify.ts\`  `,
    `> 对照：[MANUAL-VERIFICATION.md](./MANUAL-VERIFICATION.md)`,
    "",
    "## 汇总",
    "",
    "| 通过 | 失败 | 警告 | 跳过 |",
    "|------|------|------|------|",
    `| ${counts.pass} | ${counts.fail} | ${counts.warn} | ${counts.skip} |`,
    "",
    counts.fail === 0
      ? "**结论**：自动化项无阻塞失败；可开始人工走查（关注 WARN 项）。"
      : "**结论**：存在失败项，建议先修复再人工验证。",
    "",
    "## 明细",
    "",
    "| 用例 | 标题 | 状态 | 说明 |",
    "|------|------|------|------|",
  ];

  for (const r of results) {
    const st =
      r.status === "pass"
        ? "✅"
        : r.status === "fail"
          ? "❌"
          : r.status === "warn"
            ? "⚠️"
            : "⏭️";
    lines.push(
      `| ${r.id} | ${r.title} | ${st} | ${r.detail.replace(/\|/g, "\\|")} |`,
    );
  }

  lines.push(
    "",
    "## 建议人工优先关注",
    "",
    "- **0-2 / 2-x**：若 WARN，先在设置页完成模型与数据库探活",
    "- **7-2-E2E**：Playwright Preview ECharts 冒烟（需 dev :3000 + `npx playwright install chromium`）",
    "- **4–7**：三条主线确认卡、模式 B、发布 — 仅自动化覆盖部分，需 UI 走查",
    "- **11-x**：Handoff、橙点、overlay — 需 UI",
    "",
    "## 未自动化（需人工）",
    "",
    "模式 B 布局视觉、确认卡点击、Handoff 跳转、定时 tick 直发、上传 PDF、Vision 截图录入等。",
    "（ECharts Preview 已由 Playwright 7-2-E2E 部分覆盖。）",
    "",
  );

  const outPath = path.join(root, "docs", "SYSTEM-VERIFICATION-REPORT.md");
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`\nReport written: ${outPath}`);
}

async function main(): Promise<void> {
  console.log("=== System verification (pre-manual) ===\n");
  checkEnv0();
  await checkReadiness();
  await checkInProcessApis();
  await checkDraftPipeline();
  const httpReady = await checkHttp(baseUrl);
  await checkPreviewE2E(httpReady);

  const counts = summarize();
  console.log(
    `\nSummary: pass=${counts.pass} fail=${counts.fail} warn=${counts.warn} skip=${counts.skip}`,
  );
  writeReport(counts);
  process.exit(counts.fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
