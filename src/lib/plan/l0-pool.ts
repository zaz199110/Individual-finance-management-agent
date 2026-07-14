import type { PlanDetailPayload } from "./types";
import { FUND_L0_REGISTRY } from "@/harness/infra/fund_knowledge/l0-registry";

/**
 * L0 基金池架构（缓存 + live API）：
 * - 静态注册表 = 本地缓存（nav_date 是今日 → 直接用，快）
 * - nav_date 不是今日 → 实时调 Tushare/AKShare 获取最新数据并回填缓存
 * - 注册表无该基金 → 直接调 live API
 * - 验证只校验代码格式，不校验是否在池中
 */
export const PLAN_L0_POOL_CODES = new Set(Object.keys(FUND_L0_REGISTRY));

/** 获取今日日期字符串 YYYY-MM-DD（北京时间） */
function todayBeijing(): string {
  const now = new Date();
  // 北京时间 = UTC+8
  const bj = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return bj.toISOString().slice(0, 10);
}

/**
 * 校验基金代码格式（不校验是否在 L0 池中）。
 * 池外基金由调用方决定是否通过 live API 获取。
 */
export function validatePlanL0Pool(payload: PlanDetailPayload): {
  ok: boolean;
  error?: string;
} {
  const cats =
    (payload.detailed_plan as { categories?: Array<{ items?: Array<{ fund_code?: string }> }> })
      .categories ?? [];
  for (const cat of cats) {
    for (const item of cat.items ?? []) {
      const code = String(item.fund_code ?? "");
      if (!/^\d{6}$/.test(code)) {
        return { ok: false, error: `基金代码格式无效：${code}` };
      }
    }
  }
  return { ok: true };
}

/**
 * 获取基金信息：检查缓存日期 → 今日则用缓存，否则实时获取。
 * 返回 null 表示该基金在所有来源均不可用。
 */
async function resolveFundInfo(fundCode: string): Promise<{
  fund_code: string;
  fund_name: string;
  summary: string;
  source: "cache" | "live";
} | null> {
  const cached = FUND_L0_REGISTRY[fundCode];
  const today = todayBeijing();

  // 缓存命中且数据是今日的 → 直接用（快路径）
  if (cached && cached.nav_date === today) {
    return {
      fund_code: fundCode,
      fund_name: cached.fund_name,
      summary: cached.summary,
      source: "cache",
    };
  }

  // 缓存过期或不存在 → 调 live API 获取最新数据
  try {
    const { fetchLiveFundL0 } = await import("@/lib/l0/fetch-fund-l0");
    const snapshot = await fetchLiveFundL0(fundCode);
    if (snapshot) {
      // 回填缓存（更新 nav_date 等字段）
      if (cached && snapshot.metrics?.nav != null) {
        cached.nav_date = snapshot.metrics.as_of_trade_date;
        cached.nav = snapshot.metrics.nav;
        cached.return_1y_pct = snapshot.metrics.return_1y_pct;
        cached.max_drawdown_1y_pct = snapshot.metrics.max_drawdown_1y_pct;
      }
      return {
        fund_code: fundCode,
        fund_name: snapshot.fund_name || cached?.fund_name || fundCode,
        summary: snapshot.fund_type
          ? `${snapshot.fund_type} · ${snapshot.risk_level ?? ""}`
          : cached?.summary ?? `基金 ${fundCode}`,
        source: "live",
      };
    }
  } catch {
    // API 不可用，走联网降级
  }

  // 降级：带着基金代码联网查询最新数据
  try {
    const { supplementL0FromWeb } = await import("@/lib/l0/web-fallback");
    const webResult = await supplementL0FromWeb(
      fundCode,
      cached?.fund_name ?? fundCode,
    );
    if (webResult) {
      return {
        fund_code: fundCode,
        fund_name: cached?.fund_name ?? fundCode,
        summary: `【联网降级】${webResult.web_summary.slice(0, 200)}`,
        source: "live",
      };
    }
  } catch {
    // 联网也失败
  }

  return null;
}

