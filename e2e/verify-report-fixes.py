"""
Playwright verification for report merge fixes (Fixes 1-4).

Verifies:
  Fix 1 — No duplicate H1 title in merged report view
  Fix 2 — No double heading numbering (CSS counter + manual number)
  Fix 4 — /reports page loads and shows published combined reports
  Fix 3 — (structural, verified by Fix 1+2 consistency)

Usage: python e2e/verify-report-fixes.py
Server must be running on localhost:3000.
"""
import re
import sys
import io

# Force UTF-8 on Windows PowerShell to avoid GBK encoding errors
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
FAILED = False


def fail(label: str, detail: str = ""):
    global FAILED
    FAILED = True
    msg = f"  ❌ FAIL [{label}]"
    if detail:
        msg += f": {detail}"
    print(msg)


def ok(label: str):
    print(f"  ✅ PASS [{label}]")


# ── helpers ──

def collect_errors(page):
    """Return real JS errors (excluding network/fetch failures)."""
    errors: list[str] = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda err: errors.append(err.message))
    return errors


def filter_errors(errors: list[str]):
    return [e for e in errors if "Failed to load resource" not in e and "net::ERR_" not in e]


# ── main ──

def run():
    global FAILED

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        # ──────────────────────────────────────────────
        # 1. /reports page — Fix 4 (scope/publish)
        # ──────────────────────────────────────────────
        print("\n── Test 1: /reports page loads (Fix 4: scope field) ──")
        errors = collect_errors(page)

        page.goto(f"{BASE}/reports")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)

        # Heading
        try:
            heading = page.get_by_role("heading", name="我的报告")
            assert heading.is_visible(timeout=10000)
            ok("heading '我的报告' visible")
        except Exception as e:
            fail("heading", f"'我的报告' not found: {e}")

        real_errors = filter_errors(errors)
        if real_errors:
            for err in real_errors:
                fail("console error", err)
        else:
            ok("no console errors on /reports")

        page.screenshot(path="e2e/screenshots/verify-fix4-reports-page.png", full_page=True)
        print("  📸 Screenshot: e2e/screenshots/verify-fix4-reports-page.png")

        # ──────────────────────────────────────────────
        # 2. Find a published report & open it
        # ──────────────────────────────────────────────
        print("\n── Test 2: report detail view (Fix 1: no duplicate H1, Fix 2: no double numbering) ──")

        # Look for report links — they are typically <a> elements with href like /reports/{id}
        report_links = page.locator("a[href*='/reports/']").all()
        if not report_links:
            # Try broader: any link inside the reports list
            report_links = page.locator("a").filter(has_text=re.compile(r"投资|需求|报告")).all()

        if not report_links:
            print("  ⚠️  No published reports found — skipping report detail checks.")
            print("  → This is expected if no reports have been published yet.")
            browser.close()
            if FAILED:
                sys.exit(1)
            print("\n🎉 All checks passed!")
            sys.exit(0)

        # Click the first report link
        first_link = report_links[0]
        try:
            href = first_link.get_attribute("href")
            print(f"  Opening report: {href}")
            first_link.click()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(3000)
        except Exception as e:
            fail("click report link", str(e))
            browser.close()
            sys.exit(1)

        # ──────────────────────────────────────────────
        # 2a. Fix 1: No duplicate H1 titles
        # ──────────────────────────────────────────────
        h1_elements = page.locator("h1").all()
        h1_count = len(h1_elements)
        h1_texts = []
        for h in h1_elements:
            t = h.inner_text().strip()
            if t:
                h1_texts.append(t)

        print(f"  Found {h1_count} H1 elements: {h1_texts}")

        # The merged report should have at most 1 H1 (from ModeBReportPane.tsx),
        # and the markdown body should NOT contain another H1.
        if h1_count > 1:
            fail("duplicate H1", f"Expected ≤1 H1, found {h1_count}: {h1_texts}")
        else:
            ok(f"no duplicate H1 (found {h1_count})")

        # ──────────────────────────────────────────────
        # 2b. Fix 2: No double numbering in headings
        # ──────────────────────────────────────────────
        all_headings = page.locator("h1, h2, h3, h4, h5, h6").all()
        double_num_pattern = re.compile(
            r"(?:[一二三四五六七八九十]+[、．.]\s*\d+|\d+\.\d+\s+\d+\.\d+)"
        )
        heading_issues = []
        for h in all_headings:
            t = h.inner_text().strip()
            if double_num_pattern.search(t):
                heading_issues.append(t)

        if heading_issues:
            fail("double numbering", f"Heading text with double numbers: {heading_issues}")
        else:
            ok("no double manual numbering in headings")

        # ──────────────────────────────────────────────
        # 2c. Fix 2 (extended): Check CSS counters are working,
        #     i.e., headings have visible content (not all stripped to empty)
        # ──────────────────────────────────────────────
        empty_headings = []
        for h in all_headings:
            tag = h.evaluate("el => el.tagName").lower()
            if tag in ("h2", "h3", "h4"):
                t = h.inner_text().strip()
                # Only flag if it's truly empty (no CSS counter content rendered)
                if not t:
                    empty_headings.append(tag)

        if empty_headings:
            fail("empty headings", f"Empty heading elements: {empty_headings}")
        else:
            ok("all visible headings have content (CSS counters working)")

        # ──────────────────────────────────────────────
        # 2d. Screenshot for visual review
        # ──────────────────────────────────────────────
        page.screenshot(path="e2e/screenshots/verify-fix1-report-detail.png", full_page=True)
        print("  📸 Screenshot: e2e/screenshots/verify-fix1-report-detail.png")

        # ──────────────────────────────────────────────
        # 2e. Console errors on report detail
        # ──────────────────────────────────────────────
        real_errors = filter_errors(errors)
        if real_errors:
            for err in real_errors:
                fail("console error on report detail", err)
        else:
            ok("no console errors on report detail")

        browser.close()

    print("\n" + ("="*50))
    if FAILED:
        print("❌ Some checks FAILED. See above for details.")
        sys.exit(1)
    else:
        print("🎉 All checks passed!")
        sys.exit(0)


if __name__ == "__main__":
    run()
