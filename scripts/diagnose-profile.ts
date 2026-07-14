/**
 * Diagnostic: Query DB directly and check field names vs validator expectations.
 * Run from project root: npx tsx scripts/diagnose-profile.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

async function main() {
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
const supabase = createClient(
  env.SUPABASE_URL!,
  env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: "public" } }
);

// 1. Get latest profile
const { data: profile } = await supabase
  .from("profile_versions")
  .select("*")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (!profile) { console.log("❌ No profile found!"); process.exit(1); }

console.log(`Profile: ${profile.id}`);

// 2. Check basic_info keys against what validators expect
const bi = (profile.basic_info ?? {}) as Record<string, unknown>;
const BI_REQUIRED = [
  "name", "age", "marital_status", "occupation",
  "annual_income_after_tax", "monthly_income_after_tax",
  "financial_assets", "loan_balance_total",
  "monthly_loan_payment", "monthly_fixed_expense", "monthly_investable",
];

console.log("\n=== BASIC_INFO KEY ANALYSIS ===");
let biMissing = 0;
for (const k of BI_REQUIRED) {
  const inDB = k in bi;
  if (!inDB) {
    biMissing++;
    // Check if old name exists
    const oldNames: Record<string, string> = {
      annual_income_after_tax: "annual_income",
      monthly_income_after_tax: "monthly_income",
    };
    const oldKey = oldNames[k];
    const hasOld = oldKey ? oldKey in bi : false;
    console.log(`  ✗ REQUIRED KEY MISSING: "${k}"${hasOld ? ` (but old key "${oldKey}" present: ${JSON.stringify(bi[oldKey])})` : ""}`);
  }
}
if (biMissing === 0) console.log("  All required keys present ✓");
else console.log(`  TOTAL MISSING: ${biMissing}`);

// 3. Check ALL keys in basic_info (new vs old)
console.log("\n=== ALL keys in basic_info ===");
const OLD_TO_NEW_BI: Record<string, string> = {
  children: "has_children",
  annual_income: "annual_income_after_tax",
  monthly_income: "monthly_income_after_tax",
  risk_preference: "risk_tolerance",
  start_date: "start_invest_date",
};
for (const [k, v] of Object.entries(bi)) {
  const isOld = k in OLD_TO_NEW_BI;
  const newName = OLD_TO_NEW_BI[k] ?? "";
  const hasBoth = newName ? newName in bi : false;
  const marker = isOld ? (hasBoth ? " (has BOTH old+new)" : " ⚠ OLD NAME - needs mapping") : " (new name)";
  console.log(`  ${k} = ${JSON.stringify(v)}${marker}`);
}

// 4. Goals
const { data: goals } = await supabase
  .from("investment_goal_constraints")
  .select("*")
  .eq("profile_version_id", profile.id);

if (!goals || goals.length === 0) {
  console.log("\n❌ No goals found!");
  process.exit(1);
}

console.log(`\n=== ${goals.length} GOAL(S) ===`);
for (const g of goals) {
  console.log(`\n--- ${g.goal_type} "${g.display_name}" ---`);
  
  const ic = (g.investment_constraints ?? {}) as Record<string, unknown>;
  
  // Check constraint keys expected by validateGoalConstraint
  const IC_REQUIRED = ["risk_tolerance", "max_drawdown", "target_return", "principal_amount", "monthly_amount"];
  console.log("  investment_constraints keys:");
  let icMissing = 0;
  for (const k of IC_REQUIRED) {
    const inIC = k in ic;
    if (!inIC) {
      icMissing++;
      const oldNames: Record<string, string> = {
        risk_tolerance: "risk_preference",
        start_invest_date: "start_date",
      };
      const oldKey = oldNames[k];
      const hasOld = oldKey ? oldKey in ic : false;
      console.log(`    ✗ "${k}" MISSING${hasOld ? ` (old key "${oldKey}" present: ${JSON.stringify(ic[oldKey])})` : ""}`);
    }
  }
  if (icMissing === 0) console.log("    ✓ All required keys present");
  else console.log(`    TOTAL MISSING: ${icMissing}`);

  // Check ALL keys in investment_constraints
  console.log("  All IC keys:");
  for (const [k, v] of Object.entries(ic)) {
    const isOld = ["risk_preference", "start_date", "target_date", "target_annual_return"].includes(k);
    console.log(`    ${k} = ${JSON.stringify(v)}${isOld ? " ⚠ OLD NAME" : ""}`);
  }

  // Check principal_amount / monthly_amount at goal level
  console.log(`  goal.principal_amount: ${g.principal_amount}`);
  console.log(`  goal.monthly_amount: ${g.monthly_amount}`);
}

// 5. Summary
console.log("\n\n========================================");
console.log("=== ROOT CAUSE DIAGNOSIS ===");
console.log("========================================");
console.log("If validators expect 'annual_income_after_tax' but DB has 'annual_income' → report fails");
console.log("If validators expect 'risk_tolerance' in constraints but DB has 'risk_preference' → report fails");
console.log("If principal_amount is only at goal level, not in investment_constraints → validator can't find it");
console.log("========================================");

}

main().catch(console.error);
