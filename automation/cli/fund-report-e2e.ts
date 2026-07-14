/**
 * 基金解读 · 草稿 + FK-18 端到端回归
 *
 * Usage:
 *   npx tsx automation/cli/fund-report-e2e.ts              # DEMO-ABCDEF-01 六只（默认）
 *   npx tsx automation/cli/fund-report-e2e.ts --set=asset   # 股债货各一
 *   npx tsx automation/cli/fund-report-e2e.ts --set=all     # 九只全量
 */
import fs from "node:fs";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import { loadTestEnv } from "../tests/helpers/load-env";
import { getSupabase } from "@/lib/supabase/server";
import { draftFundReport } from "@/lib/fund/report-draft";
import { verifyFundReportDraft } from "@/lib/fund/report-verify";
import { fundLookupAsync } from "@/lib/fund/lookup";
import { getFundL0Profile } from "@/harness/infra/fund_knowledge/l0-registry";
import {
  DEMO_ARCHETYPE_FUNDS,
  DEMO_ASSET_CLASS_FUNDS,
} from "@/lib/fund/demo-watchlist";

loadTestEnv(true);

type E2eSet = "demo" | "asset" | "all";

interface FundCase {
  code: string;
  label: string;
}

function parseSet(): E2eSet {
  const arg = process.argv.find((a) => a.startsWith("--set="))?.split("=")[1];
  if (arg === "asset" || arg === "all") return arg;
  return "demo";
}

function buildCases(set: E2eSet): FundCase[] {
  const archetype = DEMO_ARCHETYPE_FUNDS.map((f) => ({
    code: f.fund_code,
    label: `${f.archetype} ${f.fund_code}`,
  }));
  const asset = DEMO_ASSET_CLASS_FUNDS.map((f) => ({
    code: f.fund_code,
    label: `${f.asset_class} ${f.fund_code}`,
  }));
  if (set === "asset") return asset;
  if (set === "all") return [...archetype, ...asset];
  return archetype;
}

async function main() {
  const set = parseSet();
  const cases = buildCases(set);

  const { getRawModelSettings } = await import("@/lib/supabase/server");
  const modelRows = await getRawModelSettings();
  const webReady =
    modelRows.find((r) => r.slot === "web")?.check_status === "passed";
  const skipL3 =
    process.env.HARNESS_SKIP_L3 === "1" || !webReady;

  const supabase = await getSupabase();
  if (!supabase) {
    console.error("NO SUPABASE — 请配置 .env.local");
    process.exit(1);
  }

  console.log(`set=${set} funds=${cases.length} skip_l3=${skipL3} webReady=${webReady}\n`);

  const results: Array<Record<string, unknown>> = [];

  for (const c of cases) {
    const profile = getFundL0Profile(c.code);
    const convId = uuidv4();
    const runId = uuidv4().replace(/-/g, "").slice(0, 16);
    console.log(`[draft] ${c.label} ...`);

    await supabase.from("conversations").insert({
      id: convId,
      title: `fund-e2e-${c.code}-${Date.now()}`,
      conversation_type: "fund",
      metadata: { type_locked: true, active_tab: "fund", has_unconfirmed: false },
    });

    try {
      const lookup = await fundLookupAsync({ fund_code: c.code });
      const draft = await draftFundReport(supabase, {
        fundCode: c.code,
        conversationId: convId,
        runId,
        skip_l3: skipL3,
      });
      const verify = draft.draft_path
        ? verifyFundReportDraft({
            draftPath: draft.draft_path,
            fundCode: c.code,
            hasVault: Boolean(lookup.has_vault),
          })
        : {
            ok: false,
            errors: [draft.error ?? "no draft"],
            warnings: [] as string[],
            echarts_count: 0,
            has_draft_meta: false,
          };

      const synopsisWarnings = verify.warnings.filter((w) => w.includes("三句话"));

      results.push({
        label: c.label,
        code: c.code,
        archetype: profile?.archetype,
        draftOk: draft.ok,
        verifyOk: verify.ok,
        charts: verify.echarts_count,
        chars: draft.draft_path ? fs.readFileSync(draft.draft_path, "utf8").length : 0,
        errors: verify.errors,
        warnings: verify.warnings,
      });

      const icon = verify.ok && synopsisWarnings.length === 0 ? "OK" : verify.ok ? "WARN" : "FAIL";
      console.log(
        `[${icon}] ${c.label} verify=${verify.ok} charts=${verify.echarts_count} synopsis_warn=${synopsisWarnings.length}`,
      );
      if (!verify.ok) {
        console.log("  errors:", verify.errors.slice(0, 3).join(" | "));
      } else if (synopsisWarnings.length) {
        console.log("  warnings:", synopsisWarnings.join(" | "));
      }
    } finally {
      await supabase.from("conversations").delete().eq("id", convId);
      const runDir = path.join(process.cwd(), "data", "runs", convId);
      if (fs.existsSync(runDir)) fs.rmSync(runDir, { recursive: true, force: true });
    }
  }

  console.log("\n=== Summary ===");
  console.log(JSON.stringify(results, null, 2));

  const failed = results.filter((r) => !r.verifyOk);
  const synopsisFailed = results.filter((r) =>
    (r.warnings as string[] | undefined)?.some((w) => w.includes("三句话")),
  );
  if (failed.length || synopsisFailed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
