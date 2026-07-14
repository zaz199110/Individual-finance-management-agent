"""E2E verification: Portfolio report cleanup refactor.
Validates the new 6-chapter, 2-chart, no-variant report structure.
"""
from playwright.sync_api import sync_playwright
import time, sys, os

BASE_URL = "http://localhost:3000"
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "..", "tmp", "portfolio-e2e")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

def save_screenshot(page, name):
    path = os.path.join(SCREENSHOT_DIR, f"{name}.png")
    page.screenshot(path=path, full_page=True)
    print(f"[SCREENSHOT] {path}")
    return path

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})

        # --- Step 1: Check /reports page ---
        print("=" * 60)
        print("Step 1: Checking /reports page...")
        print("=" * 60)
        page.goto(f"{BASE_URL}/reports", timeout=15000)
        page.wait_for_load_state("networkidle", timeout=15000)
        page.wait_for_timeout(2000)
        save_screenshot(page, "01-reports-page")

        # Check page content
        content = page.content()
        has_portfolio_section = "持仓" in content
        has_report_items = "report-card" in content or "truncated-url" in content
        print(f"  Has portfolio section: {has_portfolio_section}")
        print(f"  Has report items: {has_report_items}")

        # Look for portfolio report links
        report_links = page.locator('a[href*="report"]').all()
        print(f"  Found {len(report_links)} report links")

        # If no reports exist, we need to generate one
        has_existing_reports = len(report_links) > 0

        if not has_existing_reports:
            print("\n" + "=" * 60)
            print("Step 2: No existing reports. Generating via chat...")
            print("=" * 60)

            # Go to chat page
            page.goto(f"{BASE_URL}/chat", timeout=15000)
            page.wait_for_load_state("networkidle", timeout=15000)
            page.wait_for_timeout(2000)
            save_screenshot(page, "02-chat-page")

            # Look for the chat input
            chat_input = page.locator('textarea, [contenteditable="true"], input[type="text"]').first
            if chat_input.is_visible():
                # Type "用样例持仓" to load sample holdings
                chat_input.fill("用样例持仓")
                page.wait_for_timeout(500)

                # Try to find and click send button
                send_btn = page.locator('button[type="submit"], button:has-text("发送")').first
                if send_btn.is_visible():
                    send_btn.click()
                    print("  Sent: 用样例持仓")

                    # Wait for AI response (up to 60s)
                    print("  Waiting for AI response (up to 60s)...")
                    page.wait_for_timeout(10000)
                    save_screenshot(page, "03-after-sample-request")

                    # Check for confirm card or response
                    content_after = page.content()
                    if "确认" in content_after or "confirm" in content_after.lower():
                        print("  Got confirm card, clicking confirm...")
                        confirm_btn = page.locator('button:has-text("确认"), button:has-text("Confirm")').first
                        if confirm_btn.is_visible():
                            confirm_btn.click()
                            page.wait_for_timeout(5000)
                            save_screenshot(page, "04-after-confirm")

                    # Now request report generation
                    chat_input2 = page.locator('textarea, [contenteditable="true"], input[type="text"]').first
                    if chat_input2.is_visible():
                        chat_input2.fill("生成持仓报告")
                        page.wait_for_timeout(500)
                        send_btn2 = page.locator('button[type="submit"], button:has-text("发送")').first
                        if send_btn2.is_visible():
                            send_btn2.click()
                            print("  Sent: 生成持仓报告")
                            print("  Waiting for report generation (up to 90s)...")
                            # Wait for report to be generated - this takes time
                            page.wait_for_timeout(30000)
                            save_screenshot(page, "05-after-report-request")

                            # Look for publish button
                            publish_btn = page.locator('button:has-text("发布"), button:has-text("Publish")').first
                            if publish_btn.is_visible():
                                print("  Found publish button, clicking...")
                                publish_btn.click()
                                page.wait_for_timeout(5000)
                                save_screenshot(page, "06-after-publish")
                else:
                    print("  WARNING: Send button not found")
            else:
                print("  WARNING: Chat input not found")
        else:
            print("\nExisting reports found. Clicking first one...")

        # --- Step 3: View the report ---
        print("\n" + "=" * 60)
        print("Step 3: Viewing portfolio report...")
        print("=" * 60)

        # Go to reports page and click the first portfolio report
        page.goto(f"{BASE_URL}/reports", timeout=15000)
        page.wait_for_load_state("networkidle", timeout=15000)
        page.wait_for_timeout(2000)

        # Click the first report link
        report_link = page.locator('a[href*="report"]').first
        if report_link.is_visible():
            report_link.click()
            page.wait_for_load_state("networkidle", timeout=15000)
            page.wait_for_timeout(3000)
            save_screenshot(page, "07-report-view")
        else:
            # Try going to /reports/view directly
            page.goto(f"{BASE_URL}/reports/view", timeout=15000)
            page.wait_for_load_state("networkidle", timeout=15000)
            page.wait_for_timeout(3000)
            save_screenshot(page, "07-report-view-fallback")

        # --- Step 4: Analyze report content ---
        print("\n" + "=" * 60)
        print("Step 4: Content analysis...")
        print("=" * 60)
        content = page.content()

        checks = {
            "标题含'持仓分析报告'": "持仓分析报告" in content,
            "第一章 收益概况": "收益概况" in content,
            "第二章 持仓明细": "持仓明细" in content,
            "第三章 结构分布": "结构分布" in content,
            "第四章 基金深度": "基金深度" in content,
            "第五章 风险与合规": "风险与合规" in content,
            "第六章 免责与测算": "免责与测算" in content,
            "无'对照方案'": "对照方案" not in content,
            "无'再平衡'": "再平衡" not in content,
            "无'阅读指引'": "阅读指引" not in content,
            "无'三句话'": "三句话" not in content,
            "无'持仓速览'": "持仓速览" not in content,
            "有QDII分类": "QDII型" in content,
            "有echarts图表": "echarts" in content.lower(),
        }

        all_pass = True
        for check, result in checks.items():
            status = "✓ PASS" if result else "✗ FAIL"
            if not result:
                all_pass = False
            print(f"  {status}: {check}")

        # Print report text (first 3000 chars)
        body_text = page.locator("body").inner_text()
        print("\n--- Report Text (first 3000 chars) ---")
        print(body_text[:3000])
        print("--- End ---")

        print(f"\n{'=' * 60}")
        if all_pass:
            print("ALL CHECKS PASSED ✓")
        else:
            print("SOME CHECKS FAILED ✗")
        print(f"Screenshots saved to: {SCREENSHOT_DIR}")
        print("=" * 60)

        browser.close()
        return all_pass

if __name__ == "__main__":
    success = run()
    sys.exit(0 if success else 1)
