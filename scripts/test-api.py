# -*- coding: utf-8 -*-
import requests
import json
import sys

# Set stdout encoding to UTF-8
sys.stdout.reconfigure(encoding='utf-8')

# Fetch the API data
response = requests.get('http://localhost:3000/api/profile/current')
data = response.json()

print("=== API Response ===")
print(json.dumps(data, indent=2, ensure_ascii=False))

# Check investment_constraints for each goal
if 'goals' in data:
    for goal in data['goals']:
        print(f"\n=== Goal: {goal.get('goal_display_name', goal.get('goal_type'))} ===")
        constraints = goal.get('investment_constraints', {})
        print(f"investment_constraints keys: {list(constraints.keys())}")
        
        # Check for expected fields
        expected_fields = [
            'risk_tolerance',
            'max_drawdown',
            'expected_return',
            'deploy_mode',
            'liquidity_need',
            'investment_scope',
            'investment_horizon',
        ]
        
        print("\nExpected fields check:")
        for field in expected_fields:
            if field in constraints:
                print(f"  [OK] {field}: {constraints[field]}")
            else:
                print(f"  [MISSING] {field}")
        
        # Check goal_detail
        goal_detail = goal.get('goal_detail', {})
        if goal_detail:
            print(f"\ngoal_detail keys: {list(goal_detail.keys())}")
            for key, value in goal_detail.items():
                print(f"  {key}: {value}")
