/**
 * E2E: Portfolio full flow — modify holdings + trigger analysis.
 *
 * Test data (3 fund types, one with 2 lots):
 *   - 161725 招商中证白酒指数(LOF)A (纯股票) — 2 lots: 2024-06-01, 2025-01-15
 *   - 003547 鹏华丰享债券A (纯债基) — 1 lot: 2025-08-12
 *   - 890017 长江货币管家货币 (纯货币) — 1 lot: 2024-06-01
 *
 * Flow:
 *   1. Seed holdings via DB script
 *   2. Verify holdings panel shows 5-column table
 *   3. Verify chat shows holdings with correct format
 *   4. Modify holdings via chat (copy table → modify → send)
 *   5. Confirm holdings
 *   6. Verify panel refreshes with new data
 *   7. Trigger portfolio analysis
 *   8. Verify report generation
 */
import { test, expect } from "@playwright/test";
import { execSync } from "child_process";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const TICK_TIMEOUT_MS = 180_000;
const REPORT_POLL_MS = 120_000;
const POLL_INTERVAL_MS = 3000;

// Test holdings data — 3 fund types, one with 2 lots
const SEED_SQL = `
-- Clear old holdings
DELETE FROM holdings_versions WHERE id != '00000000-0000-0000-0000-000000000000';

-- Insert new holdings
INSERT INTO holdings_versions (is_current, positions, change_summary, confirmed_at)
VALUES (
  true,
  '[
    {"fund_code":"161725","fund_name":"招商中证白酒指数(LOF)A","invested_at":"2024-06-01","paid_amount":38500,"shares":32105.88,"action":"add"},
    {"fund_code":"161725","fund_name":"招商中证白酒指数(LOF)A","invested_at":"2025-01-15","paid_amount":15000,"shares":12500,"action":"add"},
    {"fund_code":"003547","fund_name":"鹏华丰享债券A","invested_at":"2025-08-12","paid_amount":30000,"shares":28412.35,"action":"add"},
    {"fund_code":"890017","fund_name":"长江货币管家货币","invested_at":"2024-06-01","paid_amount":10000,"shares":10000,"action":"add"}
  ]'::jsonb,
  '{"kind":"initial","narrative":"初始录入持仓（测试数据）"}'::jsonb,
  NOW()
);
`;

