/**
 * E2E: Portfolio holdings text input → propose flow (targeted checks).
 *
 * Strategy:
 *  1. Click "持仓分析" tab → click existing portfolio conversation (not "新对话")
 *  2. Use page.evaluate() to snapshot chat message container only (not sidebar)
 *  3. Before/after diff on chat container text, not CSS class count
 *  4. Three phases: 买入 → 卖出 → 现金分红
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
  console.log(`  [SHOT ${String(step).padStart(2, '0')}] ${fp}`);
}

/** Send a chat message via the input field */
async function sendChatMessage(page, message, waitMs = 20000) {
  const input = page.locator('[contenteditable="true"]').first();
  if (await input.isVisible({ timeout: 3000 }).catch(() => false)) {
    await input.click();
    await input.fill(message);
  } else {
    const ta = page.locator('textarea').first();
    if (await ta.isVisible({ timeout: 3000 }).catch(() => false)) {
      await ta.fill(message);
    } else {
      console.log(`  !! No input found for "${message}"`);
      return false;
    }
  }
  await page.waitForTimeout(500);
  const sendBtn = page.locator('button[type="submit"]').first();
  if (await sendBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await sendBtn.click();
  } else {
    await page.keyboard.press('Enter');
  }
  console.log(`  Sent: "${message}" — waiting ${waitMs}ms`);
  await page.waitForTimeout(waitMs);
  return true;
}

/**
 * Extract all text from chat message container.
 * Looks for the main chat content area (not sidebar, not input area).
 * Returns concatenated text of all chat messages.
 */
async function getChatText(page) {
  return page.evaluate(() => {
    // Chat scroll area: has both "relative" and "overflow-y-auto" classes
    // Sidebar also has overflow-y-auto but lacks "relative"
    const chatAreas = document.querySelectorAll('[class*="relative"][class*="overflow-y-auto"]');
    for (const area of chatAreas) {
      const text = (area.textContent || '').trim();
      // Chat area should have substantial content and NOT just sidebar titles
      if (text.length > 50 && !text.startsWith('【') && !text.includes('新对话')) {
        return text;
      }
    }

    // Fallback 1: <main> element
    const main = document.querySelector('main');
    if (main) { const t = (main.textContent || '').trim(); if (t.length > 50) return t; }

    // Fallback 2: space-y-5 container (message list)
    const msgList = document.querySelector('[class*="space-y-5"]');
    if (msgList) { const t = (msgList.textContent || '').trim(); if (t.length > 50) return t; }

    return '';
  });
}

/** Find a visible confirm button */
async function findConfirmButton(page) {
  const btns = page.locator('button:has-text("确认"):visible');
  const n = await btns.count();
  if (n === 0) return null;
  return btns.nth(n - 1);
}

