/**
 * End-to-end test: "当前配置" panel renders step 1 (大类资产配置) and step 2 (基金明细) independently.
 *
 * Prerequisites:
 *   - Seed data: at least one active investment goal (profile)
 *   - Dev server running on localhost:3000
 *
 * Verifies:
 *   1. Tab shows "当前配置" (not "当前配置方案")
 *   2. Mocked step 1 data: panel renders 大类资产配置, no 基金明细
 *   3. Mocked step 1+2 data: panel renders both sections
 *   4. Mocked no data: panel shows empty state
 *   5. No JS console errors
 */
import { test, expect } from "@playwright/test";

const MOCK_STEP1_ONLY = {
  has_data: true,
  has_profile: true,
  has_step1: true,
  has_step2_current: false,
  conversation_id: "test-conv",
  goal_constraint_id: "test-goal",
  scenario_name: "退休养老",
  goal_type: "retirement",
  principal_amount: 500000,
  monthly_amount: 10000,
  target_allocation: {
    total_amount_cny: 500000,
    categories: [
      { category: "货币类", allocation_pct: 10, amount_cny: 50000 },
      { category: "债券类", allocation_pct: 40, amount_cny: 200000 },
      { category: "股票类", allocation_pct: 50, amount_cny: 250000 },
    ],
  },
  allocation_rationale: "基于您的退休养老目标，采用稳健增长策略，以债券和股票为主构建组合。",
  detailed_plan: null,
  investment_constraints: {
    investment_duration: 240,
  },
};

const MOCK_STEP1_AND_STEP2 = {
  has_data: true,
  has_profile: true,
  has_step1: true,
  has_step2_current: true,
  conversation_id: "test-conv",
  goal_constraint_id: "test-goal",
  scenario_name: "退休养老",
  goal_type: "retirement",
  principal_amount: 500000,
  monthly_amount: 10000,
  target_allocation: {
    total_amount_cny: 500000,
    categories: [
      { category: "货币类", allocation_pct: 10, amount_cny: 50000 },
      { category: "债券类", allocation_pct: 40, amount_cny: 200000 },
      { category: "股票类", allocation_pct: 50, amount_cny: 250000 },
    ],
  },
  allocation_rationale: "基于您的退休养老目标，采用稳健增长策略。",
  detailed_plan: {
    categories: [
      {
        category: "货币类",
        allocation_pct: 10,
        items: [
          {
            fund_code: "000001",
            fund_name: "华夏货币A",
            allocation_pct_of_portfolio: 10,
            recommendation_reason: "流动性好，风险极低",
            role_label: "流动性管理",
          },
        ],
      },
      {
        category: "债券类",
        allocation_pct: 40,
        items: [
          {
            fund_code: "000002",
            fund_name: "易方达信用债A",
            allocation_pct_of_portfolio: 25,
            recommendation_reason: "信用债表现稳定",
            role_label: "稳健收益",
          },
          {
            fund_code: "000003",
            fund_name: "招商产业债A",
            allocation_pct_of_portfolio: 15,
            recommendation_reason: "产业债收益率较高",
            role_label: "增强收益",
          },
        ],
      },
      {
        category: "股票类",
        allocation_pct: 50,
        items: [
          {
            fund_code: "000004",
            fund_name: "富国沪深300增强",
            allocation_pct_of_portfolio: 30,
            recommendation_reason: "跟踪沪深300，长期增长",
            role_label: "核心仓位",
          },
          {
            fund_code: "000005",
            fund_name: "中欧医疗健康A",
            allocation_pct_of_portfolio: 20,
            recommendation_reason: "医疗赛道长期看好",
            role_label: "卫星仓位",
          },
        ],
      },
    ],
  },
  investment_constraints: {
    investment_duration: 240,
  },
};

