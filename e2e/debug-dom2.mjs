import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:3000/reports', { timeout: 15000, waitUntil: 'networkidle' });
await page.waitForTimeout(4000);

// Get ALL text content, not just buttons
const allDivs = await page.locator('div, span, li, a, button').allTextContents();
console.log('=== All text nodes ===');
const unique = [...new Set(allDivs.map(t => t.trim()).filter(t => t.length > 0 && t.length < 50))];
unique.forEach((t, i) => console.log(`${i}: "${t}"`));

// Also dump body innerText more fully
const bodyText = await page.locator('body').innerText();
console.log('\n=== FULL BODY TEXT ===');
console.log(bodyText.substring(0, 5000));

await page.screenshot({ path: 'tmp/portfolio-e2e/dom-debug2.png', fullPage: true });
await browser.close();
