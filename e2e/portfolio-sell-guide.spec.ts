/**
 * E2E: Portfolio sell flow — verb-only ("卖出") shows holdings guide, not text parse.
 *
 * Plan B (selected per project):
 *   - Action verbs without fund code/date → guide table + example format
 *   - Action verbs WITH fund code/date → text parsing (port.hold.input+propose)
 *
 * This test verifies that "卖出" alone triggers the guide path,
 * NOT the old text-parse path that hardcodes fund code "000000".
 */
import { test, expect } from "@playwright/test";
import { execSync } from "child_process";

test.describe("Portfolio Sell Guide (Plan B)", () => {
  test.setTimeout(120_000); // AI pipeline may take up to 2 min

  test.beforeAll(() => {
    console.log("[Setup] Clearing holdings for sell-guide test...");
    try {
      execSync("npx tsx scripts/clear-holdings.ts", {
        cwd: process.cwd(),
        stdio: "pipe",
        timeout: 30_000,
      });
      console.log("[Setup] Holdings cleared successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[Setup] Clear holdings failed: ${msg}`);
    }
  });

  test('"卖出" with empty holdings shows guide (no "000000")', async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // ── Switch to portfolio tab ──
    const portfolioTab = page.getByRole("button", { name: "持仓分析", exact: true });
    await expect(portfolioTab).toBeVisible({ timeout: 10000 });
    await portfolioTab.click();
    await page.waitForTimeout(500);

    // Verify tab is active (blue background)
    await expect(portfolioTab).toHaveClass(/bg-\[#0075de\]/);

    // Verify textarea and send button are present
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 5000 });
    const sendButton = page.getByRole("button", { name: "发送" }).first();

    // ── Type "卖出" and send ──
    await textarea.fill("卖出");
    await sendButton.click();

    // ── Wait for SSE streaming to complete ──
    // During streaming the send button is replaced by "停止生成".
    // Wait until the send button reappears (streaming finished).
    await sendButton.waitFor({ state: "visible", timeout: 120_000 });

    // Allow final render to settle
    await page.waitForTimeout(1000);

    // ── Verify: the new assistant message (last one) shows the holdings guide ──
    // Assistant messages use .justify-start; the message bubble has .rounded-2xl.
    const lastAssistantBubble = page.locator(".justify-start .rounded-2xl").last();
    await expect(lastAssistantBubble).toBeVisible({ timeout: 5000 });

    const newMessageText = await lastAssistantBubble.innerText();

    // Must contain the holdings guide (empty state — "卖出" triggers guide, not text-parse)
    expect(newMessageText).toContain("暂无持仓记录");
    expect(newMessageText).toContain("买入 110020");

    // Must NOT contain the old text-parse default fund code
    expect(newMessageText).not.toContain("000000");

    // Must NOT contain text-parse error markers
    expect(newMessageText).not.toContain("待补全");
    expect(newMessageText).not.toContain("仍缺");

    // ── Screenshot for visual verification ──
    await page.screenshot({
      path: "e2e/screenshots/portfolio-sell-guide.png",
      fullPage: true,
    });
  });
});
