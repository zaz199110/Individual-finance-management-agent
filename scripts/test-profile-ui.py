# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    
    # Navigate to the chat page with profile tab
    page.goto('http://localhost:3000/chat')
    page.wait_for_load_state('networkidle')
    
    # Click on the "当前画像" tab
    page.click('button:has-text("当前画像")')
    page.wait_for_timeout(2000)
    
    # Take a screenshot
    page.screenshot(path='D:\\CursorProjects\\agent-demo-coding\\scripts\\profile-screenshot.png', full_page=True)
    
    # Check if the fields are displayed
    content = page.content()
    
    # Check for expected fields
    expected_fields = [
        "风险偏好",
        "最大回撤承受",
        "期望年化收益",
        "投入方式",
        "流动性需求",
        "投资范围",
        "投资期限",
        "退休年龄",
        "每月生活成本",
        "商业保险",
        "社保状况",
    ]
    
    print("=== Checking for expected fields ===")
    for field in expected_fields:
        if field in content:
            print(f"✓ Found: {field}")
        else:
            print(f"✗ Missing: {field}")
    
    browser.close()
