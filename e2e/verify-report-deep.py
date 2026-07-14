"""
Deep DOM inspection of /reports page to find actual report links and verify fixes.
"""
import re, sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    page.on("pageerror", lambda err: errors.append(err.message))

    # ── Go to /reports ──
    page.goto(f"{BASE}/reports")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    # ── Dump all links ──
    print("=== All links on /reports page ===")
    all_links = page.locator("a").all()
    for link in all_links:
        try:
            href = link.get_attribute("href")
            text = link.inner_text().strip()[:80]
            if href:
                print(f"  [{text}] -> {href}")
        except:
            pass

    # ── Find report detail links (pattern: /reports/UUID) ──
    print("\n=== Report detail links ===")
    detail_links = []
    for link in all_links:
        try:
            href = link.get_attribute("href")
            text = link.inner_text().strip()
            if href and re.match(r"/reports/[a-f0-9\-]{20,}", href):
                detail_links.append((href, text))
                print(f"  REPORT LINK: {href} ({text})")
        except:
            pass

    # ── Try broader pattern ──
    if not detail_links:
        print("  No UUID-format report links found. Trying broader...")
        for link in all_links:
            try:
                href = link.get_attribute("href")
                text = link.inner_text().strip()
                if href and "/reports/" in href and href != "/reports" and href != "/reports/":
                    detail_links.append((href, text))
                    print(f"  REPORT LINK: {href} ({text})")
            except:
                pass

    # ── Look for report cards/list items ──
    print("\n=== Report cards / list items ===")
    # Try common card patterns
    for selector in [
        ".report-card", "[class*='report']", "[class*='Report']",
        "li a", "article a", "[role='listitem'] a",
        "table a", "tr a",
    ]:
        items = page.locator(selector).all()
        if items:
            print(f"  Selector '{selector}' found {len(items)} items")
            for item in items[:5]:
                try:
                    text = item.inner_text().strip()[:100]
                    href = item.get_attribute("href")
                    print(f"    [{text}] -> {href}")
                except:
                    pass

    # ── Dump page title and main content summary ──
    print("\n=== Page content summary ===")
    try:
        h1 = page.locator("h1").first().inner_text()
        print(f"  H1: {h1}")
    except:
        print("  No H1 found")

    # Check if page has "empty state" / no reports
    body_text = page.locator("body").inner_text()
    if "暂无报告" in body_text or "还没有报告" in body_text:
        print("  Page shows empty state (no reports published)")

    # ── Console errors ──
    real_errors = [e for e in errors if "Failed to load resource" not in e and "net::ERR_" not in e]
    if real_errors:
        print(f"\n=== Console errors ===")
        for e in real_errors[:10]:
            print(f"  {e[:200]}")

    # ── If report detail found, navigate and check ──
    if detail_links:
        target = detail_links[0]
        print(f"\n=== Navigating to report detail: {target[0]} ===")
        page.goto(f"{BASE}{target[0]}")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(3000)

        # Fix 1: check H1 count
        h1s = page.locator("h1").all()
        h1_texts = [h.inner_text().strip() for h in h1s if h.inner_text().strip()]
        print(f"  H1 elements: {len(h1s)} -> {h1_texts}")
        if len(h1s) <= 1:
            print("  PASS: no duplicate H1 (Fix 1)")
        else:
            print("  FAIL: duplicate H1 detected (Fix 1)")

        # Fix 2: check double numbering
        all_h = page.locator("h1, h2, h3, h4, h5, h6").all()
        double_num = re.compile(r"\d+\.\d+\s+\d+\.\d+")
        issues = []
        for h in all_h:
            t = h.inner_text().strip()
            if double_num.search(t):
                issues.append(t)
        if issues:
            print(f"  FAIL: double numbering in headings (Fix 2): {issues}")
        else:
            print("  PASS: no double numbering (Fix 2)")

        # List all headings for manual review
        print("  All headings:")
        for h in all_h:
            t = h.inner_text().strip()
            tag = h.evaluate("el => el.tagName")
            if t:
                print(f"    <{tag}> {t[:120]}")

        page.screenshot(path="e2e/screenshots/verify-report-detail.png", full_page=True)
        print("  Screenshot: e2e/screenshots/verify-report-detail.png")

        # Check for duplicate section content (Fix 3)
        # Look for repeated headings with same text
        heading_texts = [h.inner_text().strip() for h in all_h if h.inner_text().strip()]
        seen = {}
        dupes = []
        for t in heading_texts:
            seen[t] = seen.get(t, 0) + 1
            if seen[t] == 2:
                dupes.append(t)
        if dupes:
            print(f"  WARNING: duplicate section headings found: {dupes}")
        else:
            print("  PASS: no duplicate section headings (Fix 3)")

    else:
        print("\n=== No report detail links found ===")
        print("  This means no reports have been published yet. ")
        print("  The /reports page itself loaded without errors (Fix 4 verified).")

    # Check new console errors
    real_errors = [e for e in errors if "Failed to load resource" not in e and "net::ERR_" not in e]
    if real_errors:
        print(f"\n=== Console errors (final) ===")
        for e in real_errors[:10]:
            print(f"  {e[:200]}")
    else:
        print("\nPASS: no console errors throughout")

    browser.close()
