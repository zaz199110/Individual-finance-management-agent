"""Verify main page loads, profile tab switches, and no errors after our fixes."""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text[:200]}") if msg.type == "error" else None)
    page.on("pageerror", lambda err: errors.append(f"[pageerror] {err.message}"))

    # 1. Load main page
    page.goto("http://localhost:3000/")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    # 2. Click tab tabs
    for tab_name in ["需求梳理", "资产配置", "持仓分析", "基金解析", "自由问答"]:
        try:
            tab = page.get_by_role("button", name=tab_name, exact=True)
            if tab.is_visible(timeout=3000):
                tab.click()
                page.wait_for_timeout(500)
                print(f"  Tab OK: {tab_name}")
        except Exception as e:
            print(f"  Tab FAIL: {tab_name} - {e}")

    # 3. Filter real errors
    real_errors = [e for e in errors if
        "Failed to load resource" not in e
        and "net::ERR_" not in e
        and "favicon" not in e.lower()
        and "Next/font" not in e
    ]

    print(f"\nConsole errors (filtered): {len(real_errors)}")
    for e in real_errors[:15]:
        print(f"  {e}")

    if not real_errors:
        print("  PASS: no console errors")

    page.screenshot(path="e2e/screenshots/verify-all-tabs.png", full_page=True)
    print("\nScreenshot: e2e/screenshots/verify-all-tabs.png")

    browser.close()
    print("\nDone.")
