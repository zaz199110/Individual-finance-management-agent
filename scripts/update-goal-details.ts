/**
 * 补充 investment_goal_constraints 表中缺失的字段
 *
 * 数据来源：profile report (profile-report-1783427008264.md) + gen-with-conv.json
 * 当前 DB 中 goal_detail 仅含 risk_preference / max_drawdown / target_annual_return，
 * 缺少 start_date / target_date / monthly_retirement_payout / investment_horizon_years。
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

// 读取环境变量（与 restore-data-from-files.ts 相同方式）
const envPath = join(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf8");
const envVars: Record<string, string> = {};
envContent.split("\n").forEach((line) => {
  if (line.startsWith("#") || !line.trim()) return;
  const [k, ...v] = line.split("=");
  if (k && v.length) envVars[k.trim()] = v.join("=").trim();
});

const url = envVars.SUPABASE_URL || "http://127.0.0.1:54321";
const key = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_ANON_KEY;

if (!key) {
  console.error("缺少 SUPABASE_SERVICE_ROLE_KEY 或 SUPABASE_ANON_KEY，请检查 .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

type GoalKey = "retirement" | "education" | "housing" | "marriage_child" | "wealth_growth";

interface GoalUpdate {
  goal_detail: Record<string, unknown>;
  investment_constraints: Record<string, unknown>;
}

// 从 profile-report-1783427008264.md / gen-with-conv.json 提取的完整数据
const goalsPatch: Record<GoalKey, GoalUpdate> = {
  retirement: {
    goal_detail: {
      risk_preference: "稳健型",
      max_drawdown: 15,
      target_annual_return: 6,
      start_date: "2025-01-01",
      target_date: "2055-01-01",
      monthly_retirement_payout: 15000,
    },
    investment_constraints: {
      risk_preference: "稳健型",
      max_drawdown: 15,
      target_annual_return: 6,
      start_date: "2025-01-01",
      target_date: "2055-01-01",
      monthly_retirement_payout: 15000,
    },
  },
  education: {
    goal_detail: {
      risk_preference: "平衡型",
      max_drawdown: 10,
      target_annual_return: 7,
      start_date: "2025-01-01",
      target_date: "2038-09-01",
    },
    investment_constraints: {
      risk_preference: "平衡型",
      max_drawdown: 10,
      target_annual_return: 7,
      start_date: "2025-01-01",
      target_date: "2038-09-01",
    },
  },
  housing: {
    goal_detail: {
      risk_preference: "保守型",
      max_drawdown: 5,
      target_annual_return: 5,
      start_date: "2025-01-01",
      target_date: "2028-06-01",
    },
    investment_constraints: {
      risk_preference: "保守型",
      max_drawdown: 5,
      target_annual_return: 5,
      start_date: "2025-01-01",
      target_date: "2028-06-01",
    },
  },
  marriage_child: {
    goal_detail: {
      risk_preference: "平衡型",
      max_drawdown: 10,
      target_annual_return: 6,
      target_amount: 600000,
      start_date: "2025-01-01",
      target_date: "2027-12-01",
    },
    investment_constraints: {
      risk_preference: "平衡型",
      max_drawdown: 10,
      target_annual_return: 6,
      target_amount: 600000,
      start_date: "2025-01-01",
      target_date: "2027-12-01",
    },
  },
  wealth_growth: {
    goal_detail: {
      risk_preference: "进取型",
      max_drawdown: 20,
      target_annual_return: 10,
      investment_horizon_years: 5,
    },
    investment_constraints: {
      risk_preference: "进取型",
      max_drawdown: 20,
      target_annual_return: 10,
      investment_horizon_years: 5,
    },
  },
};

async function main() {
  console.log("查询现有投资目标…");

  const { data: goals, error } = await supabase
    .from("investment_goal_constraints")
    .select("id, goal_type, display_name, goal_detail, investment_constraints");

  if (error) {
    console.error("查询失败:", error);
    process.exit(1);
  }

  if (!goals || goals.length === 0) {
    console.log("没有找到投资目标，跳过更新。");
    return;
  }

  console.log(`找到 ${goals.length} 个目标:\n`);

  let updated = 0;

  for (const goal of goals) {
    const patch = goalsPatch[goal.goal_type as GoalKey];
    if (!patch) {
      console.log(`  ⚠ ${goal.display_name} (${goal.goal_type}) — 无 patch 数据，跳过`);
      continue;
    }

    console.log(`  → ${goal.display_name} (${goal.goal_type})`);
    console.log(`    之前 goal_detail: ${JSON.stringify(goal.goal_detail)}`);
    console.log(`    之后 goal_detail: ${JSON.stringify(patch.goal_detail)}`);

    const { error: updateErr } = await supabase
      .from("investment_goal_constraints")
      .update({
        goal_detail: patch.goal_detail,
        investment_constraints: patch.investment_constraints,
      })
      .eq("id", goal.id);

    if (updateErr) {
      console.error(`    ✗ 更新失败: ${updateErr.message}`);
    } else {
      console.log(`    ✓ 已更新`);
      updated++;
    }
  }

  console.log(`\n完成：更新了 ${updated}/${goals.length} 个目标`);
}

main().catch((err) => {
  console.error("脚本执行失败:", err);
  process.exit(1);
});
