/**
 * E2E: verify normalizeSeparatedText handles full-width pipes, zero-width chars,
 * and non-breaking spaces in pipe-separated holdings input.
 *
 * Covers fix in src/lib/portfolio/text-parse.ts:
 * - Full-width pipe ｜ (U+FF5C) → ASCII | (U+007C)
 * - Non-breaking space (U+00A0) → normal space
 * - Full-width space (U+3000) → normal space
 * - Zero-width chars (U+200B/C/D, U+FEFF) → removed
 */
import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("Portfolio Pipe Normalize E2E", () => {
  test.setTimeout(180_000);

  // Helper: switch to portfolio tab and get ready to send
  async function toPortfolioTab(page: ReturnType<typeof test["info"] extends never ? never : any>) {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    const portfolioTab = page.getByRole("button", { name: "持仓分析", exact: true });
    await expect(portfolioTab).toBeVisible({ timeout: 10000 });
    await portfolioTab.click();
    await page.waitForTimeout(500);
  }

  async function sendMessage(page: any, text: string) {
    const textarea = page.locator("textarea");
    await textarea.fill(text);
    const sendButton = page.getByRole("button", { name: "发送" }).first();
    await sendButton.click();
    // Wait for send button to reappear (means response received)
    await sendButton.waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(1500);
  }

  // ── Test 1: Full-width pipe characters ──
  test("handles full-width pipe ｜ (U+FF5C)", async ({ page }) => {
    await toPortfolioTab(page);

    // Input using FULL-WIDTH pipe ｜ as might come from Excel/Web copy
    const input = "基金名称\uFF5C基金代码\uFF5C买入时间\uFF5C买入金额\uFF5C持有份额\n"
      + "易方达蓝筹精选混合\uFF5C005827\uFF5C2026-03-01\uFF5C3,700\uFF5C2,000\n"
      + "鹏华丰享债券A\uFF5C003547\uFF5C2025-08-12\uFF5C30,000\uFF5C28,412";

    await sendMessage(page, input);

    // Verify: assistant responded (should contain confirm card or parsed result)
    const pageText = await page.locator("body").innerText();

    console.log("[Verify] Full-width pipe test - page text (first 600):",
      pageText.substring(0, 600));

    // Should have parsed the holdings (not an error message)
    const hasParsedHoldings =
      pageText.includes("005827") &&
      pageText.includes("003547") &&
      !pageText.includes("未识别");
    expect(hasParsedHoldings).toBeTruthy();

    await page.screenshot({
      path: "e2e/screenshots/pipe-normalize-fullwidth.png",
      fullPage: true,
    });
  });

  // ── Test 2: Zero-width characters ──
  test("handles zero-width characters mixed in", async ({ page }) => {
    await toPortfolioTab(page);

    // Zero-width space (U+200B) and BOM (U+FEFF) mixed with valid pipes
    const zwsp = "\u200B";
    const zwj = "\u200D";
    const bom = "\uFEFF";

    const input = `${bom}基金名称 |${zwsp} 基金代码${zwj} | 买入时间 |${bom} 买入金额 | 持有份额\n`
      + `长江货币管家货币 | ${bom}890017${zwsp} | 2024-06-01 | ${zwj}10,000${bom} | 10,000`;

    await sendMessage(page, input);

    const pageText = await page.locator("body").innerText();
    console.log("[Verify] Zero-width test - page text (first 600):",
      pageText.substring(0, 600));

    const hasParsedHoldings =
      pageText.includes("890017") &&
      !pageText.includes("未识别");
    expect(hasParsedHoldings).toBeTruthy();

    await page.screenshot({
      path: "e2e/screenshots/pipe-normalize-zerowidth.png",
      fullPage: true,
    });
  });

  // ── Test 3: Non-breaking spaces ──
  test("handles non-breaking spaces (U+00A0)", async ({ page }) => {
    await toPortfolioTab(page);

    const nbsp = "\u00A0";
    const input = `基金名称${nbsp}|${nbsp}基金代码${nbsp}|${nbsp}买入时间${nbsp}|${nbsp}买入金额${nbsp}|${nbsp}持有份额\n`
      + `鹏华丰享债券A${nbsp}|${nbsp}003547${nbsp}|${nbsp}2025-08-12${nbsp}|${nbsp}30,000${nbsp}|${nbsp}28,412`;

    await sendMessage(page, input);

    const pageText = await page.locator("body").innerText();
    console.log("[Verify] NBSP test - page text (first 600):",
      pageText.substring(0, 600));

    const hasParsedHoldings =
      pageText.includes("003547") &&
      !pageText.includes("未识别");
    expect(hasParsedHoldings).toBeTruthy();

    await page.screenshot({
      path: "e2e/screenshots/pipe-normalize-nbsp.png",
      fullPage: true,
    });
  });

  // ── Test 4: Combined full-width pipes + zero-width + NBSP (worst case) ──
  test("handles full-width pipes with zero-width chars and NBSP combined", async ({ page }) => {
    await toPortfolioTab(page);

    const nbsp = "\u00A0";
    const zwsp = "\u200B";
    const bom = "\uFEFF";
    const fwp = "\uFF5C"; // full-width pipe ｜

    // This is the worst-case clipboard content from some web tables
    const input = `${bom}基金名称${nbsp}${fwp}${nbsp}基金代码${zwsp}${fwp}${nbsp}买入时间${fwp}${nbsp}买入金额${fwp}${nbsp}持有份额\n`
      + `易方达蓝筹精选混合${nbsp}${fwp}${nbsp}005827${zwsp}${fwp}${nbsp}2026-03-01${fwp}${nbsp}3,700${fwp}${nbsp}2,000`;

    await sendMessage(page, input);

    const pageText = await page.locator("body").innerText();
    console.log("[Verify] Combined test - page text (first 600):",
      pageText.substring(0, 600));

    const hasParsedHoldings =
      pageText.includes("005827") &&
      !pageText.includes("未识别");
    expect(hasParsedHoldings).toBeTruthy();

    await page.screenshot({
      path: "e2e/screenshots/pipe-normalize-combined.png",
      fullPage: true,
    });
  });

  // ── Test 5: Normal ASCII pipes still work (regression) ──
  test("normal ASCII pipes still work (regression)", async ({ page }) => {
    await toPortfolioTab(page);

    const input = "基金名称 | 基金代码 | 买入时间 | 买入金额 | 持有份额\n"
      + "长江货币管家货币 | 890017 | 2024-06-01 | 10,000 | 10,000\n"
      + "鹏华丰享债券A | 003547 | 2025-08-12 | 30,000 | 28,412";

    await sendMessage(page, input);

    const pageText = await page.locator("body").innerText();
    console.log("[Verify] Regression test - page text (first 600):",
      pageText.substring(0, 600));

    const hasParsedHoldings =
      pageText.includes("890017") &&
      pageText.includes("003547") &&
      !pageText.includes("未识别");
    expect(hasParsedHoldings).toBeTruthy();

    await page.screenshot({
      path: "e2e/screenshots/pipe-normalize-regression.png",
      fullPage: true,
    });
  });
});