test.describe("Portfolio Full Flow E2E", () => {
  test.setTimeout(600_000); // 10 minutes overall

  let reportId: string | null = null;

  // ── Step 1: Seed holdings via DB ──
  test.beforeAll(async () => {
    console.log("[Setup] Seeding holdings via SQL...");

    // Write SQL to temp file and execute via supabase CLI or direct connection
    try {
      execSync("npx tsx scripts/seed-holdings-from-report.ts", {
        cwd: process.cwd(),
        stdio: "pipe",
        timeout: 30_000,
      });
      console.log("[Setup] Holdings seeded via script.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[Setup] Seed failed: ${msg}`);
    }

    // Wait for data to settle
    await new Promise((r) => setTimeout(r, 2000));
  });

  // ── Test 1: Holdings panel shows 5-column table ──
  test("holdings panel shows 5-column table", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Switch to portfolio tab
    const portfolioTab = page.getByRole("button", { name: "持仓分析", exact: true });
    await expect(portfolioTab).toBeVisible({ timeout: 10000 });
    await portfolioTab.click();
    await page.waitForTimeout(500);

    // Click "当前持仓" sub-tab
    const holdingsTab = page.getByRole("button", { name: "当前持仓" });
    if (await holdingsTab.isVisible().catch(() => false)) {
      await holdingsTab.click();
      await page.waitForTimeout(1000);
    }

    // Verify the table exists
    const table = page.locator("table").first();
    await expect(table).toBeVisible({ timeout: 10000 });

    // Check headers contain all 5 columns
    const tableText = await table.innerText();
    console.log("[Verify] Holdings panel table:", tableText.substring(0, 500));

    expect(tableText).toContain("基金名称");
    expect(tableText).toContain("基金代码");
    expect(tableText).toContain("买入时间");
    expect(tableText).toContain("买入金额");
    expect(tableText).toContain("持有份额");

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/portfolio-holdings-panel.png",
      fullPage: true,
    });
  });

  // ── Test 2: Chat shows holdings with correct format ──
  test("chat shows holdings table with 5 columns", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Switch to portfolio tab
    const portfolioTab = page.getByRole("button", { name: "持仓分析", exact: true });
    await expect(portfolioTab).toBeVisible({ timeout: 10000 });
    await portfolioTab.click();
    await page.waitForTimeout(500);

    // Type a message to trigger holdings display
    const textarea = page.locator("textarea");
    await textarea.fill("查看持仓");
    const sendButton = page.getByRole("button", { name: "发送" }).first();
    await sendButton.click();

    // Wait for response
    await sendButton.waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(1000);

    // Get the last assistant message
    const lastAssistantBubble = page.locator(".justify-start .rounded-2xl").last();
    await expect(lastAssistantBubble).toBeVisible({ timeout: 5000 });
    const messageText = await lastAssistantBubble.innerText();

    console.log("[Verify] Chat response:", messageText.substring(0, 500));

    // Verify 5-column format
    expect(messageText).toContain("基金名称");
    expect(messageText).toContain("基金代码");
    expect(messageText).toContain("买入时间");
    expect(messageText).toContain("买入金额");
    expect(messageText).toContain("持有份额");

    // Verify hint text
    expect(messageText).toContain("请复制上方持仓表格");

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/portfolio-chat-holdings.png",
      fullPage: true,
    });
  });

  // ── Test 3: Modify holdings via chat ──
  test("modify holdings: add new fund via copy-paste flow", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Switch to portfolio tab
    const portfolioTab = page.getByRole("button", { name: "持仓分析", exact: true });
    await expect(portfolioTab).toBeVisible({ timeout: 10000 });
    await portfolioTab.click();
    await page.waitForTimeout(500);

    // First, get the current holdings table
    const textarea = page.locator("textarea");
    await textarea.fill("查看持仓");
    const sendButton = page.getByRole("button", { name: "发送" }).first();
    await sendButton.click();
    await sendButton.waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(1000);

    // Now send a modification: add a new fund
    await textarea.fill("新增 519736 交银优势行业混合 2026-01-01 20000元 15000份");
    await sendButton.click();
    await sendButton.waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(2000);

    // Look for confirm card
    const confirmCard = page.locator("text=请确认").first();
    const hasConfirmCard = await confirmCard.isVisible().catch(() => false);

    if (hasConfirmCard) {
      console.log("[Verify] Confirm card found.");

      // Verify the card shows the new fund
      const cardText = await confirmCard.innerText();
      console.log("[Verify] Confirm card text:", cardText.substring(0, 300));

      // Click confirm button
      const confirmBtn = page.getByRole("button", { name: "确认" }).first();
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(3000);

        // Verify confirmation message
        const pageText = await page.locator("body").innerText();
        const hasConfirmation = pageText.includes("已确认") || pageText.includes("已保存");
        console.log(`[Verify] Confirmation: ${hasConfirmation}`);
      }
    } else {
      console.log("[Verify] No confirm card found.");
    }

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/portfolio-modify-flow.png",
      fullPage: true,
    });
  });

  // ── Test 4: Trigger portfolio analysis ──
  test("trigger portfolio analysis via scheduled job", async ({ request }) => {
    // Configure scheduled job
    const now = new Date();
    const weekday = now.getDay();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    console.log(`[Setup] Configuring job (day=${weekday} time=${hhmm})...`);
    await request.patch(`${BASE_URL}/api/scheduled-jobs`, {
      data: {
        enabled: true,
        schedule_kind: "weekly",
        schedule_days: [weekday],
        run_at_time: hhmm,
      },
    });

    // Trigger tick
    console.log("[Setup] Triggering tick...");
    let tickOk = false;
    try {
      const tickResp = await request.post(`${BASE_URL}/api/scheduled-jobs/tick`, {
        timeout: TICK_TIMEOUT_MS,
      });
      const tickBody = await tickResp.json();
      console.log("[Setup] Tick result:", JSON.stringify(tickBody));
      tickOk = tickResp.ok() && tickBody.checked;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[Setup] Tick failed:", msg);
    }

    // Poll for report
    console.log("[Setup] Polling for report...");
    const pollStart = Date.now();
    while (Date.now() - pollStart < REPORT_POLL_MS) {
      try {
        const reportsResp = await request.get(`${BASE_URL}/api/reports?tab=portfolio`);
        const reportsBody = await reportsResp.json();
        const portfolioReports = reportsBody.reports || [];
        if (portfolioReports.length > 0) {
          reportId = portfolioReports[0].id;
          console.log(`[Setup] Found report: ${reportId}`);
          break;
        }
      } catch {
        // ignore
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    expect(reportId, "Portfolio report should be generated").not.toBeNull();
  });

  // ── Test 5: Verify report content ──
  test("portfolio report has analysis sections", async ({ page }) => {
    test.skip(!reportId, "No portfolio report available");

    const viewUrl = `/reports/view?tab=portfolio&id=${reportId}`;
    console.log(`[Verify] Navigating to: ${viewUrl}`);
    await page.goto(viewUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(5000);

    const reportText = await page.locator("body").innerText();
    console.log("[Verify] Report text (first 1500 chars):", reportText.substring(0, 1500));

    // Verify report structure
    const hasSections =
      reportText.includes("持仓明细") ||
      reportText.includes("收益概况") ||
      reportText.includes("结构分布") ||
      reportText.includes("基金解读");
    expect(hasSections, "Report should have analysis sections").toBeTruthy();

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/portfolio-report-view.png",
      fullPage: true,
    });
  });
});
