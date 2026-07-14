import { FUND_L0_REGISTRY, type FundL0Profile } from "@/harness/infra/fund_knowledge/l0-registry";
import { tushareQuery } from "@/lib/l0/tushare-client";

export type PlanFundCategory = "股票类" | "债券类" | "货币类";

export interface ScreenedFundCandidate {
  fund_code: string;
  fund_name: string;
  category: PlanFundCategory;
  fund_type: string;
  aum_yi?: number;
  establish_years?: number;
  is_qdii?: boolean;
  score: number;
  role_hint: string;
}

const SOFT_FILTER = {
  股票类: { min_aum_yi: 2, min_years: 3 },
  债券类: { min_aum_yi: 1, min_years: 2 },
  货币类: { min_aum_yi: 0.5, min_years: 1 },
} as const;

const DEFAULT_ESTABLISH_YEARS = 5;
const DEFAULT_AUM_YI = 10;

function mapCategory(profile: FundL0Profile): PlanFundCategory | null {
  const t = profile.fund_type.toLowerCase();
  if (/商品|黄金|原油/.test(t)) return null;
  if (/货币/.test(t)) return "货币类";
  if (/债/.test(t) || /同业存单|固收/.test(t)) return "债券类";
  if (/股票|指数|qdii|混合|偏股|宽基|行业|海外/.test(t)) return "股票类";
  return null;
}

function isCommodity(profile: FundL0Profile): boolean {
  return /商品|黄金|原油/.test(profile.fund_type);
}

function scoreCandidate(input: {
  aum_yi: number;
  establish_years: number;
  has_vault: boolean;
}): number {
  const stability = Math.min(input.establish_years / 10, 1);
  const aumScore = Math.log10(Math.max(input.aum_yi, 0.1));
  const vaultBonus = input.has_vault ? 0.05 : 0;
  return 0.5 * aumScore + 0.3 * stability + 0.2 * Math.min(aumScore / 3, 1) + vaultBonus;
}

function roleHint(profile: FundL0Profile, category: PlanFundCategory): string {
  const t = profile.fund_type;
  if (category === "货币类") return "流动性储备";
  if (/宽基|沪深300|中证500|全市场/.test(t)) return "宽基";
  if (/行业|消费|科技|主题/.test(t)) return "行业卫星";
  if (/信用/.test(t)) return "信用债底仓";
  if (/二级|混债/.test(t)) return "二级债增强";
  if (/利率|纯债/.test(t)) return "利率债";
  if (profile.is_qdii) return "海外权益";
  if (/混合/.test(t)) return "全市场混合";
  return "核心";
}

function registryCandidates(
  category: PlanFundCategory,
  excludeCodes: Set<string>,
  allowQdii: boolean,
): ScreenedFundCandidate[] {
  const out: ScreenedFundCandidate[] = [];
  for (const profile of Object.values(FUND_L0_REGISTRY)) {
    if (excludeCodes.has(profile.fund_code)) continue;
    if (isCommodity(profile)) continue;
    if (profile.is_qdii && !allowQdii) continue;
    const cat = mapCategory(profile);
    if (cat !== category) continue;
    const soft = SOFT_FILTER[category];
    const aum_yi = DEFAULT_AUM_YI;
    const years = DEFAULT_ESTABLISH_YEARS;
    if (aum_yi < soft.min_aum_yi || years < soft.min_years) continue;
    out.push({
      fund_code: profile.fund_code,
      fund_name: profile.fund_name,
      category,
      fund_type: profile.fund_type,
      aum_yi,
      establish_years: years,
      is_qdii: profile.is_qdii,
      score: scoreCandidate({ aum_yi, establish_years: years, has_vault: profile.has_vault }),
      role_hint: roleHint(profile, category),
    });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 40);
}

async function tushareFundUniverse(): Promise<
  Array<{ fund_code: string; fund_name: string; fund_type: string }>
> {
  const token = process.env.TUSHARE_TOKEN?.trim();
  if (!token) return [];
  try {
    const rows = await tushareQuery({
      token,
      apiName: "fund_basic",
      params: { market: "O", status: "L" },
      fields: "ts_code,name,fund_type,invest_type",
    });
    return rows
      .map((r) => {
        const ts = String(r.ts_code ?? "");
        const code = ts.split(".")[0] ?? "";
        if (!/^\d{6}$/.test(code)) return null;
        return {
          fund_code: code,
          fund_name: String(r.name ?? code),
          fund_type: String(r.fund_type ?? r.invest_type ?? ""),
        };
      })
      .filter(Boolean) as Array<{ fund_code: string; fund_name: string; fund_type: string }>;
  } catch {
    return [];
  }
}

export async function screenFundsForCategory(input: {
  category: PlanFundCategory;
  exclude_codes?: string[];
  allow_qdii?: boolean;
}): Promise<ScreenedFundCandidate[]> {
  const exclude = new Set(input.exclude_codes ?? []);
  const allowQdii = input.allow_qdii !== false;

  const fromRegistry = registryCandidates(input.category, exclude, allowQdii);
  if (fromRegistry.length >= 6) {
    return fromRegistry;
  }

  const universe = await tushareFundUniverse();
  const extra: ScreenedFundCandidate[] = [];
  for (const f of universe) {
    if (exclude.has(f.fund_code)) continue;
    const cached = FUND_L0_REGISTRY[f.fund_code];
    const profile: FundL0Profile = cached ?? {
      fund_code: f.fund_code,
      fund_name: f.fund_name,
      fund_type: f.fund_type,
      risk_level: "",
      summary: "",
      archetype: "D",
      has_vault: false,
    };
    if (isCommodity(profile)) continue;
    if (profile.is_qdii && !allowQdii) continue;
    const cat = mapCategory(profile);
    if (cat !== input.category) continue;
    if (fromRegistry.some((r) => r.fund_code === f.fund_code)) continue;
    extra.push({
      fund_code: f.fund_code,
      fund_name: profile.fund_name,
      category: input.category,
      fund_type: profile.fund_type,
      aum_yi: DEFAULT_AUM_YI,
      establish_years: DEFAULT_ESTABLISH_YEARS,
      is_qdii: profile.is_qdii,
      score: scoreCandidate({
        aum_yi: DEFAULT_AUM_YI,
        establish_years: DEFAULT_ESTABLISH_YEARS,
        has_vault: profile.has_vault,
      }),
      role_hint: roleHint(profile, input.category),
    });
  }

  const merged = [...fromRegistry, ...extra]
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);
  return merged;
}

export async function screenAllCategories(input?: {
  exclude_codes?: string[];
  allow_qdii?: boolean;
}): Promise<Record<PlanFundCategory, ScreenedFundCandidate[]>> {
  const categories: PlanFundCategory[] = ["股票类", "债券类", "货币类"];
  // 并行筛选三个大类，减少串行等待
  const results = await Promise.all(
    categories.map(async (cat) => ({
      category: cat,
      candidates: await screenFundsForCategory({
        category: cat,
        exclude_codes: input?.exclude_codes,
        allow_qdii: input?.allow_qdii,
      }),
    })),
  );
  const result = {} as Record<PlanFundCategory, ScreenedFundCandidate[]>;
  for (const r of results) {
    result[r.category] = r.candidates;
  }
  return result;
}
