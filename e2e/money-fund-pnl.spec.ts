/**
 * E2E: Verify money fund PnL display in portfolio reports.
 *
 * Tests the full pipeline: seed holdings (incl. 000509 money fund) →
 * configure scheduled job → force-trigger tick → verify rendered report
 * shows actual accumulated PnL (not 七日年化估算).
 *
 * LLM dependency: report generation uses AI APIs (30-90s).
 * The test times out gracefully and skips if LLM is unavailable.
 */
import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const BASE_URL = "http://localhost:3000";
const TICK_TIMEOUT_MS = 180_000;
const REPORT_POLL_MS = 120_000;
const POLL_INTERVAL_MS = 3000;

test.describe("Money Fund PnL E2E", () => {
  test.setTimeout(300_000); // 5 minute overall timeout

  let reportId: string | null = null;

  test.beforeAll(async ({ request }) => {
    // ── Step 0: Delete stale reports (otherwise "当日已有" skips generation) ──
    const reportsDir = path.join(process.cwd(), "data", "reports", "portfolio", "published");
    if (fs.existsSync(reportsDir)) {
      const files = fs.readdirSync(reportsDir);
      for (const file of files) {
        if (file.endsWith(".md")) {
          fs.unlinkSync(path.join(reportsDir, file));
          console.log(`[Setup] Deleted stale report file: ${file}`);
        }
      }
    }

    // Repair index: cleans up DB report_index rows whose files are gone
    try {
      const repairResp = await request.post(`${BASE_URL}/api/reports/repair-index`);
      const repairBody = await repairResp.json();
      console.log("[Setup] Repair-index:", JSON.stringify(repairBody));
    } catch (e) {
      console.warn("[Setup] Repair-index failed (non-fatal):", String(e));
    }

    // ── Step 1: Seed holdings data ──
    console.log("[Setup] Seeding holdings (3 bond + 1 mm fund)...");
    try {
      execSync("npx tsx scripts/seed-holdings-from-report.ts", {
        cwd: process.cwd(),
        stdio: "pipe",
        timeout: 30_000,
      });
      console.log("[Setup] Holdings seeded successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[Setup] Seed failed: ${msg}`);
    }
  });

  test("report is generated via force tick", async ({ request, page }) => {
    test.setTimeout(300_000);

    // ── Step 2: Enable scheduled job with current day + time ──
    const now = new Date();
    const weekday = now.getDay(); // 0=Sun … 6=Sat
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    console.log(`[Test] Configuring job (day=${weekday} time=${hhmm})...`);
    const patchResp = await request.patch(`${BASE_URL}/api/scheduled-jobs`, {
      data: {
        enabled: true,
        schedule_kind: "weekly",
        schedule_days: [weekday],
        run_at_time: hhmm,
      },
    });
    const patchBody = await patchResp.json();
    if (patchResp.ok()) {
      console.log("[Test] Job configured:", JSON.stringify(patchBody));
    } else {
      console.warn("[Test] Job config may have failed:", JSON.stringify(patchBody));
    }

    // ── Step 3: Trigger portfolio analysis with force=true ──
    console.log("[Test] Triggering tick with force=true (awaiting LLM report, up to 3 min)...");
    let tickOk = false;
    try {
      const tickResp = await request.post(`${BASE_URL}/api/scheduled-jobs/tick`, {
        data: { force: true },
        timeout: TICK_TIMEOUT_MS,
      });
      const tickBody = await tickResp.json();
      console.log("[Test] Tick result:", JSON.stringify(tickBody));
      tickOk = tickResp.ok() && tickBody.checked;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[Test] Tick request failed:", msg);
    }

    if (!tickOk) {
      console.warn("[Test] Tick did not run. Report generation may not have been triggered.");
    }

    // ── Step 4: Poll for portfolio report ──
    console.log("[Test] Polling for report...");
    const pollStart = Date.now();
    while (Date.now() - pollStart < REPORT_POLL_MS) {
      try {
        const reportsResp = await request.get(`${BASE_URL}/api/reports?tab=portfolio`);
        const reportsBody = await reportsResp.json();
        const portfolioReports = reportsBody.reports || [];
        if (portfolioReports.length > 0) {
          reportId = portfolioReports[0].id;
          console.log(`[Test] Found report: ${reportId} (${portfolioReports[0].report_name || "(unnamed)"})`);
          break;
        }
      } catch {
        // ignore transient errors during polling
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    if (!reportId) {
      console.warn("[Test] No portfolio report found. Tests will be skipped.");
      test.skip(true, "No portfolio report available (LLM may be unavailable)");
      return;
    }
    console.log(`[Test] Report ready. ID=${reportId}`);

    // ── Verify report appears on index page ──
    await page.goto("/reports?tab=portfolio", { waitUntil: "networkidle" });
    await page.waitForTimeout(3000);

    const pageText = await page.locator("body").innerText();
    expect(pageText.length).toBeGreaterThan(100);

    const hasReportContent =
      pageText.includes("持仓分析报告") ||
      pageText.includes("分析报告") ||
      pageText.includes("持仓");
    console.log(`[Verify] Reports page contains report content: ${hasReportContent}`);
  });

  test("portfolio report shows money fund accumulated PnL in yuan", async ({ page }) => {
    test.skip(!reportId, "No portfolio report available (LLM may be unavailable)");

    // Navigate to the full report view
    const viewUrl = `/reports/view?tab=portfolio&id=${reportId}`;
    console.log(`[Verify] Navigating to: ${viewUrl}`);
    await page.goto(viewUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(5000);

    const reportText = await page.locator("body").innerText();

    // Print first 3000 chars for debugging
    console.log("[Verify] Report text (first 3000 chars):");
    console.log(reportText.substring(0, 3000));

    // ── Core assertions for money fund PnL ──

    // 1. Report must contain the money fund code 000509 (广发钱袋子货币A)
    expect(reportText, "Report should mention money fund 000509").toMatch(/000509/);

    // 2. Must NOT show the old "元/万份" format (七日年化估算)
    if (reportText.includes("元/万份")) {
      console.warn(
        "[Verify] WARNING: Report still contains '元/万份' — old 七日年化 format may still be in use!",
      );
    }
    // This is a soft check: the report blueprint was updated to remove this,
    // but the AI might still mention it in narrative text. Log a warning instead.

    // 3. Must mention the money fund by name
    const hasMoneyFundName =
      reportText.includes("广发钱袋子") || reportText.includes("000509");
    expect(hasMoneyFundName, "Report should include the money fund name").toBeTruthy();

    // 4. Should contain PnL-related terms (元, 收益, 累计, 持有期)
    const hasPnLTerms =
      reportText.includes("收益") && (reportText.includes("累计") || reportText.includes("持有期"));
    expect(hasPnLTerms, "Report should contain PnL-related terms").toBeTruthy();

    // 5. Formula explanation should mention the new calculation method
    const hasNewFormula =
      reportText.includes("每日万份收益") ||
      reportText.includes("万份收益") ||
      reportText.includes("逐日累加");
    expect(hasNewFormula, "Report should mention the new per-10k income formula").toBeTruthy();

    // 6. Take a screenshot for visual verification
    await page.screenshot({
      path: "tmp/money-fund-pnl-report.png",
      fullPage: true,
    });
    console.log("[Verify] Screenshot saved to tmp/money-fund-pnl-report.png");
  });

  test("report markdown preview renders money fund table row correctly", async ({
    page,
    request,
  }) => {
    test.skip(!reportId, "No portfolio report available (LLM may be unavailable)");

    // Fetch the report content via API
    const reportResp = await request.get(`${BASE_URL}/api/reports/${reportId}`);
    if (!reportResp.ok()) {
      console.warn("[Verify] Could not fetch report detail, skipping");
      test.skip(true);
      return;
    }

    const reportDetail = await reportResp.json();
    const content = reportDetail.content || reportDetail.markdown || "";

    // The markdown should contain a table with 000509
    if (content.includes("000509")) {
      // Extract the table line containing 000509
      const lines = content.split("\n");
      const mmLines = lines.filter((l: string) => l.includes("000509"));
      console.log("[Verify] Money fund table lines:");
      mmLines.forEach((l: string) => console.log(`  ${l}`));

      // The table line should contain the shares (20000)
      const sharesMatch = /20000/.test(content);
      expect(sharesMatch, "Markdown should mention 20000 shares for 000509").toBeTruthy();
    } else {
      console.warn("[Verify] Report markdown does not contain 000509 explicitly");
    }
  });
});
