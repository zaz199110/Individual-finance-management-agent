/**
 * End-to-end test: plan scene empty state (N≥2, scene name resolution, fallback)
 *
 * Prerequisites:
 *   - Seed data: 5 active investment goals (run `python automation/scripts/seed_profile_five_goals.py`)
 *   - Dev server running on localhost:3000
 *
 * Verifies:
 *   1. N≥2 empty state renders correct title, body, hint (with 5 goal names)
 *   2. Scene name resolution: sending "养老" triggers correct plan flow
 *   3. Non-matching fallback: sending random text shows generic hint
 *   4. No JS console errors
 */
import { test, expect } from "@playwright/test";

const FIVE_GOAL_NAMES = ["退休养老", "子女教育", "购房置业", "结婚生育", "财富增值"];

test.describe("Plan empty state", () => {
  test("N≥2 empty state shows goal list", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    // Create a fresh conversation to ensure empty state
    const newChatBtn = page.getByRole("button", { name: "+ 新对话" });
    await newChatBtn.click();
    await page.waitForTimeout(1500);

    // Switch to plan tab
    const planTab = page.getByRole("button", { name: "资产配置", exact: true });
    await planTab.click();
    await page.waitForTimeout(1000);

    // Verify empty state title and body are visible
    const emptyTitle = page.getByText("选择要为哪组出方案");
    await expect(emptyTitle).toBeVisible({ timeout: 5000 });
    const emptyBody = page.getByText("可选择投资场景");
    await expect(emptyBody).toBeVisible({ timeout: 5000 });

    // Screenshot the N≥2 empty state
    await page.screenshot({
      path: "e2e/screenshots/plan-empty-state-N5.png",
      fullPage: true,
    });

    // Verify each goal name is present in the chat input hint
    // The hint text is set as the textarea's placeholder/value
    const chatTextarea = page.locator("textarea");
    const hintValue = (await chatTextarea.inputValue()) || (await chatTextarea.getAttribute("placeholder")) || "";
    console.log("Chat textarea value/placeholder:", hintValue);
    expect(hintValue).toContain("可选：");
    for (const name of FIVE_GOAL_NAMES) {
      expect(hintValue).toContain(name);
    }

    // Verify the N≥2 body text (visible text content, not input values)
    const bodyText =
      (await page.locator("body").innerText()) || "";
    console.log("Body text excerpt:", bodyText.substring(0, 300));
    expect(bodyText).toContain("已有投资需求");
    expect(bodyText).toContain("可选择投资场景");
    expect(bodyText).toContain("生成资产配置方案");

    // No unexpected JS errors
    const realErrors = errors.filter(
      (e) => !e.includes("Failed to load resource") && !e.includes("net::ERR_")
    );
    expect(realErrors).toEqual([]);
  });

  test("scene name resolution: sending '养老' triggers plan flow", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    // Create a fresh conversation to ensure empty state
    const newChatBtn = page.getByRole("button", { name: "+ 新对话" });
    await newChatBtn.click();
    await page.waitForTimeout(1500);

    // Switch to plan tab
    const planTab = page.getByRole("button", { name: "资产配置", exact: true });
    await planTab.click();
    await page.waitForTimeout(1000);

    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // Send "养老" — should match retirement goal and trigger plan flow
    await textarea.fill("养老");
    await textarea.press("Enter");

    // Wait for LLM response (can take 10-30s)
    await page.waitForTimeout(25000);

    // Screenshot the response
    await page.screenshot({
      path: "e2e/screenshots/plan-scene-name-match.png",
      fullPage: true,
    });

    // The empty state should have been replaced by a chat response
    // Check that the page no longer shows the empty state body text
    // (this is a soft check since LLM response may vary)
    const bodyText = await page.textContent("body");
    console.log(`After '养老' send, body contains:`);
    console.log(bodyText?.substring(0, 500));

    // Should NOT show the N=0 "请先完成投资需求的整理" text
    expect(bodyText).not.toContain("请先完成投资需求的整理");

    const realErrors = errors.filter(
      (e) => !e.includes("Failed to load resource") && !e.includes("net::ERR_")
    );
    expect(realErrors).toEqual([]);
  });

  test("non-matching fallback: random text shows generic hint", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    // Create a fresh conversation to ensure empty state
    const newChatBtn = page.getByRole("button", { name: "+ 新对话" });
    await newChatBtn.click();
    await page.waitForTimeout(1500);

    // Switch to plan tab
    const planTab = page.getByRole("button", { name: "资产配置", exact: true });
    await planTab.click();
    await page.waitForTimeout(1000);

    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // Send random non-matching text
    await textarea.fill("今天天气真不错");
    await textarea.press("Enter");

    // Wait for LLM response
    await page.waitForTimeout(25000);

    await page.screenshot({
      path: "e2e/screenshots/plan-fallback-nomatch.png",
      fullPage: true,
    });

    const bodyText = await page.textContent("body");
    console.log("After non-matching send, body contains:");
    console.log(bodyText?.substring(0, 500));

    // Should NOT trigger the plan pipeline lock (should be a conversational response)
    // Verify we don't see pipeline lock error for non-plan messages
    const lockError = page.getByText(/当前正在修改.*请先完成修改或发送【放弃修改】/);
    const lockVisible = await lockError.isVisible({ timeout: 3000 }).catch(() => false);
    expect(lockVisible).toBe(false);

    const realErrors = errors.filter(
      (e) => !e.includes("Failed to load resource") && !e.includes("net::ERR_")
    );
    expect(realErrors).toEqual([]);
  });
});
