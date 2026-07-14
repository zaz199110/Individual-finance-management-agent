/**
 * End-to-end test: pipeline lock mechanism
 *
 * Verifies:
 *   1. Sending a pipeline-triggering message locks the pipeline
 *   2. Cross-pipeline messages are blocked with error toast
 *   3. Same-pipeline messages go through
 *   4. 【放弃修改】 unlocks the pipeline
 *   5. After unlock, a different pipeline can be entered
 */
import { test, expect } from "@playwright/test";

test.describe("Pipeline lock", () => {
  test("locks pipeline and blocks cross-pipeline sends", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Switch to profile tab
    const profileTab = page.getByRole("button", { name: "需求梳理", exact: true });
    await profileTab.click();
    await page.waitForTimeout(500);

    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // Step 1: Send "修改个人信息" — should lock basic_info pipeline
    await textarea.fill("修改个人信息");
    await textarea.press("Enter");
    await page.waitForTimeout(4000);
    console.log("Step 1: sent 修改个人信息");

    // Step 2: Send cross-pipeline message "我要修改退休养老计划"
    // Should be BLOCKED — error toast should appear
    await textarea.fill("我要修改退休养老计划");
    await textarea.press("Enter");

    // Wait for error toast to appear
    const errorToast = page.getByText(/当前正在修改.*请先完成修改或发送【放弃修改】/);
    const toastVisible = await errorToast.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Step 2: error toast visible: ${toastVisible}`);
    expect(toastVisible).toBe(true);

    await page.screenshot({
      path: "e2e/screenshots/pipeline-lock-blocked.png",
      fullPage: true,
    });

    // Step 3: Send 【放弃修改】 — should unlock
    await textarea.fill("【放弃修改】");
    await textarea.press("Enter");
    await page.waitForTimeout(4000);
    console.log("Step 3: sent 放弃修改");

    // Step 4: Now send a different pipeline message — should work (new lock)
    await textarea.fill("我要修改退休养老计划");
    await textarea.press("Enter");
    await page.waitForTimeout(4000);
    console.log("Step 4: sent retirement pipeline message");

    // Step 5: Try cross-pipeline again — should block
    await textarea.fill("买房");
    await textarea.press("Enter");
    const errorToast2 = page.getByText(/当前正在修改.*请先完成修改或发送【放弃修改】/);
    const toastVisible2 = await errorToast2.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Step 5: error toast visible: ${toastVisible2}`);
    expect(toastVisible2).toBe(true);

    await page.screenshot({
      path: "e2e/screenshots/pipeline-lock-retirement-blocked.png",
      fullPage: true,
    });

    // No unexpected JS errors
    const realErrors = errors.filter(
      (e) => !e.includes("Failed to load resource") && !e.includes("net::ERR_")
    );
    expect(realErrors).toEqual([]);
  });

  test("same-pipeline messages pass through while locked", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const profileTab = page.getByRole("button", { name: "需求梳理", exact: true });
    await profileTab.click();
    await page.waitForTimeout(500);

    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // Lock basic_info pipeline
    await textarea.fill("修改个人信息");
    await textarea.press("Enter");
    await page.waitForTimeout(4000);
    console.log("Step 1: locked basic_info pipeline");

    // Send plain text (no pipeline match) — should NOT be blocked
    await textarea.fill("好的，我明白了");
    await textarea.press("Enter");
    await page.waitForTimeout(3000);

    const errorToast = page.getByText(/当前正在修改.*请先完成修改或发送【放弃修改】/);
    const toastVisible = await errorToast.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Step 2: plain text blocked? ${toastVisible}`);
    expect(toastVisible).toBe(false);

    // Unlock
    await textarea.fill("【放弃修改】");
    await textarea.press("Enter");
    await page.waitForTimeout(3000);

    const realErrors = errors.filter(
      (e) => !e.includes("Failed to load resource") && !e.includes("net::ERR_")
    );
    expect(realErrors).toEqual([]);
  });

  test("page refresh resets pipeline lock", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const profileTab = page.getByRole("button", { name: "需求梳理", exact: true });
    await profileTab.click();
    await page.waitForTimeout(500);

    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible({ timeout: 5000 });

    // Lock basic_info pipeline
    await textarea.fill("修改个人信息");
    await textarea.press("Enter");
    await page.waitForTimeout(4000);
    console.log("Step 1: locked basic_info pipeline");

    // Refresh the page — lock should reset
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Re-enter profile tab
    const profileTab2 = page.getByRole("button", { name: "需求梳理", exact: true });
    await profileTab2.click();
    await page.waitForTimeout(500);

    const textarea2 = page.locator("textarea");
    await expect(textarea2).toBeVisible({ timeout: 5000 });

    // Now retirement pipeline should work (no lock from before refresh)
    await textarea2.fill("我要修改退休养老计划");
    await textarea2.press("Enter");
    await page.waitForTimeout(4000);
    console.log("Step 2: sent retirement pipeline message after refresh");

    // Cross-pipeline should now be blocked (new lock)
    await textarea2.fill("修改个人信息");
    await textarea2.press("Enter");
    const errorToast = page.getByText(/当前正在修改.*请先完成修改或发送【放弃修改】/);
    const toastVisible = await errorToast.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Step 3: cross-pipeline blocked after refresh? ${toastVisible}`);
    expect(toastVisible).toBe(true);

    const realErrors = errors.filter(
      (e) => !e.includes("Failed to load resource") && !e.includes("net::ERR_")
    );
    expect(realErrors).toEqual([]);
  });
});
