import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:3000/reports', { timeout: 15000, waitUntil: 'networkidle' });
await page.waitForTimeout(4000);

// Strategy: Click "持仓分析" tab WITHIN the "我的报告" section
// The sidebar has "定时持仓分析" (5 chars), the tab has "持仓分析" (4 chars)
// Find a clickable element whose text is exactly "持仓分析" and is near "投资需求" tab
// Use nth() to select the tab within the report section

// First, find all elements with exact text "持仓分析"
const candidates = await page.locator('button:has-text("持仓分析"), [role="tab"]:has-text("持仓分析"), div[class*="tab"]:has-text("持仓分析"), span[class*="tab"]:has-text("持仓分析")').all();
console.log(`Found ${candidates.length} candidate elements with "持仓分析"`);

// Try clicking the candidate that is inside the reports panel
for (let i = 0; i < candidates.length; i++) {
  const text = await candidates[i].innerText();
  console.log(`  Candidate #${i}: "${text}"`);
}

// Alternative: find parent containing all 4 tabs, then click "持仓分析" inside it
const tabContainer = page.locator('div').filter({ has: page.locator('text=投资需求').first() }).filter({ has: page.locator('text=基金解读').first() }).first();
const containerCount = await tabContainer.count();
console.log(`\nFound ${containerCount} container(s) with all 4 tabs`);

if (containerCount > 0) {
  // Within this container, find "持仓分析" tab
  const portfolioTab = tabContainer.locator('button, [role="tab"], div[class*="tab"], span, a').filter({ hasText: '持仓分析' }).first();
  console.log('  Clicking 持仓分析 tab within container...');
  await portfolioTab.click();
  await page.waitForTimeout(3000);

  // Now check what's shown
  const bodyText = await page.locator('body').innerText();
  console.log('\n=== After clicking tab ===');
  console.log(bodyText.substring(0, 2000));

  // Look for report items
  const reportItems = await page.locator('button, a, div[class*="item"], li').filter({ hasText: '持仓分析报告' }).count();
  console.log(`\n  Found ${reportItems} elements mentioning "持仓分析报告"`);

  await page.screenshot({ path: 'tmp/portfolio-e2e/after-tab-click.png', fullPage: true });
}

await browser.close();