// ────────────────────────────────────────
async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const results = [];

  // ────────────────────────────────────────
  // NAVIGATION: Enter a portfolio conversation
  // ────────────────────────────────────────
  console.log('='.repeat(60));
  console.log('NAVIGATION');
  console.log('='.repeat(60));

  await page.goto(`${BASE_URL}/chat`, { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);

  // Step 1: Click "持仓分析" tab to filter sidebar to portfolio conversations
  console.log('Step 1: Click "持仓分析" tab...');
  const tabBtn = page.locator('button:has-text("持仓分析")').first();
  if (await tabBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await tabBtn.click();
    await page.waitForTimeout(3000);
  } else {
    console.log('  !! Could not find "持仓分析" tab');
  }

  // Step 2: Click on existing portfolio conversation (prefixed "【持仓分析】")
  console.log('Step 2: Click portfolio conversation...');
  const portfolioConv = page.locator('button:has-text("【持仓分析】-")').first();
  if (await portfolioConv.isVisible({ timeout: 5000 }).catch(() => false)) {
    await portfolioConv.click();
    console.log('  Clicked portfolio conversation');
    await page.waitForTimeout(5000);
  } else {
    // Fallback: click any button containing "持仓分析" that's NOT the tab
    const allPortfolio = page.locator('button:has-text("持仓分析")');
    const count = await allPortfolio.count();
    if (count > 1) {
      await allPortfolio.nth(1).click(); // skip the tab (first), click conversation (second)
      await page.waitForTimeout(5000);
    }
  }

  await shot(page, 'start');

  // Wait for content to settle — check loading state
  const loadingEl = page.locator('text=等待时间较长');
  if (await loadingEl.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('Page is loading, waiting additional 10s...');
    await page.waitForTimeout(10000);
  }

  // ────────────────────────────────────────
  // PHASE 1: Send a position input — "买入 ..."
  // ────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 1: 买入 input');
  console.log('='.repeat(60));

  const chatTextBefore1 = await getChatText(page);
  console.log(`Chat area text before (${chatTextBefore1.length} chars)`);

  await sendChatMessage(page, '买入 110020 易方达沪深300 2024-06-01 10000元 8000份', 30000);
  await shot(page, 'phase1-after-input');

  const chatTextAfter1 = await getChatText(page);
  const diff1 = chatTextAfter1.length > chatTextBefore1.length
    ? chatTextAfter1.substring(chatTextBefore1.length)
    : chatTextAfter1;

  console.log(`\nChat area text after (${chatTextAfter1.length} chars)`);
  console.log('New content (first 1500 chars):');
  console.log(diff1.substring(0, 1500));

  if (diff1.length < 50) {
    console.log('\n⚠️  No new content detected! Full chat area dump:');
    console.log(chatTextAfter1.substring(0, 2000));

    // Also log all visible text on page as fallback
    const bodyText = await page.locator('body').innerText();
    console.log('\nBody text (first 2000 chars):');
    console.log(bodyText.substring(0, 2000));
  }

  // --- Phase 1 Checks ---
  const hasDraftStep = /起草修改方案/.test(diff1);
  results.push({ check: '计划: 起草修改方案', passed: hasDraftStep });
  console.log((hasDraftStep ? '  ✓' : '  ✗') + ' 计划: 起草修改方案');

  const hasConfirmStep = /确认并保存/.test(diff1);
  results.push({ check: '计划: 确认并保存', passed: hasConfirmStep });
  console.log((hasConfirmStep ? '  ✓' : '  ✗') + ' 计划: 确认并保存');

  const hasScreenshotStep = /识别截图|提取文字|解析截图/.test(diff1);
  results.push({ check: '无截图步骤标签', passed: !hasScreenshotStep });
  console.log((!hasScreenshotStep ? '  ✓' : '  ✗') + ' 无截图步骤标签');

  const hasBuy = /买入/.test(diff1);
  results.push({ check: 'Action: 买入', passed: hasBuy });
  console.log((hasBuy ? '  ✓' : '  ✗') + ' Action: 买入');

  const hasFund = /110020|易方达沪深300/.test(diff1);
  results.push({ check: '基金信息: 110020/易方达沪深300', passed: hasFund });
  console.log((hasFund ? '  ✓' : '  ✗') + ' 基金信息: 110020/易方达沪深300');

  const hasDate = /2024-06-01/.test(diff1);
  results.push({ check: '日期: 2024-06-01', passed: hasDate });
  console.log((hasDate ? '  ✓' : '  ✗') + ' 日期: 2024-06-01');

  const hasAmount = /10,?000\s*元|10000\s*元/.test(diff1);
  const hasShares = /8,?000\s*份|8000\s*份/.test(diff1);
  results.push({ check: '金额+份额', passed: hasAmount || hasShares });
  console.log(((hasAmount || hasShares) ? '  ✓' : '  ✗') + ' 金额+份额');

  const confirmBtn = await findConfirmButton(page);
  const hasConfirm = confirmBtn !== null;
  results.push({ check: '确认按钮', passed: hasConfirm });
  console.log((hasConfirm ? '  ✓' : '  ✗') + ' 确认按钮');

  const noValError = !/change_summary\.narrative.*必填|change_summary\.kind.*须为/.test(diff1);
  results.push({ check: '无 change_summary 校验错误', passed: noValError });
  console.log((noValError ? '  ✓' : '  ✗') + ' 无 change_summary 校验错误');

  const noOldMenu = !/请选择|命令行|选项列表/.test(diff1);
  results.push({ check: '无命令行选项', passed: noOldMenu });
  console.log((noOldMenu ? '  ✓' : '  ✗') + ' 无命令行选项');

  const noVision = !/截图|vision|上传截图/.test(diff1);
  results.push({ check: '无截图/vision/上传', passed: noVision });
  console.log((noVision ? '  ✓' : '  ✗') + ' 无截图/vision/上传');

  // ────────────────────────────────────────
  // PHASE 2: Confirm + 卖出
  // ────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 2: Confirm + 卖出');
  console.log('='.repeat(60));

  if (hasConfirm && confirmBtn) {
    console.log('Clicking "确认"...');
    await confirmBtn.click();
    await page.waitForTimeout(5000);
    await shot(page, 'phase2-after-confirm');
  } else {
    console.log('  (no confirm button — skipping confirm step)');
  }

  const chatTextBefore2 = await getChatText(page);
  await sendChatMessage(page, '卖出 110011 易方达中小盘 2024-12-15 5000元 1500份', 30000);
  await shot(page, 'phase2-after-sell');

  const chatTextAfter2 = await getChatText(page);
  const diff2 = chatTextAfter2.length > chatTextBefore2.length
    ? chatTextAfter2.substring(chatTextBefore2.length)
    : chatTextAfter2;

  console.log('\nSell response (first 800 chars):');
  console.log(diff2.substring(0, 800));

  const hasSell = /卖出/.test(diff2);
  results.push({ check: 'Action: 卖出', passed: hasSell });
  console.log((hasSell ? '  ✓' : '  ✗') + ' Action: 卖出');

  // ────────────────────────────────────────
  // PHASE 3: 现金分红
  // ────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 3: 现金分红');
  console.log('='.repeat(60));

  const chatTextBefore3 = await getChatText(page);
  await sendChatMessage(page, '现金分红 110020 2024-09-15 500元', 30000);
  await shot(page, 'phase3-after-dividend');

  const chatTextAfter3 = await getChatText(page);
  const diff3 = chatTextAfter3.length > chatTextBefore3.length
    ? chatTextAfter3.substring(chatTextBefore3.length)
    : chatTextAfter3;

  console.log('\nDividend response (first 800 chars):');
  console.log(diff3.substring(0, 800));

  const hasDividend = /现金分红/.test(diff3);
  results.push({ check: 'Action: 现金分红', passed: hasDividend });
  console.log((hasDividend ? '  ✓' : '  ✗') + ' Action: 现金分红');

  const hasDivDate = /2024-09-15/.test(diff3);
  results.push({ check: '分红日期: 2024-09-15', passed: hasDivDate });
  console.log((hasDivDate ? '  ✓' : '  ✗') + ' 分红日期: 2024-09-15');

  const hasDivAmount = /500\s*元/.test(diff3);
  results.push({ check: '分红金额: 500元', passed: hasDivAmount });
  console.log((hasDivAmount ? '  ✓' : '  ✗') + ' 分红金额: 500元');

  // ────────────────────────────────────────
  // SUMMARY
  // ────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  let allPass = true;
  for (const r of results) {
    const status = r.passed ? '✓ PASS' : '✗ FAIL';
    if (!r.passed) allPass = false;
    console.log(`  ${status}: ${r.check}`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(allPass ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED');
  console.log(`Screenshots: ${SCREENSHOT_DIR}`);
  console.log(`Passed: ${results.filter(r => r.passed).length}/${results.length}`);
  console.log('='.repeat(60));

  await browser.close();
  return allPass;
}

run()
  .then(passed => process.exit(passed ? 0 : 1))
  .catch(err => { console.error(err); process.exit(1); });
