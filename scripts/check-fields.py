# -*- coding: utf-8 -*-
import requests
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

response = requests.get('http://localhost:3000/api/profile/current')
data = response.json()

if 'goals' in data:
    for goal in data['goals']:
        name = goal.get('goal_display_name', goal.get('goal_type'))
        print(f"\n=== {name} ===")
        constraints = goal.get('investment_constraints', {})
        goal_detail = goal.get('goal_detail', {})
        
        print("investment_constraints:")
        for k, v in constraints.items():
            print(f"  {k}: {v}")
        
        print("goal_detail:")
        for k, v in goal_detail.items():
            print(f"  {k}: {v}")
