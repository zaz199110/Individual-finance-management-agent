import type {
  HoldingsKind,
  L0AssetAllocation,
  L0HolderStructure,
} from "@/lib/l0/registry-portfolio";
import { inferHoldingsKind } from "@/lib/l0/registry-portfolio";
import type { L0TopHolding } from "@/lib/l0/types";

export type FundArchetype = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export type { HoldingsKind, L0AssetAllocation, L0HolderStructure };

export interface FundL0Profile {
  fund_code: string;
  fund_name: string;
  fund_type: string;
  risk_level: string;
  summary: string;
  archetype: FundArchetype;
  is_qdii?: boolean;
  has_vault: boolean;
  /** Demo L0 metrics when Tushare/AKShare unavailable */
  nav_date?: string;
  nav?: number;
  return_1y_pct?: number;
  max_drawdown_1y_pct?: number;
  /** Demo portfolio when live L0 has no holdings */
  asset_allocation?: L0AssetAllocation;
  top_holdings?: L0TopHolding[];
  holdings_kind?: HoldingsKind;
  top_holdings_concentration?: number;
  holdings_as_of?: string;
  holder_structure?: L0HolderStructure;
}

/**
 * L0 基金池 — 覆盖六大资产类别（股票/债券/货币/QDII/混合/商品），
 * 用于资产配置推荐初筛。生产环境应接入 Tushare/AKShare 全市场筛选，
 * 本池为精选基准集，确保无 API 时仍可完成方案生成。
 */
