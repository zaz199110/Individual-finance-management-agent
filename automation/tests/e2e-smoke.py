"""
E2E smoke test - verify ProfileViewPanel / Chat / Reports pages render correctly.
"""
import os, sys, json
from datetime import datetime
from playwright.sync_api import sync_playwright

# Force UTF-8 output on Windows to avoid cp950 encode errors with CJK
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

BASE = "http://localhost:3000"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "output", "e2e")
os.makedirs(OUTPUT_DIR, exist_ok=True)

CHECK = "PASS"
CROSS = "FAIL"

def ss(page, name):
    """Take a screenshot to output dir."""
    path = os.path.join(OUTPUT_DIR, name)
    page.screenshot(path=path, full_page=True)
    print(f"  [SCREENSHOT] {path}")
    return path

def run():
    results = {"pass": 0, "fail": 0, "checks": []}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        try:
            # --- 1. Home redirect to /chat ---
            print("\n=== 1. Home redirect -> /chat ===")
            page.goto(BASE, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(2000)
            ss(page, "01-chat-landing.png")

            current_url = page.url
            ok = "/chat" in current_url
            results["pass" if ok else "fail"] += 1
            results["checks"].append({"test": "home -> /chat redirect", "pass": ok, "url": current_url})
            print(f"  URL: {current_url} [{CHECK if ok else CROSS}]")

            # --- 2. ChatShell interactivity ---
            print("\n=== 2. ChatShell ===")
            chat_input = page.locator("textarea, [contenteditable]").first
            input_visible = chat_input.is_visible()
            results["pass" if input_visible else "fail"] += 1
            results["checks"].append({"test": "chat input visible", "pass": input_visible})
            print(f"  Chat input visible: {input_visible} [{CHECK if input_visible else CROSS}]")

            # Check scene tabs
            tabs = page.locator("button, [role='tab'], nav a").all()
            tab_texts = []
            for t in tabs:
                try:
                    txt = t.text_content()
                    if txt and len(txt) < 20:
                        tab_texts.append(txt.strip())
                except:
                    pass
            scene_keywords = ["问答", "需求梳理", "资产配置", "持仓分析", "基金解析"]
            scene_tabs_found = sum(1 for t in tab_texts for kw in scene_keywords if kw in t)
            ok = scene_tabs_found >= 3
            results["pass" if ok else "fail"] += 1
            results["checks"].append({"test": "scene tabs", "pass": ok, "found": scene_tabs_found})
            print(f"  Scene tabs found: {scene_tabs_found}/5 [{CHECK if ok else CROSS}]")

            # --- 3. Reports page ---
            print("\n=== 3. /reports ===")
            page.goto(f"{BASE}/reports", wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(2000)
            ss(page, "02-reports.png")
            ok = "/reports" in page.url
            results["pass" if ok else "fail"] += 1
            results["checks"].append({"test": "/reports loads", "pass": ok})
            print(f"  [{CHECK if ok else CROSS}]")

            # --- 4. Reports view ---
            print("\n=== 4. /reports/view ===")
            page.goto(f"{BASE}/reports/view", wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(2000)
            ss(page, "03-reports-view.png")
            ok = "/reports/view" in page.url
            results["pass" if ok else "fail"] += 1
            results["checks"].append({"test": "/reports/view loads", "pass": ok})
            print(f"  [{CHECK if ok else CROSS}]")

            # --- 5. Settings ---
            print("\n=== 5. /settings/models ===")
            page.goto(f"{BASE}/settings/models", wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(2000)
            ss(page, "04-settings-models.png")
            ok = "/settings/models" in page.url
            results["pass" if ok else "fail"] += 1
            results["checks"].append({"test": "/settings/models loads", "pass": ok})
            print(f"  [{CHECK if ok else CROSS}]")

            # --- 6. Fund knowledge ---
            print("\n=== 6. /fund-knowledge ===")
            page.goto(f"{BASE}/fund-knowledge", wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(2000)
            ss(page, "05-fund-knowledge.png")
            ok = "/fund-knowledge" in page.url
            results["pass" if ok else "fail"] += 1
            results["checks"].append({"test": "/fund-knowledge loads", "pass": ok})
            print(f"  [{CHECK if ok else CROSS}]")

            # --- 7. Console errors ---
            print("\n=== 7. Console errors on /chat ===")
            console_msgs = []
            def on_console(msg):
                if msg.type in ("error", "warning"):
                    console_msgs.append(f"[{msg.type}] {msg.text}")
            page.on("console", on_console)
            page.goto(f"{BASE}/chat", wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(3000)
            error_count = len(console_msgs)
            ok = error_count == 0
            results["pass" if ok else "fail"] += 1
            results["checks"].append({"test": "no console errors", "pass": ok, "count": error_count})
            print(f"  Console errors/warnings: {error_count} [{CHECK if ok else CROSS}]")
            for m in console_msgs[:10]:
                print(f"    [line] {m[:120]}")

            # --- 8. Take a full chat screenshot ---
            page.goto(f"{BASE}/chat", wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(3000)
            ss(page, "06-chat-final.png")

        except Exception as e:
            print(f"\n[FATAL] {e}")
            results["fail"] += 1
            results["checks"].append({"test": "fatal error", "pass": False, "error": str(e)[:200]})
            import traceback
            traceback.print_exc()

        finally:
            browser.close()

    # --- Summary ---
    print(f"\n{'='*50}")
    print(f"RESULTS: {results['pass']} pass / {results['fail']} fail")
    total = results["pass"] + results["fail"]
    print(f"Score: {results['pass']}/{total}")
    print(f"Screenshots: {OUTPUT_DIR}")

    report = {
        "timestamp": datetime.now().isoformat(),
        "pass": results["pass"],
        "fail": results["fail"],
        "checks": results["checks"],
    }
    report_path = os.path.join(OUTPUT_DIR, "report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print(f"Report: {report_path}")

    failures = [c for c in results["checks"] if not c["pass"]]
    if failures:
        print("\nFAILURES:")
        for f_item in failures:
            print(f"  - {f_item['test']}")

    return 0 if results["fail"] == 0 else 1

if __name__ == "__main__":
    sys.exit(run())
