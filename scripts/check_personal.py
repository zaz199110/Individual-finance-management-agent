"""Show profile_versions schema + data for current profile."""
import psycopg, json, os, sys

db_url = os.environ.get("DATABASE_URL", "")
if not db_url:
    print("[FAIL] DATABASE_URL missing")
    sys.exit(1)

with psycopg.connect(db_url, connect_timeout=30) as conn:
    with conn.cursor() as cur:
        # Schema
        cur.execute("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'profile_versions'
            ORDER BY ordinal_position
        """)
        print("=== profile_versions schema ===")
        for r in cur.fetchall():
            print(f"  {r[0]}: {r[1]}")

        # Current profile
        cur.execute("SELECT * FROM profile_versions WHERE is_current = TRUE")
        desc = [d[0] for d in cur.description]
        row = cur.fetchone()
        if row:
            print("\n=== current profile data ===")
            for col, val in zip(desc, row):
                if col == "id":
                    continue
                if isinstance(val, dict):
                    print(f"\n--- {col} ---")
                    print(json.dumps(val, ensure_ascii=False, indent=2))
                else:
                    print(f"  {col}: {val}")
