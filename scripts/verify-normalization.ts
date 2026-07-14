/**
 * Verify: Run the same normalization + validation pipeline as draftProfileReport.
 * Proves whether the fix makes validators pass on raw DB data.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

async function main() {
  const envLines = readFileSync(".env.local", "utf-8").split("\n");
  const env: Record<string, string> = {};
  for (const line of envLines) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (k && !k.startsWith("#")) env[k] = v;
  }

  const supabase = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { db: { schema: "public" } });

  // --- SAME normalizeBasicInfoKeys as report-draft.ts (after fix) ---
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

  // --- Get profile ---
  const { data: profile } = await supabase.from("profile_versions").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!profile) { console.log("No profile"); return; }

  // --- Get goals ---
  const { data: goals } = await supabase.from("investment_goal_constraints").select("*").eq("profile_version_id", profile.id);
  if (!goals?.length) { console.log("No goals"); return; }

  // --- Import actual validators from project ---
  const { validateBasicInfo } = await import("../src/lib/profile/basic-info");
  const { validateGoalConstraint } = await import("../src/lib/profile/goal-constraint");
  const { normalizeConstraintKeys } = await import("../src/lib/profile/constraint-utils");

  // --- Test 1: Basic info validation ---
  console.log("=== TEST 1: Basic Info ===");
  const rawBI = (profile.basic_info ?? {}) as Record<string, unknown>;
  const normalizedBI = normalizeBasicInfoKeys(rawBI);
  
  console.log("\nRaw keys:", Object.keys(rawBI).join(", "));
  console.log("Normalized keys:", Object.keys(normalizedBI).join(", "));
  
  const biResult = validateBasicInfo(normalizedBI);
  console.log(`\nvalidateBasicInfo(normalized): ${biResult.ok ? "✅ PASS" : "❌ FAIL"}`);
  if (!biResult.ok) console.log("  errors:", biResult.errors);

  // --- Test 2: Each goal constraint ---
  console.log("\n=== TEST 2: Goal Constraints ===");
  let passCount = 0;
  for (const g of goals) {
    const rawIC = (g.investment_constraints ?? {}) as Record<string, unknown>;
    // merge principal/monthly (same as report-draft.ts does)
    if (g.principal_amount != null && rawIC.principal_amount == null) rawIC.principal_amount = g.principal_amount;
    if (g.monthly_amount != null && rawIC.monthly_amount == null) rawIC.monthly_amount = g.monthly_amount;
    const normalizedIC = normalizeConstraintKeys(rawIC);
    
    const gcResult = validateGoalConstraint({
      kind: "goal_constraint",
      goal_type: g.goal_type,
      goal_detail: g.goal_detail,
      investment_constraints: normalizedIC,
      principal_amount: g.principal_amount,
      monthly_amount: g.monthly_amount,
      goal_display_name: g.display_name,
      profile_version_id: g.profile_version_id,
    });
    
    console.log(`\n  ${g.goal_type} "${g.display_name}": ${gcResult.ok ? "✅ PASS" : "❌ FAIL"}`);
    if (!gcResult.ok) {
      console.log("    errors:", gcResult.errors);
    } else {
      passCount++;
    }
  }

  console.log(`\n=== RESULTS: ${passCount}/${goals.length} goals pass validation ===`);
}

main().catch(console.error);
