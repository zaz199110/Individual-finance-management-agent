/**
 * Diagnostic: Query DB basic_info and simulate normalizeBasicInfoKeys + validateBasicInfo.
 * Run from project root: npx tsx scripts/diagnose-basic-info.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { validateBasicInfo } from "../src/lib/profile/basic-info";
import type { BasicInfo } from "../src/lib/profile/types";

// ────────────────────────────────────────────────────────────────────────────
// Inlined normalizeBasicInfoKeys (identical to report-draft.ts & report-merge.ts)
// ────────────────────────────────────────────────────────────────────────────
function normalizeBasicInfoKeys(info: Record<string, unknown>): Record<string, unknown> {
  const basicMap: Record<string, string> = {
    children: "has_children",
    annual_income: "annual_income_after_tax",
    monthly_income: "monthly_income_after_tax",
    risk_preference: "risk_tolerance",
    start_date: "start_invest_date",
    total_debt: "loan_balance_total",
    monthly_debt_payment: "monthly_loan_payment",
    monthly_expense: "monthly_fixed_expense",
  };
  const out: Record<string, unknown> = { ...info };
  for (const [oldKey, newKey] of Object.entries(basicMap)) {
    if (out[oldKey] !== undefined && out[newKey] === undefined) {
      out[newKey] = out[oldKey];
      delete out[oldKey];
    }
  }
  return out;
}

const REQUIRED_KEYS = [
  "name",
  "age",
  "marital_status",
  "occupation",
  "annual_income_after_tax",
  "monthly_income_after_tax",
  "financial_assets",
  "loan_balance_total",
  "monthly_loan_payment",
  "monthly_fixed_expense",
  "monthly_investable",
] as const;

async function main() {
  // ── Load .env.local ──
  const envPath = ".env.local";
  const envLines = readFileSync(envPath, "utf-8").split("\n");
  const env: Record<string, string> = {};
  for (const line of envLines) {
    const [k, ...rest] = line.trim().split("=");
    if (k && !k.startsWith("#") && rest.length > 0) {
      env[k] = rest.join("=");
    }
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    db: { schema: "public" },
  });

  // ── 1. Query most recent profile_versions record ──
  const { data: profile, error: profileErr } = await supabase
    .from("profile_versions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (profileErr) {
    console.log(`❌ DB error: ${profileErr.message}`);
    process.exit(1);
  }

  if (!profile) {
    console.log("❌ No profile_versions record found!");
    process.exit(1);
  }

  console.log("=".repeat(70));
  console.log(`Profile ID: ${profile.id}`);
  console.log(`Created: ${profile.created_at}`);
  console.log(`Status: ${profile.status}`);
  console.log("=".repeat(70));

  // ── 2. Extract basic_info ──
  const rawBasicInfo = (profile.basic_info ?? {}) as Record<string, unknown>;

  console.log("\n=== RAW basic_info JSON ===");
  console.log(JSON.stringify(rawBasicInfo, null, 2));

  // ── 3. Key presence check ──
  console.log("\n=== KEY PRESENCE CHECK (DB raw keys vs REQUIRED_KEYS) ===");
  let missingCount = 0;
  const dbKeys = Object.keys(rawBasicInfo);

  const OLD_TO_NEW: Record<string, string> = {
    children: "has_children",
    annual_income: "annual_income_after_tax",
    monthly_income: "monthly_income_after_tax",
    risk_preference: "risk_tolerance",
    start_date: "start_invest_date",
    total_debt: "loan_balance_total",
    monthly_debt_payment: "monthly_loan_payment",
    monthly_expense: "monthly_fixed_expense",
  };

  for (const key of REQUIRED_KEYS) {
    const presentNew = key in rawBasicInfo;
    const oldForNew = Object.entries(OLD_TO_NEW).find(([, n]) => n === key)?.[0];
    const presentOld = oldForNew ? oldForNew in rawBasicInfo : false;
    const valueNew = presentNew ? rawBasicInfo[key] : undefined;
    const valueOld = presentOld ? rawBasicInfo[oldForNew!] : undefined;

    if (presentNew && !presentOld) {
      console.log(`  ✓ "${key}" = ${JSON.stringify(valueNew)} (NEW canonical name)`);
    } else if (presentOld && !presentNew) {
      missingCount++;
      console.log(`  ✗ "${key}" MISSING — but OLD key "${oldForNew}" present = ${JSON.stringify(valueOld)} (will be normalized)`);
    } else if (presentNew && presentOld) {
      console.log(`  ⚠ "${key}" = ${JSON.stringify(valueNew)} (has BOTH; old "${oldForNew}" = ${JSON.stringify(valueOld)})`);
    } else {
      missingCount++;
      console.log(`  ✗ "${key}" MISSING (no old key either)`);
    }
  }
  console.log(`  → Required keys missing in DB: ${missingCount}`);

  // ── 4. All keys inventory ──
  console.log("\n=== ALL KEYS IN basic_info (DB) ===");
  for (const [k, v] of Object.entries(rawBasicInfo)) {
    const isOld = k in OLD_TO_NEW;
    const newName = OLD_TO_NEW[k];
    const hasBoth = newName ? newName in rawBasicInfo : false;
    let tag = "";
    if (isOld && hasBoth) tag = " 🔄 OLD (has both old+new in DB)";
    else if (isOld) tag = " ⚠️ OLD NAME (needs normalizeBasicInfoKeys)";
    else tag = " ✓ NEW canonical name";
    console.log(`  ${k} = ${JSON.stringify(v)}${tag}`);
  }

  // ── 5. Simulate normalizeBasicInfoKeys ──
  console.log("\n=== NORMALIZED basic_info (after normalizeBasicInfoKeys) ===");
  const normalized = normalizeBasicInfoKeys(rawBasicInfo);
  console.log(JSON.stringify(normalized, null, 2));

  // ── 6. Simulate validateBasicInfo ──
  console.log("\n=== VALIDATION RESULT (validateBasicInfo on NORMALIZED data) ===");
  const validation = validateBasicInfo(normalized);
  console.log(`  ok: ${validation.ok}`);
  if (validation.errors.length > 0) {
    console.log("  ERRORS:");
    for (const e of validation.errors) {
      console.log(`    ✗ ${e}`);
    }
  }
  if (validation.warnings.length > 0) {
    console.log("  WARNINGS:");
    for (const w of validation.warnings) {
      console.log(`    ⚠ ${w}`);
    }
  }
  if (validation.ok && validation.warnings.length === 0) {
    console.log("  ✅ Validation PASSED with no errors or warnings.");
  } else if (validation.ok) {
    console.log("  ✅ Validation PASSED (with warnings above).");
  } else {
    console.log("  ❌ Validation FAILED.");
  }

  // Also test validation on raw (un-normalized) data
  console.log("\n=== VALIDATION RESULT (validateBasicInfo on RAW / un-normalized data) ===");
  const rawValidation = validateBasicInfo(rawBasicInfo);
  console.log(`  ok: ${rawValidation.ok}`);
  if (rawValidation.errors.length > 0) {
    console.log("  ERRORS:");
    for (const e of rawValidation.errors) {
      console.log(`    ✗ ${e}`);
    }
  }

  // ── 7. Query investment_goal_constraints ──
  console.log("\n=== investment_goal_constraints (confirmed_at IS NOT NULL AND is_active = TRUE) ===");
  const { data: goals, error: goalsErr } = await supabase
    .from("investment_goal_constraints")
    .select("*")
    .eq("profile_version_id", profile.id)
    .not("confirmed_at", "is", null)
    .eq("is_active", true);

  if (goalsErr) {
    console.log(`  ❌ Query error: ${goalsErr.message}`);
  } else if (!goals || goals.length === 0) {
    console.log("  ⚠ No active confirmed goal constraints found for this profile.");
  } else {
    console.log(`  Found ${goals.length} active confirmed goal(s):\n`);
    for (const g of goals) {
      console.log(`  ── Goal: ${g.goal_type} "${g.display_name}" ──`);
      console.log(`    id: ${g.id}`);
      console.log(`    goal_constraint_id: ${g.goal_constraint_id}`);
      console.log(`    confirmed_at: ${g.confirmed_at}`);
      console.log(`    is_active: ${g.is_active}`);
      console.log(`    goal_detail: ${JSON.stringify(g.goal_detail)}`);
      console.log(`    investment_constraints: ${JSON.stringify(g.investment_constraints)}`);
      console.log(`    principal_amount: ${g.principal_amount}`);
      console.log(`    monthly_amount: ${g.monthly_amount}`);
      console.log();
    }
  }

  // ── 8. Summary ──
  console.log("=".repeat(70));
  console.log("=== DIAGNOSIS SUMMARY ===");
  console.log("=".repeat(70));
  if (missingCount > 0) {
    console.log(`⚠ ${missingCount} required key(s) missing in DB. normalizeBasicInfoKeys can fix old→new mappings.`);
  } else {
    console.log("✓ All required keys present in DB (new canonical names).");
  }
  console.log(`Validation on normalized data: ${validation.ok ? "PASS" : "FAIL"}`);
  console.log(`Validation on raw DB data:    ${rawValidation.ok ? "PASS" : "FAIL"}`);
  console.log("=".repeat(70));
}

main().catch(console.error);
