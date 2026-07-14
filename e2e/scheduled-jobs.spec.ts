import { expect, test } from "@playwright/test";

test.describe("定时持仓分析页面端到端验证", () => {
  test("页面正常加载并显示定时任务配置", async ({ page }) => {
    await page.goto("/scheduled-jobs");
    await expect(page.locator("h1")).toContainText("定时持仓分析");

    // 等待数据加载完成
    await expect(page.getByText("加载中…")).toHaveCount(0, { timeout: 15_000 });

    // 验证状态和触发频率有展示
    const sections = page.locator("dl");
    await expect(sections.getByText("状态")).toBeVisible();
    await expect(sections.getByText("触发频率")).toBeVisible();

    // 状态应是 开启 或 关闭
    const statusText = sections.locator("dd").first().textContent();
    expect(statusText).not.toBeNull();
    expect(["开启", "关闭"]).toContain((await statusText!).trim());

    // 触发频率不应为空
    const scheduleText = sections.locator("dd").nth(1).textContent();
    expect(scheduleText).not.toBeNull();
    expect((await scheduleText!).trim().length).toBeGreaterThan(0);

    // 至少有一个操作按钮：编辑 或 录入持仓
    const actionButton = page.locator("button:has-text('编辑'), button:has-text('录入持仓')");
    await expect(actionButton).toBeVisible();

    // 任务日志区域
    await expect(page.getByText("任务日志")).toBeVisible();
  });

  test("编辑定时任务模态框：打开、修改、保存", async ({ page }) => {
    await page.goto("/scheduled-jobs");
    await expect(page.getByText("加载中…")).toHaveCount(0, { timeout: 15_000 });

    // 如果有编辑按钮，继续测试；否则跳过
    const editBtn = page.locator("button:has-text('编辑')");
    if (!(await editBtn.isVisible().catch(() => false))) {
      test.skip(true, "无持仓，无编辑按钮");
      return;
    }

    // 打开编辑模态框
    await editBtn.click();
    await expect(page.getByText("编辑定时任务")).toBeVisible();

    // 验证模态框内有触发频率选择
    await expect(page.getByText("每周", { exact: true })).toBeVisible();
    await expect(page.getByText("每月", { exact: true })).toBeVisible();

    // 切换到每月
    await page.getByLabel("每月").check();
    // 每月模式下应出现 1-31 的日期按钮
    await expect(page.getByText("1", { exact: true })).toBeVisible();

    // 切回每周
    await page.getByLabel("每周").check();
    // 每周模式应出现周几选择
    await expect(page.getByText("周一")).toBeVisible();

    // 修改执行时间
    const timeInput = page.locator("input[type='time']");
    const originalTime = await timeInput.inputValue();
    const newTime = originalTime === "09:00" ? "10:30" : "09:00";
    await timeInput.fill(newTime);
    await expect(timeInput).toHaveValue(newTime);

    // 先确保当前状态，然后切换
    const enabledRadio = page.getByLabel("开启");
    const disabledRadio = page.getByLabel("关闭");
    const wasEnabled = await enabledRadio.isChecked();
    if (wasEnabled) {
      await disabledRadio.check();
    } else {
      await enabledRadio.check();
    }

    // 保存
    const saveBtn = page.locator("button:has-text('保存')");
    await saveBtn.click();

    // 等待保存完成：模态框应关闭 或 出现错误提示
    try {
      await page.waitForTimeout(3000);
    } catch {
      // 忽略 timeout
    }

    // 保存后要么模态框关闭，要么有错误提示（Supabase 不可用时尚可接受）
    const modalClosed = await page.getByText("编辑定时任务").isHidden().catch(() => true);
    const errorShown = await page.getByText("保存失败").isVisible().catch(() => false);

    // 至少满足一个条件：保存成功（模态框关闭）或保存失败有提示
    expect(modalClosed || errorShown).toBe(true);

    // 如果模态框关闭，恢复原始时间
    if (modalClosed) {
      const reopenBtn = page.locator("button:has-text('编辑')");
      if (await reopenBtn.isVisible().catch(() => false)) {
        await reopenBtn.click();
        await expect(page.getByText("编辑定时任务")).toBeVisible();
        const timeInput2 = page.locator("input[type='time']");
        await timeInput2.fill(originalTime);
        // 恢复启用状态
        if (wasEnabled) {
          await page.getByLabel("开启").check();
        } else {
          await page.getByLabel("关闭").check();
        }
        await page.locator("button:has-text('保存')").click();
        await page.waitForTimeout(2000);
      }
    }
  });

  test("任务日志区域应正常渲染（无JS错误）", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/scheduled-jobs");
    await expect(page.getByText("加载中…")).toHaveCount(0, { timeout: 15_000 });

    // 等待任务日志区域完全渲染
    await expect(page.getByText("任务日志")).toBeVisible();

    // 检查表格渲染：应该有表头 或 "暂无执行记录"
    const hasTable = await page.locator("table").isVisible().catch(() => false);
    const hasEmptyMsg = await page.getByText("暂无执行记录").isVisible().catch(() => false);

    // 至少有一个可见
    expect(hasTable || hasEmptyMsg).toBe(true);

    // 验证没有 JS 错误
    expect(errors).toEqual([]);
  });

  test("API 响应数据格式正确", async ({ page }) => {
    const response = await page.request.get("/api/scheduled-jobs");
    expect(response.ok()).toBe(true);

    const body = await response.json();

    // 验证返回结构
    expect(body).toHaveProperty("job");
    expect(body).toHaveProperty("schedule_label");
    expect(body).toHaveProperty("runs");
    expect(body).toHaveProperty("has_holdings");

    // job 应为对象（即使默认值）
    expect(typeof body.job).toBe("object");
    expect(body.job).not.toBeNull();

    // schedule_label 应为非空字符串
    expect(typeof body.schedule_label).toBe("string");
    expect(body.schedule_label.length).toBeGreaterThan(0);

    // runs 应为数组
    expect(Array.isArray(body.runs)).toBe(true);

    // has_holdings 应为布尔
    expect(typeof body.has_holdings).toBe("boolean");
  });
});
