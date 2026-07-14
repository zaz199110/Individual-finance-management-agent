/**
 * portfolio-report-compose.ts · 持仓分析报告 LLM 填槽
 *
 * 职责：填充 <!-- PORT-XXX --> 占位符，生成最终报告
 * 策略：LLM 生成 → TPL fallback → 不阻断发布
 * 参考：requirement/docs/samples/portfolio-report-blueprint.md §3
 */

import type { SlotConfig } from "@/lib/config/model-providers";
import { completeText } from "@/lib/llm/invoke";
import type { PortfolioGatherResult, PortfolioPositionMetrics } from "./holdings-nav-gather";
import { PLACEHOLDERS, aggregateByFundCode } from "./report-blueprint";

// ─── 输入接口 ────────────────────────────────────────────────────────────────

export interface ComposeParams {
  /** 原始 markdown（含占位符） */
  markdown: string;
  /** gather 汇总结果 */
  gather: PortfolioGatherResult;
  /** 是否启用 LLM（false 则全用 TPL fallback） */
  enableLlm?: boolean;
  /** 推理模型配置（enableLlm=true 时必填） */
  cfg?: SlotConfig;
}

export interface ComposeResult {
  /** 填充后的 markdown */
  markdown: string;
  /** 已填充的占位符列表 */
  filledPlaceholders: string[];
  /** 未填充的占位符列表（LLM 失败 + 无 TPL fallback） */
  unfilledPlaceholders: string[];
  /** 是否有 LLM 失败 */
  hasLlmFailure: boolean;
}

// ─── Prompt 构建辅助 ─────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  return n.toLocaleString("zh-CN");
}

