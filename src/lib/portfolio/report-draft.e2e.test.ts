/**
 * report-draft.e2e.test.ts · 持仓分析报告端到端测试
 *
 * 测试完整流程：gather → blueprint → compose → echarts → 写入文件
 * 需要本地 supabase 运行
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { draftPortfolioReport } from "./report-draft";

// ─── 测试配置 ────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const TEST_OUTPUT_DIR = path.join(process.cwd(), ".test-output");

// ─── 测试工具 ────────────────────────────────────────────────────────────────

function ensureTestDir() {
  if (!fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  }
}

function cleanupTestDir() {
  if (fs.existsSync(TEST_OUTPUT_DIR)) {
    fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
  }
}

// ─── 测试套件 ────────────────────────────────────────────────────────────────

describe("report-draft e2e", () => {
  let supabase: SupabaseClient;

  beforeAll(() => {
    ensureTestDir();
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  });

  afterAll(() => {
    cleanupTestDir();
  });

  it("完整流程", async () => {
    // 1. 检查是否有持仓数据
    const { data: holdings, error: holdingsError } = await supabase
      .from("holdings_versions")
      .select("id, positions, confirmed_at")
      .eq("is_current", true)
      .maybeSingle();

    if (holdingsError || !holdings) {
      console.log("⚠️ 跳过测试：无持仓数据");
      return;
    }

    const positions = (holdings.positions ?? []) as Array<{
      fund_code: string;
      fund_name?: string;
      invested_at: string;
      paid_amount: number;
      shares: number;
    }>;

    if (positions.length === 0) {
      console.log("⚠️ 跳过测试：持仓为空");
      return;
    }

    console.log(`📊 找到 ${positions.length} 笔持仓`);

    // 2. 调用 draftPortfolioReport
    const result = await draftPortfolioReport(supabase, {
      conversationId: "test-e2e-" + Date.now(),
      runId: "test-run-" + Date.now(),
      holdingsVersionId: holdings.id,
    });

    // 3. 验证结果
    expect(result.ok).toBe(true);
    expect(result.draft_path).toBeDefined();
    expect(result.report_name).toBeDefined();
    expect(result.gather).toBeDefined();
    expect(result.blueprint).toBeDefined();
    expect(result.compose).toBeDefined();

    // 4. 验证 gather 数据
    expect(result.gather!.positions.length).toBe(positions.length);
    expect(result.gather!.total_cost).toBeGreaterThan(0);

    // 5. 验证 blueprint
    expect(result.blueprint!.markdown).toContain("#");
    expect(result.blueprint!.markdown).toContain("持仓分析报告");
    expect(result.blueprint!.markdown).toContain("持仓明细");
    expect(result.blueprint!.markdown).toContain("收益概况");
    expect(result.blueprint!.markdown).toContain("结构分布");
    expect(result.blueprint!.markdown).toContain("基金解读");
    expect(result.blueprint!.markdown).toContain("风险与合规");

    // 6. 验证 compose 已填充占位符
    expect(result.compose!.filledPlaceholders.length).toBeGreaterThan(0);
    expect(result.compose!.markdown).not.toContain("<!-- PORT-CH2-INTRO -->");
    expect(result.compose!.markdown).not.toContain("<!-- PORT-CH3-INTRO -->");
    expect(result.compose!.markdown).not.toContain("<!-- PORT-CH7-SUPP -->");

    // 7. 验证文件已写入
    expect(result.draft_path).toBeDefined();
    expect(fs.existsSync(result.draft_path!)).toBe(true);

    const fileContent = fs.readFileSync(result.draft_path!, "utf8");
    expect(fileContent).toContain("持仓分析报告");
    expect(fileContent).toContain("持仓明细");

    // 8. 验证 preview
    expect(result.preview).toBeDefined();
    expect(result.preview!.length).toBeGreaterThan(100);

    console.log("✅ 完整流程测试通过");
    console.log(`📄 报告名称：${result.report_name}`);
    console.log(`📁 文件路径：${result.draft_path}`);
    console.log(`📊 持仓数量：${result.gather!.positions.length}`);
    console.log(`💰 总成本：${result.gather!.total_cost}`);
    console.log(`💰 总市值：${result.gather!.total_market_value}`);
    console.log(`📈 总收益：${result.gather!.total_pnl_abs} (${result.gather!.total_pnl_pct}%)`);
  });

  it("完整流程：无持仓时返回错误", async () => {
    // 先检查是否有 is_current=true 的持仓
    const { data: existing } = await supabase
      .from("holdings_versions")
      .select("id")
      .eq("is_current", true)
      .maybeSingle();

    if (existing) {
      console.log("⚠️ 跳过测试：已有 is_current=true 的持仓");
      return;
    }

    // 使用不存在的 conversationId
    const result = await draftPortfolioReport(supabase, {
      conversationId: "non-existent-" + Date.now(),
      runId: "test-run-" + Date.now(),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    // 错误信息可能是"请先确认并保存当前持仓"或"未找到"
    expect(
      result.error!.includes("请先确认并保存当前持仓") ||
      result.error!.includes("未找到"),
    ).toBe(true);
  });

  it("完整流程：空持仓时返回错误", async () => {
    // 创建一个空持仓版本
    const { data: emptyHoldings, error: insertError } = await supabase
      .from("holdings_versions")
      .insert({
        positions: [],
        is_current: false,
        confirmed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !emptyHoldings) {
      console.log("⚠️ 跳过测试：无法创建空持仓版本");
      return;
    }

    const result = await draftPortfolioReport(supabase, {
      conversationId: "test-e2e-" + Date.now(),
      runId: "test-run-" + Date.now(),
      holdingsVersionId: emptyHoldings.id,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("空");

    // 清理
    await supabase.from("holdings_versions").delete().eq("id", emptyHoldings.id);
  });
});
