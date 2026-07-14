"""Full E2E: generate → publish with scope=combined → verify in reports."""
from playwright.sync_api import sync_playwright
import json

BASE = "http://localhost:3000"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()

    page.goto(f"{BASE}/chat", timeout=30000)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)

    conv_id = page.url.split("?c=")[1].split("&")[0].split("#")[0] if "?c=" in page.url else ""
    print(f"conversation_id: {conv_id}")

    # Step 1: Generate report (pass conversation_id so file_path is written)
    print("\n=== Step 1: Generate report ===")
    gen_result = page.evaluate("""
        async (convId) => {
            const res = await fetch('/api/profile/generate-report', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation_id: convId }),
            });
            return await res.json();
        }
    """, conv_id)
    print(f"  ok={gen_result.get('ok')}")
    draft_path = gen_result.get("file_path") or ""
    print(f"  draft_path={draft_path[:80]}...")

    if not draft_path:
        print("  ERROR: no draft_path returned!")
        browser.close()
        exit(1)

    # Step 2: Publish with scope: "combined" (no goal_constraint_id needed)
    print("\n=== Step 2: Publish with scope=combined ===")
    pub_result = page.evaluate("""
        async ({convId, draftPath}) => {
            const res = await fetch('/api/reports/publish', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversation_id: convId,
                    report_type: 'profile',
                    scope: 'combined',
                    draft_path: draftPath,
                }),
            });
            const data = await res.json();
            return { status: res.status, ok: data.ok, error: data.error, report_id: data.report_id };
        }
    """, {"convId": conv_id, "draftPath": draft_path})
    
    print(f"  status={pub_result['status']}")
    print(f"  ok={pub_result.get('ok')}")
    print(f"  error={pub_result.get('error')}")
    print(f"  report_id={pub_result.get('report_id')}")
    
    if pub_result.get("ok"):
        print("  ✅ Publish SUCCESS!")
    else:
        print(f"  ❌ Publish FAILED: {pub_result.get('error')}")

    # Step 3: Navigate to 我的报告
    print("\n=== Step 3: Verify in 我的报告 ===")
    page.goto(f"{BASE}/reports?c={conv_id}", timeout=30000)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    page.screenshot(path="D:\\CursorProjects\\agent-demo-coding\\scripts\\final-reports.png", full_page=True)

    # List reports
    body_text = page.locator("body").inner_text()
    report_lines = []
    in_section = False
    for line in body_text.split('\n'):
        l = line.strip()
        if l == "报告名称":
            in_section = True
            continue
        if in_section:
            if l and '投资需求' in l:
                report_lines.append(l)
    
    print(f"  Reports found: {len(report_lines)}")
    for rl in report_lines:
        print(f"    {rl}")

    # Step 4: Click first report to view content
    print("\n=== Step 4: View report content ===")
    first_report = page.locator(f"text=投资需求综合报告").first
    if first_report.count() > 0:
        first_report.click()
        page.wait_for_timeout(2000)
        
        # Check headings in report content
        report_content = page.locator("body").inner_text()
        print("\n=== Report content headings ===")
        for line in report_content.split('\n'):
            l = line.strip()
            if any(l.startswith(h) for h in ['基础信息', '个人资料', '收支概况', '资产与负债',
                                                '每月现金流分配', '投资场景', '财富增值', '子女教育',
                                                '退休养老', '结婚生育', '购房置业', 'AI建议', '合规提示',
                                                '风险偏好', '最大回撤承受', '目标年化收益']):
                print(f"    ✅ {l}")
        
        # Check for problematic patterns
        if '> ' in report_content:
            print("\n  ⚠️  Found '> ' blockquote in report (compliance section)")
        if '风险承受能力' in report_content:
            print("  ❌ OLD field name '风险承受能力' still present!")
        else:
            print("  ✅ No old field name '风险承受能力' found")
        if '最大回撤承受' in report_content:
            print("  ✅ New field name '最大回撤承受' present")

    browser.close()
    print("\n=== Done ===")
