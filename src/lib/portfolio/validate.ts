import type { HoldingsPosition, HoldingsProposePayload } from "./types";
import { ERR_HOLDINGS_ROW_LIMIT } from "@/lib/chat/error-codes";

export function validateHoldings(raw: unknown): {
  ok: boolean;
  errors: string[];
  data?: HoldingsProposePayload;
} {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["holdings 须为对象。"] };
  }

  const o = raw as Record<string, unknown>;
  if (String(o.kind ?? "holdings") !== "holdings") {
    errors.push("kind 须为 holdings。");
  }

  const changeSummary = o.change_summary;
  if (!changeSummary || typeof changeSummary !== "object") {
    errors.push("缺少 change_summary。");
  } else {
    const cs = changeSummary as Record<string, unknown>;
    if (!String(cs.narrative ?? "").trim()) {
      errors.push("change_summary.narrative 必填。");
    }
    const kind = String(cs.kind ?? "");
    if (kind !== "initial" && kind !== "update") {
      errors.push("change_summary.kind 须为 initial 或 update。");
    }
  }

  const positions = o.positions;
  if (!Array.isArray(positions) || positions.length === 0) {
    errors.push("positions 须为至少 1 行的数组。");
  } else if (positions.length > 100) {
    errors.push(`[${ERR_HOLDINGS_ROW_LIMIT}] 单次最多保存 100 笔持仓记录。请删减或分批录入后再确认。`);
  } else {
    const keys = new Set<string>();
    for (const row of positions as HoldingsPosition[]) {
      const code = String(row.fund_code ?? "");
      if (!/^\d{6}$/.test(code)) {
        errors.push(`基金代码无效：${code || "空"}`);
      }
      const investedAt = String(row.invested_at ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(investedAt)) {
        errors.push(`${code} 买入时间格式无效（须为 YYYY-MM-DD）。`);
      }
      const paid = Number(row.paid_amount);
      if (!Number.isFinite(paid) || paid <= 0) {
        errors.push(`${code} paid_amount 须 > 0。`);
      }
      const shares = Number(row.shares);
      if (!Number.isFinite(shares) || shares <= 0) {
        errors.push(`${code} shares 须 > 0。`);
      }
      const rowKey = `${code}:${investedAt}`;
      if (keys.has(rowKey)) {
        errors.push(`重复持仓行：${rowKey}`);
      }
      keys.add(rowKey);
    }
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    data: o as unknown as HoldingsProposePayload,
  };
}

export function formatHoldingsCardBody(payload: HoldingsProposePayload): string {
  const lines = [
    payload.change_summary.narrative,
    "",
    `共 ${payload.positions.length} 笔：`,
    "",
    "基金名称 | 基金代码 | 买入时间 | 买入金额 | 持有份额",
  ];
  for (const p of payload.positions) {
    const name = p.fund_name ?? p.fund_code;
    lines.push(
      `${name} | ${p.fund_code} | ${p.invested_at} | ${p.paid_amount.toLocaleString("zh-CN")} | ${p.shares.toLocaleString("zh-CN")}`,
    );
  }
  return lines.join("\n");
}
