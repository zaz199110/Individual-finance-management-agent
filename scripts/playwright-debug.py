"""Debug: capture full generate-report response."""
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

    # Call generate and capture full response
    result = page.evaluate("""
        async () => {
            const res = await fetch('/api/profile/generate-report', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const text = await res.text();
            return { status: res.status, text: text };
        }
    """)
    
    print(f"Status: {result['status']}")
    # Parse and pretty print
    try:
        data = json.loads(result['text'])
        ok = data.get('ok')
        fp = data.get('file_path', 'MISSING')
        name = data.get('report_name', 'MISSING')
        print(f"ok={ok}")
        print(f"report_name={name}")
        print(f"file_path={fp}")
        print(f"keys: {list(data.keys())}")
    except:
        print(f"Raw text (first 500 chars): {result['text'][:500]}")

    browser.close()
