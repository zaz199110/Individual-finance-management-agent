"""Full E2E: generate report → find publish card → confirm publish → verify in 我的报告"""
from playwright.sync_api import sync_playwright
import time

BASE = "http://localhost:3000"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()

    # Navigate to chat and grab conversation_id from URL or state
    print("=== Step 1: Navigate to /chat ===")
    page.goto(f"{BASE}/chat", timeout=30000)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    # Get the current conversation_id from the URL
    current_url = page.url
    print(f"  URL: {current_url}")

    # Click first conversation
    convo = page.locator("button:has-text('【需求梳理】')").first
    convo.click()
    page.wait_for_timeout(2000)
    current_url = page.url
    print(f"  After click URL: {current_url}")

    # Extract conversation_id from URL (looks like ?c=<uuid>)
    conv_id = None
    if "?c=" in current_url:
        conv_id = current_url.split("?c=")[1].split("&")[0].split("#")[0]
        print(f"  conversation_id: {conv_id}")

    # Step 2: Call generate-report API from the browser context
    print("\n=== Step 2: Call generate-report API ===")
    if conv_id:
        result = page.evaluate("""
            async (convId) => {
                try {
                    const res = await fetch('/api/profile/generate-report', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ conversation_id: convId }),
                    });
                    const data = await res.json();
                    console.log('generate-report response:', JSON.stringify(data));
                    return data;
                } catch (err) {
                    console.error('generate-report error:', err.message);
                    return { ok: false, error: err.message };
                }
            }
        """, conv_id)
        print(f"  API response: {result}")

        if result.get("ok"):
            file_path = result.get("file_path", "")
            report_name = result.get("report_name", "")
            print(f"  Report generated: {report_name}")
            print(f"  File: {file_path}")
    else:
        print("  No conversation_id found - trying without it")
        result = page.evaluate("""
            async () => {
                try {
                    const res = await fetch('/api/profile/generate-report', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({}),
                    });
                    const data = await res.json();
                    return data;
                } catch (err) {
                    return { ok: false, error: err.message };
                }
            }
        """)
        print(f"  API response: {result}")

    # Step 3: Wait for page to update with the new publish card
    print("\n=== Step 3: Look for publish card ===")
    page.wait_for_timeout(3000)
    page.screenshot(path="D:\\CursorProjects\\agent-demo-coding\\scripts\\step3-after-generate.png", full_page=True)

    # Check for publish card buttons
    publish_buttons = page.locator("text=确认发布").all()
    print(f"  Found {len(publish_buttons)} '确认发布' buttons")
    if publish_buttons:
        for i, pb in enumerate(publish_buttons):
            try:
                visible = pb.is_visible()
                bb = pb.bounding_box()
                print(f"  btn[{i}]: visible={visible} bbox={bb}")
            except:
                pass

    # Check for any card-like elements
    all_cards = page.locator("[class*='card'], [class*='Card']").all()
    print(f"  Found {len(all_cards)} card elements")
    for i, card in enumerate(all_cards[:10]):
        try:
            text = (card.inner_text() or "").strip()[:150]
            cls = card.get_attribute("class") or ""
            if text:
                print(f"  card[{i}]: class='{cls[:50]}' text='{text[:100]}'")
        except:
            pass

    # Also dump the report-related text
    print("\n=== Page text with '发布' or '确认' ===")
    body_text = page.locator("body").inner_text()
    for line in body_text.split('\n'):
        if '发布' in line or '确认' in line or '报告' in line:
            print(f"  {line.strip()[:120]}")

    browser.close()
    print("\n=== Done ===")
