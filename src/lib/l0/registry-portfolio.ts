import type { L0TopHolding } from "./types";

export type HoldingsKind = "stock" | "bond" | "fund" | "cd" | "mixed" | "none";

export interface L0AssetAllocation {
  stock_pct?: number;
  bond_pct?: number;
  cash_pct?: number;
  other_pct?: number;
}

/** 类型保留；本期报告不进持有人结构模块 */
export interface L0HolderStructure {
  as_of: string;
  as_of_label: string;
  individual_pct: number;
  institution_pct: number;
  internal_pct?: number;
}

/** 依 archetype / 产品类型推断前十标题路由（无 REG 假持仓） */
export function inferHoldingsKind(
  archetype: string,
  fundType?: string,
): HoldingsKind {
  if (archetype === "F") return "fund";
  if (archetype === "B") {
    return /存单/.test(fundType ?? "") ? "cd" : "bond";
  }
  if (archetype === "E") return "bond";
  if (archetype === "A" || archetype === "C" || archetype === "D") return "stock";
  return "mixed";
}

/** 历史兼容：不再合并演示持仓 */
export function mergeRegistryPortfolio<T extends { fund_code: string }>(
  profile: T,
): T {
  return profile;
}

export type RegistryPortfolioExtras = {
  asset_allocation: L0AssetAllocation;
  top_holdings: L0TopHolding[];
  holdings_kind: HoldingsKind;
  top_holdings_concentration: number;
  holdings_as_of: string;
  holder_structure?: L0HolderStructure;
};
