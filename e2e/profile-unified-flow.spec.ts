/**
 * End-to-end verification: unified profile flow changes
 *
 * Runs SERIALLY (not parallel) — profile tests share DB session/state.
 *
 * Key verifications:
 *   1. "问卷" keyword → unified guide with "当前画像" (no crash, no old text)
 *   2. All new branch keywords don't cause console errors or crashes
 *   3. Old long questionnaire text "请按要点回复您的年龄、收入…" is GONE
 *
 * Note: These tests check structural invariants, not exact response text.
 * Planner interaction and shared DB state make exact text assertions unreliable.
 */
import { test, expect } from "@playwright/test";

test.describe.configure({ mode: "serial" });

/** Navigate to profile chat tab, return page + textarea + error collector. */
async function openProfileTab(page: any) {
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

  return { page, textarea, errors };
}

function filterErrors(errors: string[]) {
  return errors.filter(
    (e) => !e.includes("Failed to load resource") && !e.includes("net::ERR_")
  );
}

/** Send a message and wait for response. Returns full body text. */
async function sendMessage(textarea: any, message: string, page: any): Promise<string> {
  await textarea.fill(message);
  await textarea.press("Enter");
  await page.waitForTimeout(10000);
  return await page.locator("body").innerText();
}

test.describe("Profile unified flow (serial)", () => {
  // ── Test 1: "问卷" keyword → must show unified guide ──
  test('"问卷" shows unified guide with 当前画像', async ({ page }) => {
    const { textarea, errors } = await openProfileTab(page);

    const bodyText = await sendMessage(textarea, "问卷", page);

    // Core invariant: unified guide references "当前画像"
    expect(bodyText).toContain("当前画像");

    // Old long instructional text must be gone
    expect(bodyText).not.toContain("请按要点回复您的年龄、收入、家庭与开支");

    const realErrors = filterErrors(errors);
    expect(realErrors).toEqual([]);
  });

  // ── Test 2: All new keywords → no JS errors, no crash ──
  test('new branches do not cause JS errors', async ({ page }) => {
    const { textarea, errors } = await openProfileTab(page);

    // "开始梳理" — triggers auto-start (branch 9) + planner
    await sendMessage(textarea, "开始梳理", page);
    // "修改" bare — triggers generic modify catch (new branch, between 9 and 10)
    await sendMessage(textarea, "修改", page);
    // "改一下" — same generic catch
    await sendMessage(textarea, "改一下", page);
    // "修改个人信息" — falls through to isModifyBasicInfoIntent (branch 10)
    await sendMessage(textarea, "修改个人信息", page);

    // "问卷" again — ensure repeated invocation works
    await sendMessage(textarea, "问卷", page);

    // Verify no JS errors across all interactions
    const realErrors = filterErrors(errors);
    expect(realErrors).toEqual([]);
  });

  // ── Test 3: Old questionnaire text is gone from all visible output ──
  test('no old long questionnaire text anywhere', async ({ page }) => {
    const { textarea, errors } = await openProfileTab(page);

    // Trigger all branches in sequence
    await sendMessage(textarea, "问卷", page);
    await sendMessage(textarea, "开始梳理", page);
    await sendMessage(textarea, "修改", page);
    await sendMessage(textarea, "结婚生育", page);
    await sendMessage(textarea, "买房准备", page);

    const bodyText = await page.locator("body").innerText();

    // Old text must not appear anywhere on the page
    expect(bodyText).not.toContain("请按要点回复您的年龄、收入、家庭与开支");
    expect(bodyText).not.toContain(
      "请按以下要点逐项告诉我您的情况，我会帮您整理成完整的风险画像"
    );

    const realErrors = filterErrors(errors);
    expect(realErrors).toEqual([]);
  });
});
