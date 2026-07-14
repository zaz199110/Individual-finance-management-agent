import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(`${BASE_URL}/reports?tab=portfolio`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: 'tmp/playwright-check/01-reports-list.png', fullPage: true });
  console.log('1. Reports list page captured');

  const reportLink = page.locator('a[href*="/reports/view"]').first();
  if (await reportLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    await reportLink.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'tmp/playwright-check/02-report-view.png', fullPage: true });
    console.log('2. Report view page captured');

    const fundSection = await page.locator('text=基金解读').first();
    if (await fundSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fundSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'tmp/playwright-check/03-fund-section.png', fullPage: true });
      console.log('3. Fund interpretation section captured');
    }
  } else {
    const fundSection = await page.locator('text=基金解读').first();
    if (await fundSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      await fundSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'tmp/playwright-check/03-fund-section.png', fullPage: true });
      console.log('3. Fund interpretation section (inline) captured');
    }
  }

  await browser.close();
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
