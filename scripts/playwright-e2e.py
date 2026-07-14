"""Full E2E: chat → find publish card → confirm → verify in 我的报告"""
from playwright.sync_api import sync_playwright
import sys

BASE = "http://localhost:3000"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()

    # Step 1: Navigate to chat
    print("=== Step 1: Navigate to /chat ===")
    page.goto(f"{BASE}/chat", timeout=30000)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    page.screenshot(path="D:\\CursorProjects\\agent-demo-coding\\scripts\\step1-initial.png", full_page=True)

    # Step 2: Click on the latest conversation in sidebar
    print("\n=== Step 2: Click latest conversation ===")
    # Get conversation buttons (they appear in the sidebar)
    convo_buttons = page.locator("button:has-text('【需求梳理】')").all()
    print(f"  Found {len(convo_buttons)} conversation buttons")
    if convo_buttons:
        convo_buttons[0].click()
        page.wait_for_timeout(2000)
    page.screenshot(path="D:\\CursorProjects\\agent-demo-coding\\scripts\\step2-convo-clicked.png", full_page=True)

    # Step 3: Look for the report publish card in chat
    print("\n=== Step 3: Look for report publish card ===")
    # Scroll to bottom of chat
    chat_area = page.locator("[class*='chat-messages'], [class*='Messages']").first
    if chat_area.count() > 0:
        chat_area.evaluate("el => el.scrollTop = el.scrollHeight")
    page.wait_for_timeout(1000)
    page.screenshot(path="D:\\CursorProjects\\agent-demo-coding\\scripts\\step3-chat-bottom.png", full_page=True)

    # Let's print all visible text content in the chat
    print("\n=== Chat content text ===")
    all_chat_buttons = page.locator("button").all()
    for i, btn in enumerate(all_chat_buttons[:40]):
        try:
            text = (btn.inner_text() or "").strip()
            if text and len(text) < 200:
                print(f"  button[{i}]: '{text}'")
        except:
            pass

    # Also print all divs with actionable content
    print("\n=== Actionable content (buttons, links, inputs) ===")
    for tag in ["button", "a"]:
        elements = page.locator(tag).all()
        for el in elements:
            try:
                text = (el.inner_text() or "").strip()
                cls = el.get_attribute("class") or ""
                if any(kw in text for kw in ["发布", "确认", "生成", "报告", "publish", "report"]):
                    print(f"  <{tag}> class='{cls[:60]}' text='{text[:80]}'")
            except:
                pass

    # Step 4: Check for "确认发布" or "生成报告" buttons
    print("\n=== Step 4: Find publish-related elements ===")
    for sel in ["text=确认发布", "text=生成报告", "text=发布", "text=预览报告",
                "[class*='PublishCard']", "[class*='publish-card']",
                "[class*='ReportPublish']", "[class*='report-publish']"]:
        count = page.locator(sel).count()
        if count > 0:
            print(f"  Found {count} matching: '{sel}'")
            loc = page.locator(sel).first
            try:
                bb = loc.bounding_box()
                print(f"    bounding_box: {bb}")
            except:
                pass

    browser.close()
    print("\n=== Done ===")
