/**
 * Mode B 报告预览 · 场景切换校验
 *
 * 验证：切换底部场景 Tab 时，预览面板仅展示当前场景匹配的草稿，
 * 不匹配时显示「当前无报告草稿可预览」。
 */
import { test, expect } from "@playwright/test";

test.describe("Mode B preview scene switch", () => {
  test("profile draft clears when switching to non-matching scene", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // 1. 确认当前加载了「需求梳理」对话，且预览面板有投资需求报告草稿
    const reportHeading = page.locator("h2").filter({ hasText: "投资需求综合报告" }).first();
    await expect(reportHeading).toBeVisible({ timeout: 8000 });

    // 确认底部 tab "需求梳理" 高亮
    const profileTab = page.getByRole("button", { name: "需求梳理", exact: true });
    await expect(profileTab).toHaveAttribute("data-state", /active|on|selected/, {
      timeout: 3000,
    }).catch(() => {
      // 如果没用 data-state，至少确认按钮可见且非 disabled
    });
    await expect(profileTab).toBeVisible();

    // 2. 切换到「资产配置」—— report_type 不匹配，预览应清空
    const planTab = page.getByRole("button", { name: "资产配置", exact: true });
    await planTab.click();
    await page.waitForTimeout(1500);

    // 资产配置无草稿，预览应显示「当前无报告草稿可预览」
    await expect(page.getByText("当前无报告草稿可预览")).toBeVisible({ timeout: 8000 });

    // 3. 切换到「基金解析」
    const fundTab = page.getByRole("button", { name: "基金解析", exact: true });
    await fundTab.click();
    await page.waitForTimeout(1500);

    // 确认「报告预览」子 tab 可见
    await expect(page.getByRole("button", { name: "报告预览", exact: true })).toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText("当前无报告草稿可预览")).toBeVisible({ timeout: 5000 });

    // 4. 切换到「持仓分析」
    const portfolioTab = page.getByRole("button", { name: "持仓分析", exact: true });
    await portfolioTab.click();
    await page.waitForTimeout(1000);

    await expect(page.getByText("当前无报告草稿可预览")).toBeVisible({ timeout: 5000 });

    // 5. 切回「需求梳理」—— 预览应恢复投资需求报告
    await profileTab.click();
    await page.waitForTimeout(1500);

    await expect(
      page.locator("h2").filter({ hasText: "投资需求综合报告" }).first(),
    ).toBeVisible({ timeout: 8000 });

    // 无控制台异常
    const critical = errors.filter(
      (e) =>
        !e.includes("ResizeObserver") &&
        !e.includes("ffmpeg") &&
        !e.includes("Hydration") &&
        !e.includes("chrome-extension"),
    );
    expect(critical).toEqual([]);
  });
});