export const FUND_L0_REGISTRY: Record<string, FundL0Profile> = {
  // —— 股票类（宽基 + 行业 + 主动） ——
  "110020": {
    fund_code: "110020",
    fund_name: "易方达沪深300ETF联接A",
    fund_type: "指数型 · 股票 · 宽基",
    risk_level: "R3 · 中风险",
    summary: "跟踪沪深300的宽基指数联接基金，费率低、流动性好。",
    archetype: "C",
    has_vault: true,
    nav_date: "2026-06-13",
    nav: 1.452,
    return_1y_pct: 8.5,
    max_drawdown_1y_pct: -14.2,
  },
  "001938": {
    fund_code: "001938",
    fund_name: "中欧时代先锋股票A",
    fund_type: "股票型 · 主动",
    risk_level: "R4 · 中高风险",
    summary: "全市场主动股票基金，基金经理经验丰富。",
    archetype: "D",
    has_vault: false,
    nav_date: "2026-06-13",
    nav: 3.215,
    return_1y_pct: 12.3,
    max_drawdown_1y_pct: -22.1,
  },
  "110022": {
    fund_code: "110022",
    fund_name: "易方达消费行业股票",
    fund_type: "股票型 · 行业 · 消费",
    risk_level: "R4 · 中高风险",
    summary: "消费行业主题股票基金，长期业绩优秀。",
    archetype: "D",
    has_vault: true,
    nav_date: "2026-06-13",
    nav: 4.872,
    return_1y_pct: 6.2,
    max_drawdown_1y_pct: -19.8,
  },
  "519736": {
    fund_code: "519736",
    fund_name: "天弘中证科技100指数A",
    fund_type: "指数型 · 股票 · 科技",
    risk_level: "R4 · 中高风险",
    summary: "跟踪中证科技100指数，覆盖科技龙头。",
    archetype: "C",
    has_vault: false,
    nav_date: "2026-06-13",
    nav: 1.893,
    return_1y_pct: 15.7,
    max_drawdown_1y_pct: -25.3,
  },
  // —— 混合类 ——
  "000001": {
    fund_code: "000001",
    fund_name: "华夏成长混合",
    fund_type: "混合型 · 偏股",
    risk_level: "R3 · 中风险",
    summary: "全市场混合型基金，股债灵活配置。",
    archetype: "D",
    has_vault: false,
    nav_date: "2026-06-13",
    nav: 1.023,
    return_1y_pct: 4.1,
    max_drawdown_1y_pct: -11.0,
  },
  "206007": {
    fund_code: "206007",
    fund_name: "鹏华消费优选混合",
    fund_type: "混合型 · 偏股 · 消费",
    risk_level: "R4 · 中高风险",
    summary: "消费主题主动混合，兼具成长与防御。",
    archetype: "D",
    has_vault: true,
    nav_date: "2026-06-13",
    nav: 2.156,
    return_1y_pct: 5.8,
    max_drawdown_1y_pct: -18.5,
  },
  "005827": {
    fund_code: "005827",
    fund_name: "易方达蓝筹精选混合",
    fund_type: "混合型 · 偏股 · 蓝筹",
    risk_level: "R4 · 中高风险",
    summary: "蓝筹主题主动混合，聚焦优质大盘股。",
    archetype: "G",
    has_vault: true,
    nav_date: "2026-06-13",
    nav: 1.892,
    return_1y_pct: 6.2,
    max_drawdown_1y_pct: -15.3,
  },
  "519772": {
    fund_code: "519772",
    fund_name: "交银定期支付双息平衡混合",
    fund_type: "混合型 · 平衡",
    risk_level: "R3 · 中风险",
    summary: "平衡型混合基金，定期支付现金流。",
    archetype: "E",
    has_vault: true,
    nav_date: "2026-06-13",
    nav: 1.678,
    return_1y_pct: 3.5,
    max_drawdown_1y_pct: -8.2,
  },
  // —— 债券类（纯债 + 信用 + 利率） ——
  "003547": {
    fund_code: "003547",
    fund_name: "鹏华丰享债券A",
    fund_type: "债券型 · 纯债 · 信用",
    risk_level: "R2 · 中低风险",
    summary: "以信用债为主的纯债基金，波动低于权益类。",
    archetype: "B",
    has_vault: false,
    nav_date: "2026-06-13",
    nav: 1.089,
    return_1y_pct: 3.2,
    max_drawdown_1y_pct: -1.5,
  },
  "050027": {
    fund_code: "050027",
    fund_name: "博时信用债券A",
    fund_type: "债券型 · 纯债 · 信用",
    risk_level: "R2 · 中低风险",
    summary: "信用债为主的中长期纯债基金，久期适中。",
    archetype: "B",
    has_vault: false,
    nav_date: "2026-06-13",
    nav: 1.342,
    return_1y_pct: 3.8,
    max_drawdown_1y_pct: -2.1,
  },
  "217022": {
    fund_code: "217022",
    fund_name: "招商产业债券A",
    fund_type: "债券型 · 纯债 · 产业债",
    risk_level: "R2 · 中低风险",
    summary: "产业债策略纯债基金，信用资质较优。",
    archetype: "B",
    has_vault: true,
    nav_date: "2026-06-13",
    nav: 1.156,
    return_1y_pct: 3.5,
    max_drawdown_1y_pct: -1.2,
  },
  "000404": {
    fund_code: "000404",
    fund_name: "易方达新兴成长混合",
    fund_type: "债券型 · 纯债 · 利率",
    risk_level: "R2 · 中低风险",
    summary: "短久期利率债基金，流动性管理工具。",
    archetype: "F",
    has_vault: false,
    nav_date: "2026-06-13",
    nav: 1.034,
    return_1y_pct: 2.4,
    max_drawdown_1y_pct: -0.5,
  },
  // —— 货币类 ——
  "000009": {
    fund_code: "000009",
    fund_name: "易方达天天理财货币A",
    fund_type: "货币型",
    risk_level: "R1 · 低风险",
    summary: "货币市场基金，流动性管理工具，T+0 赎回。",
    archetype: "B",
    has_vault: false,
    nav_date: "2026-06-13",
    nav: 1.0,
    return_1y_pct: 1.8,
    max_drawdown_1y_pct: 0,
  },
  "000198": {
    fund_code: "000198",
    fund_name: "天弘余额宝货币",
    fund_type: "货币型",
    risk_level: "R1 · 低风险",
    summary: "国内规模最大的货币市场基金之一，流动性管理工具。",
    archetype: "B",
    has_vault: true,
    nav_date: "2026-06-13",
    nav: 1.0,
    return_1y_pct: 1.9,
    max_drawdown_1y_pct: 0,
  },
  "017704": {
    fund_code: "017704",
    fund_name: "兴业中证同业存单AAA指数7天持有期",
    fund_type: "指数型 · 固收 · 同业存单",
    risk_level: "R2 · 中低风险",
    summary: "跟踪同业存单 AAA 指数的短久期固收工具，7 天持有期。",
    archetype: "B",
    has_vault: true,
    nav_date: "2026-06-13",
    nav: 1.0123,
    return_1y_pct: 2.1,
    max_drawdown_1y_pct: -0.1,
  },
  // —— QDII（海外） ——
  "019305": {
    fund_code: "019305",
    fund_name: "摩根标普500指数(QDII)人民币C",
    fund_type: "指数型 · QDII · 海外股票",
    risk_level: "R4 · 中高风险",
    summary: "跟踪标普500的 QDII 指数基金，适合作为海外权益配置工具。",
    archetype: "A",
    is_qdii: true,
    has_vault: true,
    nav_date: "2026-06-13",
    nav: 1.2845,
    return_1y_pct: 18.2,
    max_drawdown_1y_pct: -12.4,
  },
  "050025": {
    fund_code: "050025",
    fund_name: "博时标普500ETF联接A",
    fund_type: "指数型 · QDII · 海外股票",
    risk_level: "R4 · 中高风险",
    summary: "另一只跟踪标普500的 QDII 基金，费率略低。",
    archetype: "A",
    is_qdii: true,
    has_vault: false,
    nav_date: "2026-06-13",
    nav: 2.156,
    return_1y_pct: 17.8,
    max_drawdown_1y_pct: -12.8,
  },
  // —— 商品（黄金） ——
  "518880": {
    fund_code: "518880",
    fund_name: "华安黄金ETF联接A",
    fund_type: "商品型 · 黄金",
    risk_level: "R3 · 中风险",
    summary: "跟踪黄金价格，对冲通胀与尾部风险。",
    archetype: "F",
    has_vault: true,
    nav_date: "2026-06-13",
    nav: 1.567,
    return_1y_pct: 22.5,
    max_drawdown_1y_pct: -8.7,
  },
  // —— 商品（贵金属，主动管理） ——
  "001302": {
    fund_code: "001302",
    fund_name: "前海开源金银珠宝混合A",
    fund_type: "商品型 · 贵金属 · 黄金珠宝",
    risk_level: "R3 · 中风险",
    summary: "主动管理贵金属主题基金，投资黄金、珠宝及稀有金属相关证券，非指数跟踪。",
    archetype: "F",
    has_vault: true,
    nav_date: "2026-06-20",
    nav: 1.234,
    return_1y_pct: 18.5,
    max_drawdown_1y_pct: -12.0,
  },
  // —— QDII（全球股票，主动管理） ——
  "000041": {
    fund_code: "000041",
    fund_name: "华夏全球股票(QDII)",
    fund_type: "QDII · 主动 · 全球股票",
    risk_level: "R4 · 中高风险",
    summary: "主动管理全球股票QDII，精选全球优质企业，非指数跟踪，适合海外权益配置。",
    archetype: "A",
    is_qdii: true,
    has_vault: true,
    nav_date: "2026-06-16",
    nav: 1.4913,
    return_1y_pct: 23.22,
    max_drawdown_1y_pct: -15.0,
  },
};

export function getFundL0Profile(fundCode: string): FundL0Profile | null {
  return FUND_L0_REGISTRY[fundCode] ?? null;
}

export function formatL0Summary(profile: FundL0Profile): string {
  const lines = [
    `${profile.fund_code} · ${profile.fund_name}`,
    profile.fund_type,
    profile.risk_level,
    profile.summary,
  ];
  if (profile.nav_date && profile.nav != null) {
    lines.push(
      `净值 ${profile.nav}（${profile.nav_date}）` +
        (profile.return_1y_pct != null ? ` · 近1年约 ${profile.return_1y_pct}%` : "") +
        (profile.max_drawdown_1y_pct != null
          ? ` · 近1年最大回撤约 ${profile.max_drawdown_1y_pct}%`
          : ""),
    );
  }
  lines.push(
    profile.has_vault
      ? "披露材料：已入库，费率与范围可溯源至招募书。"
      : "披露材料：库内暂无完整招募书，硬事实以公开行情与公告为准。",
  );
  return lines.join("\n");
}
