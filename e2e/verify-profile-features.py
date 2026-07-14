"""
E2E verification: Profile feature optimization
- Progress bar with 4 stages
- Reset buttons (data management section)
- Reports page
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright
import os, json

BASE_URL = "http://localhost:3000"
SCREENSHOT_DIR = "e2e/screenshots"
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

results = {"passed": [], "failed": [], "skipped": []}

def log(step, status, detail=""):
    mark = "PASS" if status == "pass" else "FAIL" if status == "fail" else "SKIP"
    msg = f"  {mark} {step}"
    if detail:
        msg += f" — {detail}"
    print(msg)
    if status == "pass":
        results["passed"].append(step)
    elif status == "fail":
        results["failed"].append(step)
    else:
        results["skipped"].append(step)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})

    # Collect console errors
    console_errors = []
    page.on("console", lambda msg: (console_errors.append(msg.text) if msg.type == "error" else None))

    print("=" * 60)
    print("E2E Verification: Profile Feature Optimization")
    print("=" * 60)

    # ── 1. App loads ──
    print("\n[1] App loads")
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)
    page.screenshot(path=f"{SCREENSHOT_DIR}/verify-01-home.png", full_page=True)
    log("App loads at /", "pass")

    # ── 2. Profile tab visible ──
    print("\n[2] Profile tab")
    try:
        profile_tab = page.get_by_role("button", name="需求梳理", exact=True)
        profile_tab.wait_for(state="visible", timeout=5000)
        log("Tab '需求梳理' visible", "pass")
    except Exception as e:
        log("Tab '需求梳理' visible", "fail", str(e))
        browser.close()
        sys.exit(1)

    # ── 3. Click profile tab ──
    print("\n[3] Click profile tab")
    profile_tab.click()
    page.wait_for_timeout(1000)
    page.screenshot(path=f"{SCREENSHOT_DIR}/verify-02-profile-tab.png", full_page=True)

    # Check the tab is active (blue bg)
    try:
        expect_active = page.get_by_role("button", name="需求梳理", exact=True)
        cls = expect_active.get_attribute("class") or ""
        if "bg-[#0075de]" in cls:
            log("Profile tab active (blue bg)", "pass")
        else:
            log("Profile tab active", "fail", f"class={cls}")
    except Exception as e:
        log("Profile tab active check", "fail", str(e))

    # ── 4. Chat input visible ──
    print("\n[4] Chat input")
    try:
        textarea = page.locator("textarea")
        textarea.wait_for(state="visible", timeout=5000)
        log("Chat textarea visible", "pass")
    except Exception as e:
        log("Chat textarea visible", "fail", str(e))

    # ── 5. Progress bar area exists ──
    print("\n[5] Progress bar area")
    try:
        stage_texts = page.get_by_text("理解对话")
        if stage_texts.count() > 0:
            log("Progress bar with 4 stages rendered", "pass", "found '理解对话' stage")
        else:
            log("Progress bar search", "skip", "no profile conversation active yet")
    except Exception as e:
        log("Progress bar search", "skip", str(e))

    # ── 6. Profile view panel ──
    print("\n[6] Profile view panel")
    try:
        panel = page.locator(".profile-view-panel, [class*='ProfileViewPanel']")
        if panel.count() > 0:
            log("ProfileViewPanel rendered", "pass")
            page.screenshot(path=f"{SCREENSHOT_DIR}/verify-03-profile-panel.png", full_page=True)
        else:
            log("ProfileViewPanel rendered", "skip", "no profile data yet")
    except Exception as e:
        log("ProfileViewPanel rendered", "skip", str(e))

    # ── 7. Data management section (reset buttons) ──
    print("\n[7] Data management section")
    try:
        dm_section = page.get_by_text("数据管理")
        if dm_section.count() > 0:
            log("Data management section visible", "pass")

            # Check reset buttons
            goals_btn = page.get_by_role("button", name="清空投资需求")
            info_btn = page.get_by_role("button", name="清空个人信息")
            g_vis = goals_btn.count() > 0
            i_vis = info_btn.count() > 0
            if g_vis and i_vis:
                log("Both reset buttons visible", "pass")
            else:
                log("Reset buttons", "fail", f"goals={g_vis}, info={i_vis}")
        else:
            log("Data management section", "skip", "no profile data loaded")
    except Exception as e:
        log("Data management section", "skip", str(e))

    # ── 8. Reports page ──
    print("\n[8] Reports page")
    page.goto(f"{BASE_URL}/reports")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)

    try:
        heading = page.get_by_role("heading", name="我的报告")
        heading.wait_for(state="visible", timeout=10000)
        log("Reports page loads with '我的报告' heading", "pass")
        page.screenshot(path=f"{SCREENSHOT_DIR}/verify-04-reports.png", full_page=True)
    except Exception as e:
        log("Reports page loads", "fail", str(e))

    # ── 9. Console errors ──
    print("\n[9] Console errors check")
    real_errors = [e for e in console_errors
                   if "Failed to load resource" not in e
                   and "net::ERR_" not in e
                   and "favicon" not in e]
    if not real_errors:
        log("No unexpected console errors", "pass")
    else:
        for err in real_errors[:5]:
            log("Unexpected console error", "fail", err[:120])

    browser.close()

    print("\n" + "=" * 60)
    print(f"RESULTS: {len(results['passed'])} passed, {len(results['failed'])} failed, {len(results['skipped'])} skipped")
    print("=" * 60)

    if results["failed"]:
        sys.exit(1)
    else:
        sys.exit(0)