/**
 * 按场景名关键词从 L0 池挑选明细。
 * 今日缓存 → 直接用；过期或池外 → 实时调 API。
 */
export async function buildPlanDetailFromL0Pool(params: {
  goalConstraintId?: string;
  goalDisplayName?: string;
  profileVersionId?: string;
}): Promise<PlanDetailPayload> {
  const name = (params.goalDisplayName ?? "退休养老").toLowerCase();
  const isConservative = /养老|稳健|保守|债券/.test(name);
  const isAggressive = /教育|成长|进取|股票/.test(name);
  const isOverseas = /海外|全球|美元|QDII/.test(name);

  // 股票类：按风格选基
  const stockCodes = isAggressive
    ? ["110020", "001938", "110022"]
    : isOverseas
      ? ["110020", "019305"]
      : ["110020", "001938"];
  // 债券类：保守多配信用债，其余配利率债
  const bondCodes = isConservative
    ? ["003547", "050027", "217022"]
    : ["003547", "050027"];
  // 比例分配（仅股/债/货 · 禁止商品类 PL-PLAN-NO-COMMODITY-01）
  const alloc = isConservative
    ? { stock: 25, bond: 55, cash: 20 }
    : isAggressive
      ? { stock: 50, bond: 35, cash: 15 }
      : isOverseas
        ? { stock: 40, bond: 45, cash: 15 }
        : { stock: 35, bond: 50, cash: 15 };

  const cashCode = "000009";
  const allCodes = [...new Set([...stockCodes, ...bondCodes, cashCode])];
  const fundInfoMap = new Map<string, Awaited<ReturnType<typeof resolveFundInfo>>>();
  await Promise.all(
    allCodes.map(async (code) => {
      fundInfoMap.set(code, await resolveFundInfo(code));
    }),
  );

  const pick = (code: string) => {
    const info = fundInfoMap.get(code);
    if (info) {
      return { fund_name: info.fund_name, summary: info.summary, source: info.source };
    }
    return { fund_name: code, summary: `基金 ${code}`, source: "cache" as const };
  };

  return {
    kind: "plan_detail",
    goal_constraint_id: params.goalConstraintId ?? "",
    goal_display_name: params.goalDisplayName ?? "退休养老",
    target_allocation_summary: {
      股票类: alloc.stock,
      债券类: alloc.bond,
      货币类: alloc.cash,
    },
    detailed_plan: {
      categories: [
        {
          category: "股票类",
          allocation_pct: alloc.stock,
          items: stockCodes.map((code) => {
            const f = pick(code);
            return {
              fund_code: code,
              fund_name: f.fund_name,
              weight_in_category: Math.round(100 / stockCodes.length),
              allocation_pct_of_portfolio: Math.round(alloc.stock / stockCodes.length),
              recommendation_reason: `${f.source === "live" ? "L0 实时" : "L0 今日缓存"} · ${f.summary}`,
            };
          }),
        },
        {
          category: "债券类",
          allocation_pct: alloc.bond,
          items: bondCodes.map((code) => {
            const f = pick(code);
            return {
              fund_code: code,
              fund_name: f.fund_name,
              weight_in_category: Math.round(100 / bondCodes.length),
              allocation_pct_of_portfolio: Math.round(alloc.bond / bondCodes.length),
              recommendation_reason: `${f.source === "live" ? "L0 实时" : "L0 今日缓存"} · ${f.summary}`,
            };
          }),
        },
        {
          category: "货币类",
          allocation_pct: alloc.cash,
          items: [
            {
              fund_code: cashCode,
              fund_name: pick(cashCode).fund_name,
              weight_in_category: 100,
              allocation_pct_of_portfolio: alloc.cash,
              recommendation_reason: "流动性缓冲，T+0 赎回。",
            },
          ],
        },
      ],
    },
  };
}
