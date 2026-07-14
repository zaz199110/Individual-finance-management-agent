from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    # Navigate to the API endpoint
    response = page.goto('http://localhost:3000/api/profile/current')
    content = page.content()
    
    # Parse the JSON from the page content
    # The page content will have the JSON in a pre tag
    import re
    json_match = re.search(r'<pre[^>]*>(.*?)</pre>', content, re.DOTALL)
    if json_match:
        json_str = json_match.group(1)
        data = json.loads(json_str)
        
        print("=== API Response ===")
        print(json.dumps(data, indent=2, ensure_ascii=False))
        
        # Check investment_constraints for each goal
        if 'goals' in data:
            for goal in data['goals']:
                print(f"\n=== Goal: {goal.get('goal_display_name', goal.get('goal_type'))} ===")
                constraints = goal.get('investment_constraints', {})
                print(f"investment_constraints keys: {list(constraints.keys())}")
                print(f"investment_constraints values: {json.dumps(constraints, indent=2, ensure_ascii=False)}")
    else:
        print("Could not find JSON in page content")
        print("Page content:", content[:2000])
    
    browser.close()
