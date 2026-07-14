import { expect, test } from "@playwright/test";
import { execSync } from "child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const BASE_URL = "http://localhost:3000";
const TICK_TIMEOUT_MS = 180_000;
const REPORT_POLL_MS = 120_000;
const POLL_INTERVAL_MS = 3000;

test.describe("分红修复端到端验证", () => {
  test.setTimeout(300_000);

  let reportId: string | null = null;

  test.beforeAll(async ({ request }) => {
    // ── Step 0: Clean up stale reports (otherwise "当日已有" skips generation) ──
    const reportsDir = path.join(process.cwd(), "data", "reports", "portfolio", "published");
    if (fs.existsSync(reportsDir)) {
      for (const file of fs.readdirSync(reportsDir)) {
        if (file.endsWith(".md")) {
          fs.unlinkSync(path.join(reportsDir, file));
          console.log(`[Setup] Deleted stale report file: ${file}`);
        }
      }
    }

    try {
      await request.post(`${BASE_URL}/api/reports/repair-index`);
      console.log("[Setup] Repair-index called.");
    } catch (e) {
      console.warn("[Setup] Repair-index failed (non-fatal):", String(e));
    }

    // ── Step 1: Seed holdings data ──
    console.log("[Setup] Seeding holdings...");
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

  test("生成持仓报告并验证 161725 不再提示分红缺失", async ({ request, page }) => {
    test.setTimeout(300_000);

    // ── Step 2: Configure scheduled job ──
    const now = new Date();
    const weekday = now.getDay();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    console.log(`[Test] Configuring job (day=${weekday} time=${hhmm})...`);
    await request.patch(`${BASE_URL}/api/scheduled-jobs`, {
      data: {
        enabled: true,
        schedule_kind: "weekly",
        schedule_days: [weekday],
        run_at_time: hhmm,
      },
    });

    // ── Step 3: Force-trigger tick (bypasses schedule minute-match gate) ──
    console.log("[Test] Force-triggering tick (awaiting LLM report, up to 3 min)...");
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
      console.warn("[Test] No portfolio report found. Skipping assertions.");
      test.skip(true, "No portfolio report available (LLM may be unavailable)");
      return;
    }
    console.log(`[Test] Report ready. ID=${reportId}`);

    // ── Verify assertions ──
    const screenshotsDir = path.join(process.cwd(), "e2e", "screenshots");
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // 1. Open the generated report view
    await page.goto(`/reports/view?tab=portfolio&id=${reportId}`);

    // Wait for report body to render
    const preview = page.locator("article.report-preview");
    await expect(preview, "报告正文未渲染").toBeVisible({ timeout: 15_000 });

    // 2. Screenshot for evidence
    const screenshotPath = path.join(screenshotsDir, "dividend-verification.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to ${screenshotPath}`);

    // 3. Key assertion: page should NOT contain dividend-missing warning
    const pageText = await page.locator("body").innerText();
    expect(pageText, "页面仍出现分红缺失提示").not.toContain("未纳入现金分红");

    // 4. Page should contain 161725 fund name
    expect(pageText).toContain("招商中证白酒指数(LOF)A");

    // 5. 161725's holding return/rate should display normally (no error from missing dividend)
    const baijiuRow = preview
      .locator("table")
      .first()
      .locator("tbody tr")
      .filter({ hasText: /161725.*2026-01-08/ });
    await expect(
      baijiuRow,
      "未找到招商中证白酒指数(LOF)A 的持仓行",
    ).toBeVisible({ timeout: 10_000 });

    const rowText = await baijiuRow.innerText();
    expect(
      rowText,
      "招商中证白酒指数(LOF)A 行未显示持有收益率（%）",
    ).toMatch(/-?\d+(\.\d+)?%/);
  });
});
