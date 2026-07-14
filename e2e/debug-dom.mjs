import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('http://localhost:3000/chat', { timeout: 30000, waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);

// Click portfolio tab
const tabBtn = page.locator('button:has-text("持仓分析")').first();
if (await tabBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
  await tabBtn.click();
  await page.waitForTimeout(3000);
}

// Click existing portfolio conversation
const portfolioConv = page.locator('button:has-text("【持仓分析】-")').first();
if (await portfolioConv.isVisible({ timeout: 5000 }).catch(() => false)) {
  await portfolioConv.click();
  await page.waitForTimeout(5000);
}

// Wait for loading to finish
const loading = page.locator('text=等待时间较长');
if (await loading.isVisible({ timeout: 2000 }).catch(() => false)) {
  await page.waitForTimeout(10000);
}

// Debug: dump DOM structure
const debug = await page.evaluate(() => {
  const results = [];

  // Find all elements with class matching space-y-5
  const spaceY5 = document.querySelectorAll('[class*="space-y-5"]');
  results.push('=== space-y-5 elements: ' + spaceY5.length + ' ===');
  spaceY5.forEach((el, i) => {
    results.push(`  [${i}] tag=${el.tagName} classes=${(el.className || '').substring(0, 80)}`);
    results.push(`       text=${(el.textContent || '').trim().substring(0, 200)}`);
  });

  // Find all overflow-y-auto elements
  const overflows = document.querySelectorAll('[class*="overflow-y-auto"]');
  results.push('\n=== overflow-y-auto elements: ' + overflows.length + ' ===');
  overflows.forEach((el, i) => {
    results.push(`  [${i}] tag=${el.tagName} classes=${(el.className || '').substring(0, 100)}`);
    results.push(`       text=${(el.textContent || '').trim().substring(0, 200)}`);
  });

  // Find main
  const mains = document.querySelectorAll('main');
  results.push('\n=== main elements: ' + mains.length + ' ===');
  mains.forEach((el, i) => {
    results.push(`  [${i}] text(first 500)=${(el.textContent || '').trim().substring(0, 500)}`);
  });

  // Find flex-1 elements
  const flex1 = document.querySelectorAll('[class*="flex-1"]');
  results.push('\n=== flex-1 elements: ' + flex1.length + ' ===');
  flex1.forEach((el, i) => {
    results.push(`  [${i}] tag=${el.tagName} classes=${(el.className || '').substring(0, 80)}`);
    results.push(`       text=${(el.textContent || '').trim().substring(0, 150)}`);
  });

  // Find justify-start (message rows)
  const justifyStart = document.querySelectorAll('[class*="justify-start"]');
  results.push('\n=== justify-start elements: ' + justifyStart.length + ' ===');
  justifyStart.forEach((el, i) => {
    results.push(`  [${i}] tag=${el.tagName} class=${(el.className || '').substring(0, 100)}`);
    // Get inner text excluding nested justify-start elements
    const clone = el.cloneNode(true);
    const nested = clone.querySelectorAll('[class*="justify-start"]');
    nested.forEach(n => n.remove());
    results.push(`       text=${(clone.textContent || '').trim().substring(0, 150)}`);
  });

  // Look for bg-[#f6f5f4] class
  const bgElements = document.querySelectorAll('[class*="bg-["]');
  results.push('\n=== bg-[] elements: ' + bgElements.length + ' ===');
  bgElements.forEach((el, i) => {
    results.push(`  [${i}] tag=${el.tagName} class=${(el.className || '').substring(0, 100)}`);
    results.push(`       text=${(el.textContent || '').trim().substring(0, 150)}`);
  });

  // Fallback: check ALL visible text
  results.push('\n=== body text (first 1000) ===');
  results.push((document.body.textContent || '').trim().substring(0, 1000));

  return results.join('\n');
});

console.log(debug);
await browser.close();