function formatPct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function formatPnlAbs(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${formatMoney(n)} 元`;
}

const PORTFOLIO_COMPOSE_SYSTEM = `你是基金投顾报告编辑。根据持仓数据生成面向客户（用「您」）的简洁文字。要求：
- 不编造数据；
- 不承诺收益，不写买入/卖出建议；
- 文字专业、克制；
- 不用 L0/L1/Tushare/AKShare 等内部术语；
- 不要 markdown 围栏。`;

// ─── TPL Fallback 生成器 ─────────────────────────────────────────────────────

/**
 * 生成 §二 开篇 TPL fallback
 * 生成 §二 开篇 TPL fallback
 */
function generateCh2IntroTpl(gather: PortfolioGatherResult): string {
  const { total_pnl_abs, total_pnl_pct, positions } = gather;

  let trend = "盈亏持平";
  if (total_pnl_abs > 0) {
    trend = "整体盈利";
  } else if (total_pnl_abs < 0) {
    trend = "整体亏损";
  }

  const hasMoneyFund = positions.some((p) => p.is_money_fund);

  let base = `您的组合当前**${trend}**。下方表格从不同维度拆解收益来源。`;

  if (hasMoneyFund) {
    base += ` 货币基金持仓收益按每日万份收益实际累加计算。`;
  }

  return base;
}

/**
 * 生成 §三 开篇 TPL fallback
 * 一句话引导，不重复饼图/表格已有信息
 */
function generateCh3IntroTpl(): string {
  return `以下按基金类型展示您当前的持仓分布：`;
}

/**
 * 生成 §四 单基金条目 TPL fallback
 *
 * 输出分点列表：聚焦角色定位、表现方向、配置作用与关注建议，
 * 不重复表格中已有的数字（持有收益、市值、份额、成本）。
 */
function generateCh4FundTpl(pos: PortfolioPositionMetrics): string {
  if (!pos.l0_ok) {
    return `- **数据缺失：** 暂无行情数据，无法进行详细分析。`;
  }

  const role = pos.portfolio_role ?? "组合配置";
  const pnlPct = pos.pnl_pct ?? 0;
  const isUp = pnlPct > 0;
  const isFlat = pnlPct === 0;
  const fundType = (pos.fund_type ?? "").toLowerCase();

  // 角色定位
  const bullets: string[] = [`**角色定位：** 在本组合中承担「${role}」职能。`];

  // 本期表现方向
  if (pos.is_money_fund) {
    bullets.push("**本期表现：** 作为货币基金，收益来自每日万份收益实际累积，波动极低，主要承担现金替代与流动性管理功能。");
  } else if (isFlat) {
    bullets.push("**本期表现：** 基本持平，未出现明显盈亏。");
  } else if (isUp) {
    bullets.push("**本期表现：** 录得正收益，跑赢了成本线。");
  } else {
    bullets.push("**本期表现：** 出现回调，暂时低于买入成本。");
  }

  // 配置作用
  if (/货币|现金/.test(fundType) || pos.is_money_fund) {
    bullets.push("**配置作用：** 为组合提供日常赎回备用金，降低整体波动。");
  } else if (/债/.test(fundType)) {
    bullets.push("**配置作用：** 作为债券仓位，为组合提供相对稳定的票息收益和波动缓冲。");
  } else if (/股票|混合|指数/.test(fundType)) {
    bullets.push("**配置作用：** 作为权益仓位，承担组合的进攻职能，同时也会带来更大的净值波动。");
  } else {
    bullets.push("**配置作用：** 丰富组合收益来源，分散单一资产风险。");
  }

  // 关注建议/风险提示（不构成买卖建议）
  if (pos.is_money_fund) {
    bullets.push("**关注建议：** 货币基金收益通常随市场利率波动，可作为流动性储备长期持有。");
  } else if (pnlPct < -20) {
    bullets.push("**关注建议：** 回撤幅度较大，建议留意其持仓方向是否发生漂移，以及后续市场风格是否仍利于该产品。");
  } else if (pnlPct < -5) {
    bullets.push("**关注建议：** 短期出现一定浮亏，若持仓方向未发生根本变化，可结合自身风险承受能力决定是否继续持有。");
  } else if (pnlPct > 5) {
    bullets.push("**关注建议：** 当前已有一定浮盈，可关注是否需要进行再平衡，避免单一基金权重过高。");
  } else {
    bullets.push("**关注建议：** 当前波动相对可控，可继续观察后续表现。");
  }

  return bullets.map((b) => `- ${b}`).join("\n");
}

/**
 * 生成 §五 补句 TPL fallback
 */
function generateCh5SuppTpl(): string {
  return "";
}

// ─── LLM 生成器 ──────────────────────────────────────────────────────────────

async function generateCh2IntroLlm(
  cfg: SlotConfig,
  gather: PortfolioGatherResult,
): Promise<string | null> {
  const positiveCount = gather.positions.filter((p) => (p.pnl_pct ?? 0) > 0).length;
  const negativeCount = gather.positions.filter((p) => (p.pnl_pct ?? 0) < 0).length;

  const user = JSON.stringify(
    {
      task: "chapter2_intro",
      total_positions: gather.positions.length,
      positive_positions: positiveCount,
      negative_positions: negativeCount,
      total_pnl_abs: formatPnlAbs(gather.total_pnl_abs),
      total_pnl_pct: formatPct(gather.total_pnl_pct),
    },
    null,
    2,
  );

  const system = `${PORTFOLIO_COMPOSE_SYSTEM}\n为「持有收益」章输出 1 句开篇引导（20～50字，不用blockquote）。概括组合整体盈亏方向，不重复表格中的合计数据。`;

  const out = await completeText(cfg, {
    system,
    messages: [{ role: "user", content: user }],
    max_tokens: 600,
    temperature: 0.2,
  });

  const trimmed = out.trim();
  if (!trimmed) return null;
  return trimmed;
}

async function generateCh3IntroLlm(
  cfg: SlotConfig,
): Promise<string | null> {
  const user = JSON.stringify(
    {
      task: "chapter3_intro",
    },
    null,
    2,
  );

  const system = `${PORTFOLIO_COMPOSE_SYSTEM}\n为「结构分布」章输出 1 句开篇引导（20～40字）。引导读者看图看表，不重复表中的分类和数字。`;

  const out = await completeText(cfg, {
    system,
    messages: [{ role: "user", content: user }],
    max_tokens: 350,
    temperature: 0.25,
  });

  const trimmed = out.trim();
  if (!trimmed || trimmed.length < 30) return null;
  return trimmed;
}

async function generateCh4FundLlm(
  cfg: SlotConfig,
  pos: PortfolioPositionMetrics,
): Promise<string | null> {
  if (!pos.l0_ok) {
    return `- **数据缺失：** 暂无行情数据，无法进行详细分析。`;
  }

  const userObj: Record<string, unknown> = {
    task: "chapter4_fund",
    fund_code: pos.fund_code,
    fund_name: pos.fund_name,
    portfolio_role: pos.portfolio_role ?? "组合配置",
    pnl_abs: formatPnlAbs(pos.pnl_abs ?? 0),
    pnl_pct: formatPct(pos.pnl_pct ?? 0),
    is_money_fund: pos.is_money_fund ?? false,
  };

  let system = `${PORTFOLIO_COMPOSE_SYSTEM}\n为单只基金输出「分基解读」分点列表（4点，格式严格如下）：
- **角色定位：** 组合中的角色（用 portfolio_role）；
- **本期表现：** 涨跌方向及归因；
- **配置作用：** 如底仓/进攻/流动性等；
- **关注建议：** 风险提示，不写买卖建议。
每行以「- **」开头，标签用中文冒号「：」，不要使用「」括号包裹标签。不重复表格中的持有收益/市值/份额/成本。数据缺失时只输出一行错误提示。`;

  if (pos.is_money_fund) {
    userObj.daily_income_per_10k = pos.daily_income_per_10k;
    userObj.yield_7d_annual = pos.yield_7d_annual;
    system += `\n- 该基金为货币基金，收益来自每日万份收益累积；只讲流动性管理，不分析涨跌。`;
  }

  const user = JSON.stringify(userObj, null, 2);

  const out = await completeText(cfg, {
    system,
    messages: [{ role: "user", content: user }],
    max_tokens: 600,
    temperature: 0.2,
  });

  const trimmed = out.trim();
  if (!trimmed) return null;
  return trimmed;
}

async function generateCh5SuppLlm(cfg: SlotConfig): Promise<string | null> {
  // 不再生成免责补句，直接返回空字符串
  return "";
}

// ─── 主函数 ──────────────────────────────────────────────────────────────────

/**
 * 填充报告中的所有占位符
 * 策略：尝试 LLM → 失败则用 TPL fallback → 最终未填充则保留占位符
 */
export async function composePortfolioReport(
  params: ComposeParams,
): Promise<ComposeResult> {
  const {
    markdown,
    gather,
    enableLlm = false,
    cfg,
  } = params;

  let result = markdown;
  const filledPlaceholders: string[] = [];
  const unfilledPlaceholders: string[] = [];
  let hasLlmFailure = false;

  // ── 占位符映射表 ──────────────────────────────────────────────────────

  type PlaceholderTask = {
    placeholder: string;
    generator: () => string;
    llm: () => Promise<string | null>;
  };

  const placeholderMap: PlaceholderTask[] = [
    // §二 开篇
    {
      placeholder: PLACEHOLDERS.CH2_INTRO,
      generator: () => generateCh2IntroTpl(gather),
      llm: () => generateCh2IntroLlm(cfg!, gather),
    },
    // §三 开篇
    {
      placeholder: PLACEHOLDERS.CH3_INTRO,
      generator: () => generateCh3IntroTpl(),
      llm: () => generateCh3IntroLlm(cfg!),
    },
    // §五 补句
    {
      placeholder: PLACEHOLDERS.CH5_SUPP,
      generator: () => generateCh5SuppTpl(),
      llm: () => generateCh5SuppLlm(cfg!),
    },
  ];

  // §四 分基段落（每只基金一个占位符，按 fund_code 聚合）
  const fundLevelForCompose = aggregateByFundCode(gather.positions);
  for (const pos of fundLevelForCompose) {
    placeholderMap.push({
      placeholder: PLACEHOLDERS.CH4_FUND(pos.fund_code),
      generator: () => generateCh4FundTpl(pos),
      llm: () => generateCh4FundLlm(cfg!, pos),
    });
  }

  // ── 逐个填充 ──────────────────────────────────────────────────────────

  const canUseLlm = enableLlm && cfg != null;

  for (const { placeholder, generator, llm } of placeholderMap) {
    if (!result.includes(placeholder)) {
      continue;
    }

    let content: string | null = null;

    // 尝试 LLM（如果启用且配置可用）
    if (canUseLlm) {
      try {
        content = await llm();
      } catch (err) {
        hasLlmFailure = true;
        console.warn(`LLM 填充失败 [${placeholder}]:`, err);
      }
    }

    // LLM 失败或未启用，用 TPL fallback
    if (content === null) {
      content = generator();
    }

    // 替换占位符
    result = result.replace(placeholder, content);
    filledPlaceholders.push(placeholder);
  }

  // ── 检查残留占位符 ────────────────────────────────────────────────────

  const allPlaceholders = [
    PLACEHOLDERS.CH2_INTRO,
    PLACEHOLDERS.CH3_INTRO,
    PLACEHOLDERS.CH5_SUPP,
    ...fundLevelForCompose.map((p) => PLACEHOLDERS.CH4_FUND(p.fund_code)),
  ];

  for (const ph of allPlaceholders) {
    if (result.includes(ph)) {
      unfilledPlaceholders.push(ph);
    }
  }

  return {
    markdown: result,
    filledPlaceholders,
    unfilledPlaceholders,
    hasLlmFailure,
  };
}
