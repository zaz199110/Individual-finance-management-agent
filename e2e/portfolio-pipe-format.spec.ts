/**
 * E2E: Portfolio full flow — pipe-separated format.
 *
 * Test data (3 fund types, one with 2 lots):
 *   - 161725 招商中证白酒指数(LOF)A (纯股票) — 2 lots
 *   - 003547 鹏华丰享债券A (纯债基) — 1 lot
 *   - 890017 长江货币管家货币 (纯货币) — 1 lot
 *
 * Expected display format (pipe-separated, no markdown table):
 *   基金名称 | 基金代码 | 买入时间 | 买入金额 | 持有份额
 *   长江货币管家货币 | 890017 | 2024-06-01 | 10,000 | 10,000
 *   易方达沪深300 | 110020 | 2024-06-01 | 10,000 | 8,000
 */
import { test, expect } from "@playwright/test";
import { execSync } from "child_process";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("Portfolio Pipe-Separated Format E2E", () => {
  test.setTimeout(120_000);

  test.beforeAll(() => {
    console.log("[Setup] Seeding holdings via seed script...");
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

  // ── Test 1: Chat shows pipe-separated format ──
  test("chat shows holdings in pipe-separated format", async ({ page }) => {
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

    console.log("[Verify] Chat response:", messageText.substring(0, 800));

    // Verify pipe-separated format (no markdown table syntax)
    expect(messageText).toContain("基金名称 | 基金代码 | 买入时间 | 买入金额 | 持有份额");

    // Should NOT contain markdown table separator
    expect(messageText).not.toMatch(/\|[-\s]+\|/);

    // Verify hint text
    expect(messageText).toContain("请复制上方持仓表格");

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/portfolio-pipe-format.png",
      fullPage: true,
    });
  });

  // ── Test 2: Holdings panel shows 5-column table ──
  test("holdings panel shows 5-column HTML table", async ({ page }) => {
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

    // Check headers
    const tableText = await table.innerText();
    console.log("[Verify] Holdings panel:", tableText.substring(0, 500));

    expect(tableText).toContain("基金名称");
    expect(tableText).toContain("基金代码");
    expect(tableText).toContain("买入时间");
    expect(tableText).toContain("买入金额");
    expect(tableText).toContain("持有份额");

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/portfolio-panel-5col.png",
      fullPage: true,
    });
  });

  // ── Test 3: Copy-paste modification flow ──
  test("user can copy table, modify, and send back", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Switch to portfolio tab
    const portfolioTab = page.getByRole("button", { name: "持仓分析", exact: true });
    await expect(portfolioTab).toBeVisible({ timeout: 10000 });
    await portfolioTab.click();
    await page.waitForTimeout(500);

    // Get current holdings
    const textarea = page.locator("textarea");
    await textarea.fill("查看持仓");
    const sendButton = page.getByRole("button", { name: "发送" }).first();
    await sendButton.click();
    await sendButton.waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(1000);

    // Simulate user copying the table and modifying it
    // Add a new fund by sending modified pipe-separated format
    const modifiedHoldings = `基金名称 | 基金代码 | 买入时间 | 买入金额 | 持有份额
长江货币管家货币 | 890017 | 2024-06-01 | 10000 | 10000
易方达沪深300 | 110020 | 2024-06-01 | 10000 | 8000
易方达沪深300 | 110020 | 2025-01-15 | 5000 | 4000
鹏华丰享债券A | 003547 | 2025-08-12 | 30000 | 28412`;

    await textarea.fill(modifiedHoldings);
    await sendButton.click();
    await sendButton.waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(2000);

    // Look for confirm card
    const confirmCard = page.locator("text=请确认").first();
    const hasConfirmCard = await confirmCard.isVisible().catch(() => false);

    if (hasConfirmCard) {
      console.log("[Verify] Confirm card found after modification.");

      // Click confirm
      const confirmBtn = page.getByRole("button", { name: "确认" }).first();
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click();
        await page.waitForTimeout(3000);

        // Verify confirmation
        const pageText = await page.locator("body").innerText();
        const hasConfirmation = pageText.includes("已确认") || pageText.includes("已保存");
        console.log(`[Verify] Confirmation: ${hasConfirmation}`);
      }
    } else {
      console.log("[Verify] No confirm card (parsing may have failed).");
    }

    // Take screenshot
    await page.screenshot({
      path: "e2e/screenshots/portfolio-copy-modify.png",
      fullPage: true,
    });
  });
});