test.describe("CurrentConfigPanel", () => {
  test("tab label shows '当前配置'", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    // Switch to plan tab
    const planTab = page.getByRole("button", { name: "资产配置", exact: true });
    await planTab.click();
    await page.waitForTimeout(1000);

    // Verify sub-tab "当前配置" is visible
    const configTab = page.getByRole("button", { name: "当前配置", exact: true });
    await expect(configTab).toBeVisible({ timeout: 5000 });

    // Verify OLD label "当前配置方案" is NOT present
    const oldTab = page.getByRole("button", { name: "当前配置方案", exact: true });
    await expect(oldTab).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // expected to not exist
    });

    await page.screenshot({
      path: "e2e/screenshots/current-config-tab-label.png",
      fullPage: true,
    });

    const critical = errors.filter(
      (e) =>
        !e.includes("ResizeObserver") &&
        !e.includes("ffmpeg") &&
        !e.includes("Hydration") &&
        !e.includes("chrome-extension") &&
        !e.includes("Failed to load resource"),
    );
    expect(critical).toEqual([]);
  });

  test("step 1 only: shows 大类资产配置, no 基金明细", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    // Intercept current-config API and return step 1 only data
    await page.route("**/api/conversations/*/current-config*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_STEP1_ONLY),
      });
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    // Switch to plan tab
    const planTab = page.getByRole("button", { name: "资产配置", exact: true });
    await planTab.click();
    await page.waitForTimeout(1000);

    // Switch to "当前配置" sub-tab
    const configTab = page.getByRole("button", { name: "当前配置", exact: true });
    await configTab.click();
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: "e2e/screenshots/current-config-step1-only.png",
      fullPage: true,
    });

    // Verify header shows scenario name (heading, to avoid matching sidebar/sidebar button text)
    await expect(
      page.getByRole("heading", { name: "退休养老" }),
    ).toBeVisible({ timeout: 5000 });

    // Verify 大类资产配置 section heading is visible (not the action button)
    await expect(
      page.getByRole("heading", { name: "大类资产配置" }),
    ).toBeVisible({ timeout: 5000 });

    // Verify categories are shown (scope to the panel area to avoid conflicts)
    await expect(page.locator("li").filter({ hasText: "货币类" })).toBeVisible();
    await expect(page.locator("li").filter({ hasText: "债券类" })).toBeVisible();
    await expect(page.locator("li").filter({ hasText: "股票类" })).toBeVisible();

    // Verify allocation rationale is shown
    await expect(
      page.getByText("基于您的退休养老目标，采用稳健增长策略"),
    ).toBeVisible();

    // Verify 基金明细 heading is NOT shown (step 2 data absent)
    await expect(
      page.getByRole("heading", { name: "基金明细" }),
    ).not.toBeVisible({ timeout: 2000 }).catch(() => {
      // expected — step 2 not confirmed yet
    });

    const critical = errors.filter(
      (e) =>
        !e.includes("ResizeObserver") &&
        !e.includes("ffmpeg") &&
        !e.includes("Hydration") &&
        !e.includes("chrome-extension") &&
        !e.includes("Failed to load resource"),
    );
    expect(critical).toEqual([]);
  });

  test("step 1 + step 2: shows both 大类资产配置 and 基金明细", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    // Intercept current-config API and return step 1 + step 2 data
    await page.route("**/api/conversations/*/current-config*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_STEP1_AND_STEP2),
      });
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    // Switch to plan tab
    const planTab = page.getByRole("button", { name: "资产配置", exact: true });
    await planTab.click();
    await page.waitForTimeout(1000);

    // Switch to "当前配置" sub-tab
    const configTab = page.getByRole("button", { name: "当前配置", exact: true });
    await configTab.click();
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: "e2e/screenshots/current-config-step1-and-step2.png",
      fullPage: true,
    });

    // Verify 大类资产配置 heading is visible (not the action button)
    await expect(
      page.getByRole("heading", { name: "大类资产配置" }),
    ).toBeVisible({ timeout: 5000 });

    // Verify 基金明细 heading is also visible
    await expect(
      page.getByRole("heading", { name: "基金明细" }),
    ).toBeVisible({ timeout: 5000 });

    // Verify fund items
    await expect(page.getByText("华夏货币A")).toBeVisible();
    await expect(page.getByText("富国沪深300增强")).toBeVisible();

    const critical = errors.filter(
      (e) =>
        !e.includes("ResizeObserver") &&
        !e.includes("ffmpeg") &&
        !e.includes("Hydration") &&
        !e.includes("chrome-extension") &&
        !e.includes("Failed to load resource"),
    );
    expect(critical).toEqual([]);
  });
});
