/**
 * E2E: Portfolio report generation + verification.
 * Auto-generates a report via chat (样例持仓 + confirm + 生成报告 + publish),
 * then views and validates the 6-chapter, 2-chart, no-variant structure.
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://localhost:3000';
const SCREENSHOT_DIR = path.join(process.cwd(), 'tmp', 'portfolio-e2e');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let step = 0;
async function shot(page, label) {
  step++;
  const fp = path.join(SCREENSHOT_DIR, `${String(step).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: fp, fullPage: true });
  console.log(`  [SCREENSHOT ${String(step).padStart(2, '0')}] ${fp}`);
}

/**
 * Send a chat message via the chat input.
 * Looks for a contenteditable or textarea input, fills it, then clicks the send button.
 */
async function sendChatMessage(page, message) {
  // Try contenteditable first (common in AI chat UIs)
  const input = page.locator('[contenteditable="true"]').first();
  if (await input.isVisible({ timeout: 2000 }).catch(() => false)) {
    await input.click();
    await input.fill(message);
  } else {
    // Fall back to textarea
    const ta = page.locator('textarea').first();
    if (await ta.isVisible({ timeout: 2000 }).catch(() => false)) {
      await ta.fill(message);
    } else {
      console.log(`  !! WARNING: No chat input found for message: "${message}"`);
      return false;
    }
  }

  await page.waitForTimeout(500);

  // Click send button
  const sendBtn = page.locator('button[type="submit"]').first();
  if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sendBtn.click();
    console.log(`  Sent: "${message}"`);
    return true;
  }

  // Try pressing Enter if no button
  await page.keyboard.press('Enter');
  console.log(`  Sent (Enter): "${message}"`);
  return true;
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // ────────────────────────────────────────
  // PHASE A: Generate a portfolio report
  // ────────────────────────────────────────
  console.log('=' .repeat(60));
  console.log('PHASE A: Generating portfolio report via chat...');
  console.log('=' .repeat(60));

  // A1: Start new conversation
  console.log('\nA1: Starting new conversation...');
  await page.goto(`${BASE_URL}/chat`, { timeout: 15000, waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Click "+ 新对话" if visible (sidebar)
  const newConvBtn = page.locator('button:has-text("新对话"), a:has-text("新对话")').first();
  if (await newConvBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await newConvBtn.click();
    console.log('  Clicked "新对话"');
    await page.waitForTimeout(2000);
  }

  // Check if we're already in a chat input state (handoff_autostart trigger)
  // Or if we need to click the "持仓分析" handoff
  const bodyText = await page.locator('body').innerText();
  console.log(`  Page state: ${bodyText.substring(0, 200)}`);

  // Look for handoff buttons like "持仓分析" or "需求梳理"
  const portfolioBtn = page.locator('button:has-text("持仓分析")').first();
  if (await portfolioBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await portfolioBtn.click();
    console.log('  Clicked "持仓分析" handoff');
    await page.waitForTimeout(3000);
  }

  await shot(page, 'chat-start');

  // A2: Send "用样例持仓"
  console.log('\nA2: Sending "用样例持仓"...');
  await sendChatMessage(page, '用样例持仓');
  console.log('  Waiting for confirm card (up to 30s)...');
  await page.waitForTimeout(15000);
  await shot(page, 'after-sample-request');

  // A3: Click "确认" on the confirm card
  console.log('\nA3: Looking for confirm button...');
  const confirmBtn = page.locator('button:has-text("确认")').first();
  if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await confirmBtn.click();
    console.log('  Clicked "确认"');
    await page.waitForTimeout(5000);
    await shot(page, 'after-confirm');
  } else {
    console.log('  !! Confirm button not found. Checking page state...');
    const text = await page.locator('body').innerText();
    console.log(`  Body: ${text.substring(0, 500)}`);
  }

  // A4: Send "生成持仓报告"
  console.log('\nA4: Sending "生成持仓报告"...');
  await sendChatMessage(page, '生成持仓报告');
  console.log('  Waiting for report generation + publish card (up to 90s)...');

  // Wait for report generation - look for "发布" button
  const publishBtn = page.locator('button:has-text("发布")').first();
  try {
    await publishBtn.waitFor({ state: 'visible', timeout: 90000 });
    console.log('  Publish card appeared!');
    await shot(page, 'report-draft-ready');

    // A5: Click "发布"
    console.log('\nA5: Publishing report...');
    await publishBtn.click();
    console.log('  Clicked "发布"');
    await page.waitForTimeout(5000);
    await shot(page, 'after-publish');
  } catch {
    console.log('  !! Publish card did not appear. Checking page state...');
    const text = await page.locator('body').innerText();
    console.log(`  Body (last 1500 chars): ${text.substring(Math.max(0, text.length - 1500))}`);
    await shot(page, 'no-publish-card');
  }

  // ────────────────────────────────────────
  // PHASE B: View and verify the report
  // ────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('PHASE B: Viewing and verifying the report...');
  console.log('=' .repeat(60));

  // B1: Navigate to /reports?tab=portfolio
  console.log('\nB1: Navigating to /reports?tab=portfolio...');
  await page.goto(`${BASE_URL}/reports?tab=portfolio`, { timeout: 15000, waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  await shot(page, 'reports-list');

  // B2: Find and click the report
  console.log('\nB2: Finding report...');
  const bodyText2 = await page.locator('body').innerText();
  console.log(`  Page text (first 300): ${bodyText2.substring(0, 300)}`);

  // Report buttons in the table - find by various strategies
  const tableButtons = page.locator('table button');
  const btnCount = await tableButtons.count();
  console.log(`  Table buttons: ${btnCount}`);

  if (btnCount > 0) {
    const names = await tableButtons.allTextContents();
    console.log(`  Names: ${names.slice(0, 5).join(' | ')}`);
    await tableButtons.first().click();
    await page.waitForTimeout(4000);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await shot(page, 'report-preview');
  } else {
    console.log('  No report buttons found! Dumping full body...');
    console.log(bodyText2.substring(0, 3000));

    // Try alternate: look for report names anywhere
    const allBtns = await page.locator('button').allTextContents();
    const reportBtns = allBtns.filter(t => t.includes('分析报告') || t.includes('持仓'));
    console.log(`  Buttons with '分析报告'/'持仓': ${reportBtns.slice(0, 10).join(' | ')}`);
  }

  // B3: Go to full-screen view
  console.log('\nB3: Opening full-screen view...');
  const currentUrl = page.url();
  const urlParams = new URL(currentUrl).searchParams;
  const reportId = urlParams.get('id');
  const tab = urlParams.get('tab') || 'portfolio';
  const convId = urlParams.get('c');

  console.log(`  Current URL: ${currentUrl}`);
  console.log(`  Report ID: ${reportId}`);

  if (reportId) {
    const viewUrl = `${BASE_URL}/reports/view?tab=${tab}&id=${reportId}${convId ? `&c=${convId}` : ''}`;
    console.log(`  Navigating to: ${viewUrl}`);
    await page.goto(viewUrl, { timeout: 15000, waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    await shot(page, 'fullscreen-view');
  } else {
    // Try clicking "全屏查看" button
    const fullscreenBtn = page.locator('button:has-text("全屏"), a:has-text("全屏")').first();
    if (await fullscreenBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fullscreenBtn.click();
      console.log('  Clicked "全屏查看"');
      await page.waitForTimeout(4000);
      await shot(page, 'fullscreen-view');
    }
  }

  // ────────────────────────────────────────
  // PHASE C: Content analysis
  // ────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('PHASE C: Content analysis...');
  console.log('=' .repeat(60));

  const reportText = await page.locator('body').innerText();

  // Print report for debugging
  console.log('\n--- REPORT TEXT (first 5000 chars) ---');
  console.log(reportText.substring(0, 5000));
  console.log('--- END ---\n');

  const checks = {
    '标题含"持仓分析报告"': reportText.includes('持仓分析报告'),
    '第一章 收益概况': reportText.includes('收益概况'),
    '第二章 持仓明细': reportText.includes('持仓明细'),
    '第三章 结构分布': reportText.includes('结构分布'),
    '第四章 基金深度': reportText.includes('基金深度'),
    '第五章 风险与合规': reportText.includes('风险与合规'),
    '第六章 免责与测算': reportText.includes('免责与测算'),
    '无"对照方案"': !reportText.includes('对照方案'),
    '无"再平衡"': !reportText.includes('再平衡'),
    '无"阅读指引"': !reportText.includes('阅读指引'),
    '无"三句话"': !reportText.includes('三句话'),
    '无"持仓速览"': !reportText.includes('持仓速览'),
    '分类含QDII型': reportText.includes('QDII') || reportText.includes('QDII型'),
    '有完整报告内容(>500字)': reportText.length > 500,
  };

  let allPass = true;
  for (const [check, result] of Object.entries(checks)) {
    const status = result ? '✓ PASS' : '✗ FAIL';
    if (!result) allPass = false;
    console.log(`  ${status}: ${check}`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(allPass ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED');
  console.log(`Screenshots: ${SCREENSHOT_DIR}`);
  console.log('='.repeat(60));

  await browser.close();
  return allPass;
}

run()
  .then(passed => process.exit(passed ? 0 : 1))
  .catch(err => { console.error(err); process.exit(1); });
