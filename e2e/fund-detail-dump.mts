import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.goto(`${BASE_URL}/reports?tab=portfolio`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  // Click on the first report in the list
  // Try various selectors to find the report item
  const reportItem = page.locator('text=持仓分析报告').first();
  if (await reportItem.isVisible({ timeout: 2000 }).catch(() => false)) {
    await reportItem.click();
    console.log('Clicked report item');
    await page.waitForTimeout(4000); // Wait for content to load
  } else {
    // Try clickable list items
    const clickable = page.locator('li, [role="listitem"], .cursor-pointer, button').filter({ hasText: '持仓分析报告' }).first();
    if (await clickable.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clickable.click();
      console.log('Clicked via alternative selector');
      await page.waitForTimeout(4000);
    }
  }

  // Now dump the fund interpretation section
  const fundSectionText = await page.evaluate(() => {
    const headings = document.querySelectorAll('h2, h3');
    let fundHeading: Element | null = null;
    let nextH2: Element | null = null;
    
    for (const h of headings) {
      if (h.textContent?.includes('基金解读') && h.tagName === 'H2') {
        fundHeading = h;
      } else if (fundHeading && h.tagName === 'H2') {
        nextH2 = h;
        break;
      }
    }

    if (!fundHeading) return 'FUND_SECTION_NOT_FOUND';

    const lines: string[] = [];
    let el = fundHeading.nextElementSibling;
    while (el && el !== nextH2) {
      const tag = el.tagName.toLowerCase();
      const text = el.textContent?.trim() || '';
      const innerHTML = el.innerHTML || '';
      
      if (tag === 'h3') {
        lines.push(`\n### ${text}`);
      } else if (tag === 'table') {
        lines.push(`[TABLE]`);
      } else if (tag === 'ul' || tag === 'ol') {
        const items = Array.from(el.querySelectorAll('li')).map(li => li.textContent?.trim() || '');
        lines.push(...items.map(i => `  • ${i}`));
      } else if (tag === 'p') {
        // Check if it has <br> or is a single blob
        const hasBreak = innerHTML.includes('<br');
        if (hasBreak) {
          lines.push(`[P with BR] ${text.substring(0, 200)}`);
        } else {
          lines.push(`[P] ${text.substring(0, 300)}`);
        }
      } else if (text) {
        lines.push(`[${tag}] ${text.substring(0, 200)}`);
      }
      
      el = el.nextElementSibling;
    }
    
    return lines.join('\n');
  });

  console.log('=== FUND INTERPRETATION SECTION ===');
  console.log(fundSectionText);
  console.log('=== END ===');

  // Also check all h2 headings
  const allH2 = await page.evaluate(() => 
    Array.from(document.querySelectorAll('h2')).map(h => h.textContent?.trim())
  );
  console.log('\nAll H2:', JSON.stringify(allH2));

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
