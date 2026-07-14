"""Fill missing fields in profile basic_info.

Missing from screenshot: gender, children, investment_experience.
marital_status currently has "已婚，一个 8 岁的儿子" mixed together - split it.
"""
import psycopg, json, os, sys

db_url = os.environ.get("DATABASE_URL", "")
if not db_url:
    print("[FAIL] DATABASE_URL missing")
    sys.exit(1)

with psycopg.connect(db_url, connect_timeout=30) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT id, basic_info FROM profile_versions WHERE is_current = TRUE")
        row = cur.fetchone()
        if not row:
            print("[FAIL] No current profile found")
            sys.exit(1)

        pid, info = row
        print("Before:", json.dumps(info, ensure_ascii=False, indent=2))

        # Add missing fields (UI reads has_children, not children)
        info["gender"] = "男"
        info["has_children"] = "一孩"
        info["investment_experience"] = "3年"

        # Remove wrong key from previous run
        info.pop("children", None)

        # Clean up marital_status - remove children info
        ms = info.get("marital_status", "")
        if "儿子" in ms or "女儿" in ms or "孩" in ms:
            info["marital_status"] = "已婚"

        print("\nAfter:", json.dumps(info, ensure_ascii=False, indent=2))

        cur.execute(
            "UPDATE profile_versions SET basic_info = %s WHERE id = %s",
            (json.dumps(info, ensure_ascii=False), pid),
        )
        conn.commit()
        print("\n[DONE] basic_info updated.")
