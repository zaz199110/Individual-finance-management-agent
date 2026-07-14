/**
 * Full end-to-end simulation of processGoal() for each goal.
 * Replicates every step to identify the exact failure point.
 *
 * Usage: npx tsx scripts/diagnose-process-goal.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { validateBasicInfo } from "../src/lib/profile/basic-info";
import { normalizeConstraintKeys } from "../src/lib/profile/constraint-utils";
import { validateGoalConstraint } from "../src/lib/profile/goal-constraint";
import { buildProfileReportMarkdown } from "../src/lib/profile/report-blueprint";

// Load .env.local manually
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

// ─── Copied from report-merge.ts ──────────────────────────────────────────

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

// ─── Main diagnostic ──────────────────────────────────────────────────────

async function main() {
  console.log("=== Diagnosing processGoal for all confirmed goals ===\n");

  // 1. Fetch all confirmed goals
  const { data: goals, error: goalsErr } = await supabase
    .from("investment_goal_constraints")
    .select("*")
    .eq("is_active", true);

  if (goalsErr) {
    console.error("Failed to fetch goals:", goalsErr);
    return;
  }
  if (!goals || goals.length === 0) {
    console.log("No confirmed goals found.");
    return;
  }

  console.log(`Found ${goals.length} confirmed goal(s)\n`);

  for (let i = 0; i < goals.length; i++) {
    const goal = goals[i]!;
    console.log(`─── Goal ${i + 1}: ${goal.goal_type} "${goal.display_name}" ───`);

    // Step 1: Fetch basic_info from profile_versions
    console.log(`  [Step 1] Fetching profile_versions.basic_info for profile_version_id=${goal.profile_version_id}...`);
    const { data: profile, error: profileErr } = await supabase
      .from("profile_versions")
      .select("basic_info")
      .eq("id", goal.profile_version_id)
      .maybeSingle();

    if (profileErr) {
      console.log(`  >> FAIL: profile query error: ${profileErr.message}`);
      continue;
    }
    if (!profile) {
      console.log(`  >> FAIL: No profile_versions row found for id=${goal.profile_version_id}`);
      continue;
    }

    const rawBasic = (profile?.basic_info ?? {}) as Record<string, unknown>;
    console.log(`  >> profile_versions.basic_info has ${Object.keys(rawBasic).length} keys: ${Object.keys(rawBasic).join(", ")}`);

    // Step 2: Normalize basic info keys
    const normalizedBasic = normalizeBasicInfoKeys(rawBasic);
    console.log(`  [Step 2] After normalizeBasicInfoKeys: ${Object.keys(normalizedBasic).length} keys: ${Object.keys(normalizedBasic).join(", ")}`);

    // Step 3: Validate basic info using the REAL validateBasicInfo
    const basicValidation = validateBasicInfo(normalizedBasic);
    if (!basicValidation.ok) {
      console.log(`  >> FAIL (basic info): ${basicValidation.errors.join("; ")}`);
      continue;
    }
    console.log(`  >> Basic info validation PASSED ✓`);

    // Step 4: Get raw constraints
    const rawConstraints = { ...(goal.investment_constraints ?? {}) } as Record<string, unknown>;
    console.log(`  [Step 3] Raw investment_constraints: ${Object.keys(rawConstraints).length} keys`);
    console.log(`  >> Keys: ${Object.keys(rawConstraints).join(", ")}`);

    // Dump raw constraints values
    for (const [k, v] of Object.entries(rawConstraints)) {
      console.log(`     ${k} = ${JSON.stringify(v)} (type: ${typeof v})`);
    }

    // Fill principal/monthly from goal record (as processGoal does)
    if (goal.principal_amount != null && rawConstraints.principal_amount == null) {
      console.log(`  >> Filled principal_amount from goal: ${goal.principal_amount}`);
      rawConstraints.principal_amount = goal.principal_amount;
    }
    if (goal.monthly_amount != null && rawConstraints.monthly_amount == null) {
      console.log(`  >> Filled monthly_amount from goal: ${goal.monthly_amount}`);
      rawConstraints.monthly_amount = goal.monthly_amount;
    }

    // Step 5: Normalize constraint keys
    const normalizedConstraints = normalizeConstraintKeys(rawConstraints, {
      goalId: `diag_#${i + 1}_${goal.goal_type}`,
    });
    console.log(`  [Step 4] After normalizeConstraintKeys: ${Object.keys(normalizedConstraints).length} keys`);

    // Dump normalized constraints
    for (const [k, v] of Object.entries(normalizedConstraints)) {
      console.log(`     ${k} = ${JSON.stringify(v)} (type: ${typeof v})`);
    }

    // Step 6: Validate goal constraint using the REAL validateGoalConstraint
    const goalPayload = validateGoalConstraint({
      kind: "goal_constraint",
      goal_type: goal.goal_type,
      goal_detail: goal.goal_detail ?? {},
      investment_constraints: normalizedConstraints,
      principal_amount: goal.principal_amount,
      monthly_amount: goal.monthly_amount,
      goal_display_name: goal.display_name,
      profile_version_id: goal.profile_version_id,
    });

    if (!goalPayload.ok) {
      console.log(`  >> FAIL (constraint validation):`);
      for (const err of goalPayload.errors) {
        console.log(`     ✗ ${err}`);
      }
      continue;
    }
    console.log(`  >> Constraint validation PASSED ✓`);

    // Step 7: Try compose (buildProfileReportMarkdown)
    console.log(`  [Step 5] Calling buildProfileReportMarkdown...`);
    try {
      const composeInput = {
        sceneName: goal.display_name || goal.goal_type,
        goalType: goal.goal_type,
        dateLabel: "2026年7月11日",
        ymd: "20260711",
        basicInfo: basicValidation.data!,
        constraints: goalPayload.data.investment_constraints as any,
        principalAmount: goal.principal_amount ?? 0,
        monthlyAmount: goal.monthly_amount ?? 0,
      };
      const composed = buildProfileReportMarkdown(composeInput);
      console.log(`  >> Compose PASSED ✓ (markdown length: ${composed.markdown.length}, echarts: ${composed.echartsCount})`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  >> FAIL (compose crash): ${msg}`);
      if (err instanceof Error && err.stack) {
        console.log(`  >> Stack: ${err.stack}`);
      }
      continue;
    }

    console.log(`  >> ALL STEPS PASSED ✓\n`);
  }
}

main().catch(console.error);
