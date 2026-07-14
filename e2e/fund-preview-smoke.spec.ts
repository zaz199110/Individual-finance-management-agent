import { expect, test } from "@playwright/test";

test.describe("基金报告 Preview · ECharts 冒烟", () => {
  test("ReportMarkdownPreview 渲染柱图 canvas", async ({ page }) => {
    await page.goto("/dev/report-preview-smoke");
    await expect(page.getByTestId("preview-smoke-root")).toBeVisible();

    await expect(page.getByText("图表 JSON 无法解析")).toHaveCount(0);

    const canvas = page.locator(".report-echarts canvas");
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveCount(1);

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.width ?? 0) > 100).toBe(true);
    expect((box?.height ?? 0) > 100).toBe(true);
  });
});
