"""Clean up investment_constraints JSONB to match report fields ONLY.

Report reference: data/reports/profile/published/profile-report-1783416756976.md

Per-goal fields in report (values from 徐美丽):
  retirement:       风险偏好, 最大回撤承受, 目标年化收益, 一次性投入, 每月投入, 退休金领取日期, 每月退休生活支出
  education:        风险偏好, 最大回撤承受, 目标年化收益, 一次性投入, 每月投入, 计划开始日期, 资金需求日期
  housing:          风险偏好, 最大回撤承受, 目标年化收益, 一次性投入, 每月投入, 计划开始日期, 资金需求日期
  marriage_child:   风险偏好, 最大回撤承受, 目标年化收益, 一次性投入, 每月投入, 计划开始日期, 资金需求日期, 目标金额
  wealth_growth:    风险偏好, 最大回撤承受, 目标年化收益, 一次性投入, 每月投入, 投资期限

Fields to REMOVE from investment_constraints:
  deploy_mode, liquidity_need, expected_return, investment_scope, investment_horizon
"""

import json
import os
import sys

import psycopg

# Report values exactly as in the report
CLEAN = {
    "retirement": {
        "risk_tolerance": "稳健型",
        "max_drawdown": "15%",
        "target_return": 6,
        "principal_amount": 100000,
        "monthly_amount": 5000,
        "start_invest_date": "2025-01-01",
        "money_needed_date": "2055-01-01",
        "monthly_retirement_spending": 15000,
    },
    "education": {
        "risk_tolerance": "平衡型",
        "max_drawdown": "10%",
        "target_return": 7,
        "start_invest_date": "2025-01-01",
        "money_needed_date": "2038-09-01",
        "principal_amount": 50000,
        "monthly_amount": 3000,
    },
    "housing": {
        "risk_tolerance": "保守型",
        "max_drawdown": "5%",
        "target_return": 5,
        "start_invest_date": "2025-01-01",
        "money_needed_date": "2028-06-01",
        "principal_amount": 200000,
        "monthly_amount": 8000,
    },
    "marriage_child": {
        "risk_tolerance": "平衡型",
        "max_drawdown": "10%",
        "target_return": 6,
        "start_invest_date": "2025-01-01",
        "money_needed_date": "2027-12-01",
        "target_amount": 600000,
        "principal_amount": 80000,
        "monthly_amount": 3000,
    },
    "wealth_growth": {
        "risk_tolerance": "进取型",
        "max_drawdown": "20%",
        "target_return": 10,
        "investment_duration": "5年",
        "principal_amount": 300000,
        "monthly_amount": 10000,
    },
}


def main():
    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        print("[FAIL] DATABASE_URL missing")
        sys.exit(1)

    with psycopg.connect(db_url, connect_timeout=30) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT igc.id, igc.goal_type, igc.investment_constraints
                FROM investment_goal_constraints igc
                JOIN profile_versions pv ON pv.id = igc.profile_version_id
                WHERE igc.is_active = TRUE AND pv.is_current = TRUE
            """)
            rows = cur.fetchall()

            if not rows:
                print("[WARN] No active goals found.")
                return

            for row in rows:
                goal_id, goal_type, old_constraints = row
                clean = CLEAN.get(goal_type)
                if not clean:
                    print(f"  [SKIP] {goal_type}: no clean spec")
                    continue

                cur.execute(
                    """UPDATE investment_goal_constraints
                       SET investment_constraints = %s,
                           principal_amount = %s,
                           monthly_amount = %s
                       WHERE id = %s""",
                    (
                        json.dumps(clean, ensure_ascii=False),
                        clean["principal_amount"],
                        clean["monthly_amount"],
                        goal_id,
                    ),
                )
                print(f"  [OK] {goal_type}: replaced with report values ({len(clean)} fields)")

            conn.commit()
            print("\n[DONE] All goals cleaned to match report.")


if __name__ == "__main__":
    main()
