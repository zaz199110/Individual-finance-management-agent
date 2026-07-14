#!/usr/bin/env python3
"""P2 · 五 goal_type 完善投资需求 seed（同一客户张先生 · Hook #8）。

写入：profile_versions · investment_goal_constraints · goal_constraint_revisions
     · report_index + 本地 profile 报告 md

用法（项目根）：
  python automation/scripts/seed_profile_five_goals.py
  python automation/scripts/seed_profile_five_goals.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

ROOT = Path(__file__).resolve().parents[2]
SEED_JSON = ROOT / "requirement" / "docs" / "samples" / "profile-propose-payload.examples.json"
REPORT_STUBS = ROOT / "seed" / "profile-reports"
PUBLISHED_DIR = ROOT / "data" / "reports" / "profile" / "published"

PROFILE_VERSION_ID = UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890")

GOALS: list[dict] = [
    {
        "goal_type": "retirement",
        "goal_id": UUID("8f3c2a1b-4d5e-6f70-8192-a3b4c5d6e7f0"),
        "revision_id": UUID("a1111111-1111-4111-8111-111111111101"),
        "display_name": "退休养老",
        "report_file": "retirement-profile.md",
    },
    {
        "goal_type": "education",
        "goal_id": UUID("8f3c2a1b-4d5e-6f70-8192-a3b4c5d6e7f1"),
        "revision_id": UUID("a1111111-1111-4111-8111-111111111102"),
        "display_name": "子女教育",
        "report_file": "education-profile.md",
    },
    {
        "goal_type": "housing",
        "goal_id": UUID("9a1b2c3d-4e5f-6789-abcd-ef1234567891"),
        "revision_id": UUID("a1111111-1111-4111-8111-111111111103"),
        "display_name": "购房置业",
        "report_file": "housing-profile.md",
    },
    {
        "goal_type": "marriage_child",
        "goal_id": UUID("9a1b2c3d-4e5f-6789-abcd-ef1234567892"),
        "revision_id": UUID("a1111111-1111-4111-8111-111111111104"),
        "display_name": "结婚生育",
        "report_file": "marriage-child-profile.md",
    },
    {
        "goal_type": "wealth_growth",
        "goal_id": UUID("9a1b2c3d-4e5f-6789-abcd-ef1234567893"),
        "revision_id": UUID("a1111111-1111-4111-8111-111111111105"),
        "display_name": "财富增值",
        "report_file": "wealth-growth-profile.md",
    },
]


def load_env() -> None:
    path = ROOT / ".env.local"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip()
        if key and val and key not in os.environ:
            os.environ[key] = val


def load_payload() -> dict:
    return json.loads(SEED_JSON.read_text(encoding="utf-8"))


def goal_payload(raw: dict, goal_type: str) -> dict:
    key = f"goal_constraint_{goal_type}"
    if key not in raw:
        raise KeyError(f"missing {key} in profile-propose-payload.examples.json")
    return raw[key]


def ensure_report_files() -> None:
    PUBLISHED_DIR.mkdir(parents=True, exist_ok=True)
    for g in GOALS:
        src = REPORT_STUBS / g["report_file"]
        if not src.exists():
            raise FileNotFoundError(src)
        dest = PUBLISHED_DIR / f"{g['goal_id']}-profile.md"
        dest.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        g["published_path"] = str(dest.resolve())


def apply_seed(dry_run: bool) -> None:
    raw = load_payload()
    basic = raw["profile_basic"]["basic_info"]
    now = datetime.now(timezone.utc).isoformat()
    ensure_report_files()

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        print("[FAIL] DATABASE_URL missing in .env.local")
        sys.exit(1)

    if dry_run:
        print("[DRY] would seed profile + 5 goals + 5 profile reports")
        return

    import psycopg

    goal_ids = [str(g["goal_id"]) for g in GOALS]

    with psycopg.connect(db_url, connect_timeout=30) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE profile_versions SET is_current = FALSE WHERE is_current = TRUE"
            )
            cur.execute(
                """
                INSERT INTO profile_versions (id, is_current, basic_info, confirmed_at)
                VALUES (%s, TRUE, %s::jsonb, %s)
                ON CONFLICT (id) DO UPDATE SET
                  is_current = EXCLUDED.is_current,
                  basic_info = EXCLUDED.basic_info,
                  confirmed_at = EXCLUDED.confirmed_at
                """,
                (str(PROFILE_VERSION_ID), json.dumps(basic, ensure_ascii=False), now),
            )

            for g in GOALS:
                gp = goal_payload(raw, g["goal_type"])
                cur.execute(
                    """
                    UPDATE investment_goal_constraints
                    SET is_active = FALSE
                    WHERE goal_type = %s AND is_active = TRUE AND id <> %s
                    """,
                    (g["goal_type"], str(g["goal_id"])),
                )
                cur.execute(
                    """
                    INSERT INTO investment_goal_constraints (
                      id, profile_version_id, goal_type, display_name,
                      goal_detail, investment_constraints,
                      principal_amount, monthly_amount, is_active, confirmed_at
                    ) VALUES (%s,%s,%s,%s,%s::jsonb,%s::jsonb,%s,%s,TRUE,%s)
                    ON CONFLICT (id) DO UPDATE SET
                      profile_version_id = EXCLUDED.profile_version_id,
                      display_name = EXCLUDED.display_name,
                      goal_detail = EXCLUDED.goal_detail,
                      investment_constraints = EXCLUDED.investment_constraints,
                      principal_amount = EXCLUDED.principal_amount,
                      monthly_amount = EXCLUDED.monthly_amount,
                      is_active = TRUE,
                      confirmed_at = EXCLUDED.confirmed_at
                    """,
                    (
                        str(g["goal_id"]),
                        str(PROFILE_VERSION_ID),
                        g["goal_type"],
                        g["display_name"],
                        json.dumps(gp["goal_detail"], ensure_ascii=False),
                        json.dumps(gp["investment_constraints"], ensure_ascii=False),
                        gp["principal_amount"],
                        gp["monthly_amount"],
                        now,
                    ),
                )
                cur.execute(
                    """
                    INSERT INTO goal_constraint_revisions (
                      id, goal_constraint_id, revision_no, profile_version_id,
                      goal_detail, investment_constraints,
                      principal_amount, monthly_amount, confirmed_at
                    ) VALUES (%s,%s,1,%s,%s::jsonb,%s::jsonb,%s,%s,%s)
                    ON CONFLICT (goal_constraint_id, revision_no) DO UPDATE SET
                      profile_version_id = EXCLUDED.profile_version_id,
                      goal_detail = EXCLUDED.goal_detail,
                      investment_constraints = EXCLUDED.investment_constraints,
                      principal_amount = EXCLUDED.principal_amount,
                      monthly_amount = EXCLUDED.monthly_amount,
                      confirmed_at = EXCLUDED.confirmed_at
                    """,
                    (
                        str(g["revision_id"]),
                        str(g["goal_id"]),
                        str(PROFILE_VERSION_ID),
                        json.dumps(gp["goal_detail"], ensure_ascii=False),
                        json.dumps(gp["investment_constraints"], ensure_ascii=False),
                        gp["principal_amount"],
                        gp["monthly_amount"],
                        now,
                    ),
                )

            cur.execute(
                "DELETE FROM report_index WHERE report_type = 'profile' AND goal_constraint_id = ANY(%s::uuid[])",
                (goal_ids,),
            )
            cur.execute(
                "DELETE FROM allocation_plans WHERE goal_constraint_id = ANY(%s::uuid[])",
                (goal_ids,),
            )

            ymd = datetime.now().strftime("%Y%m%d")
            for g in GOALS:
                report_name = f"{g['display_name']}-投资需求-{ymd}"
                cur.execute(
                    """
                    INSERT INTO report_index (
                      report_type, report_name, file_path, generated_at,
                      profile_version_id, goal_constraint_id, goal_constraint_revision_id
                    ) VALUES ('profile', %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        report_name,
                        g["published_path"],
                        now,
                        str(PROFILE_VERSION_ID),
                        str(g["goal_id"]),
                        str(g["revision_id"]),
                    ),
                )

        conn.commit()

    print(f"[OK] profile_version={PROFILE_VERSION_ID}")
    for g in GOALS:
        print(f"  · {g['goal_type']} {g['goal_id']} → {g['published_path']}")
    print("[OK] five-scenario profile seed complete (N=5 eligible for plan)")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    load_env()
    apply_seed(args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
