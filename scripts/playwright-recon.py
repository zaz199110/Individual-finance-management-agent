"""Recon: capture UI state and list interactive elements."""
from playwright.sync_api import sync_playwright
import sys, json

BASE = "http://localhost:3000"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()

    print("=== Navigating to /chat ===")
    page.goto(f"{BASE}/chat", timeout=30000)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    print("=== Screenshot ===")
    page.screenshot(path="D:\\CursorProjects\\agent-demo-coding\\scripts\\recon-chat.png", full_page=True)

    print("=== Page title ===")
    print(page.title())

    print("\n=== Buttons ===")
    buttons = page.locator("button").all()
    for i, btn in enumerate(buttons[:30]):
        text = ""
        try:
            text = (btn.inner_text() or "").strip()[:60]
        except:
            pass
        visible = btn.is_visible()
        print(f"  [{i}] visible={visible} text='{text}'")

    print("\n=== Links (a tags) ===")
    links = page.locator("a").all()
    for i, a in enumerate(links[:20]):
        href = a.get_attribute("href") or ""
        text = (a.inner_text() or "").strip()[:60]
        print(f"  [{i}] href='{href}' text='{text}'")

    print("\n=== Headings (h1-h3) ===")
    for tag in ["h1", "h2", "h3"]:
        elements = page.locator(tag).all()
        for el in elements:
            try:
                txt = (el.inner_text() or "").strip()[:80]
                if txt:
                    print(f"  <{tag}> {txt}")
            except:
                pass

    print("\n=== Divs with role/aria ===")
    regions = page.locator("[role]").all()
    for r in regions[:20]:
        role = r.get_attribute("role")
        label = r.get_attribute("aria-label") or ""
        text = (r.inner_text() or "").strip()[:60]
        print(f"  role='{role}' aria-label='{label}' text='{text}'")

    # Check if there's a profile panel
    print("\n=== Looking for profile/report elements ===")
    for sel in [".profile-view-panel", "[data-testid]", "#profile-view", ".report-publish-card",
                "text=我的报告", "text=投资需求", "text=确认发布", "text=预览",
                "[class*='profile']", "[class*='report']", "[class*='publish']"]:
        count = page.locator(sel).count()
        if count > 0:
            print(f"  Found {count} element(s) matching: {sel}")

    # Check console errors
    print("\n=== Console errors ===")
    for msg in context.consoles if hasattr(context, 'consoles') else []:
        if msg.type == "error":
            print(f"  ERROR: {msg.text}")

    browser.close()
    print("\n=== Done ===")
