"""Deep DOM inspection to find publish card and chat structure."""
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()

    page.goto(f"{BASE}/chat", timeout=30000)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    # Click first conversation
    convo = page.locator("button:has-text('【需求梳理】')").first
    convo.click()
    page.wait_for_timeout(2000)

    # Full page screenshot
    page.screenshot(path="D:\\CursorProjects\\agent-demo-coding\\scripts\\full-page.png", full_page=True)

    # Print ALL text on page
    print("=== FULL PAGE TEXT ===")
    body_text = page.locator("body").inner_text()
    # Print first 5000 chars
    print(body_text[:5000])

    # More specifically, look at the chat area
    print("\n\n=== Looking for card-like structures ===")
    # Look for elements with 'card' in class
    card_els = page.locator("[class*='card'], [class*='Card']").all()
    print(f"  Found {len(card_els)} card elements")
    for i, el in enumerate(card_els[:15]):
        try:
            text = (el.inner_text() or "").strip()[:120]
            cls = el.get_attribute("class") or ""
            if text:
                print(f"  card[{i}]: class='{cls[:60]}' text='{text[:100]}'")
        except:
            pass

    # Check if there's a "我的报告" page with reports
    print("\n\n=== Navigate to /reports ===")
    page.goto(f"{BASE}/reports", timeout=30000)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    page.screenshot(path="D:\\CursorProjects\\agent-demo-coding\\scripts\\reports-page.png", full_page=True)
    reports_text = page.locator("body").inner_text()
    print(reports_text[:3000])

    browser.close()
    print("\n=== Done ===")
