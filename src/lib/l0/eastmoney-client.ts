import type { ParsedFeeRates } from "@/lib/kb/disclosure-parse";
import type { L0AssetAllocation } from "@/lib/l0/registry-portfolio";
import type { HoldingAssetType, L0DividendRecord, L0TopHolding } from "@/lib/l0/types";

const EM_HEADERS = { Referer: "https://fundf10.eastmoney.com/" };

export interface EastMoneyFundOverview {
  fund_name?: string;
  fund_type?: string;
  benchmark_name?: string;
  fund_managers?: string;
  aum_text?: string;
  fee_rates?: ParsedFeeRates;
}

function parsePctField(raw?: string): number | undefined {
  if (!raw || raw === "---") return undefined;
  const m = raw.match(/([\d.]+)\s*%/);
  return m ? Number(m[1]) : undefined;
}

/** 天天基金 · 基本概况（AKShare fund_overview_em 等价） */
export async function fetchFundOverviewEm(
  fundCode: string,
): Promise<EastMoneyFundOverview | null> {
  const res = await fetch(`https://fundf10.eastmoney.com/jbgk_${fundCode}.html`, {
    headers: EM_HEADERS,
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)];
  let kv: Record<string, string> = {};
  for (const table of tables) {
    const candidate: Record<string, string> = {};
    const pairs = [
      ...table[1]!.matchAll(/<th[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi),
    ];
    for (const pair of pairs) {
      const key = pair[1]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      const val = pair[2]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (key && val && !candidate[key]) candidate[key] = val;
    }
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(table[1]!)) !== null) {
      if (/<th/i.test(rowMatch[1]!)) {
        const cells = [...rowMatch[1]!.matchAll(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) =>
          m[2]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
        );
        for (let i = 0; i + 1 < cells.length; i += 2) {
          const key = cells[i];
          const val = cells[i + 1];
          if (key && val && !candidate[key]) candidate[key] = val;
        }
        continue;
      }
      const cells = [...rowMatch[1]!.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
        m[1]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
      );
      for (let i = 0; i + 1 < cells.length; i += 2) {
        const key = cells[i];
        const val = cells[i + 1];
        if (key && val && !candidate[key]) candidate[key] = val;
      }
    }
    if (candidate["基金简称"] || candidate["基金代码"]) {
      if (!candidate["基金类型"] && candidate["基金代码"]?.includes("基金类型")) {
        const m = candidate["基金代码"].match(/基金类型(.+)$/);
        if (m) {
          candidate["基金类型"] = m[1]!.trim();
          candidate["基金代码"] = candidate["基金代码"].replace(/基金类型.+$/, "").trim();
        }
      }
      kv = candidate;
      break;
    }
  }

  if (!Object.keys(kv).length) return null;

  const fee_rates: ParsedFeeRates = {
    management_pct: parsePctField(kv["管理费率"]),
    custody_pct: parsePctField(kv["托管费率"]),
    sales_service_pct: parsePctField(kv["销售服务费率"]),
    subscription_max_pct: parsePctField(kv["最高认购费率"]),
  };

  return {
    fund_name: kv["基金简称"] || kv["基金全称"],
    fund_type: kv["基金类型"],
    benchmark_name: kv["业绩比较基准"],
    fund_managers: kv["基金经理人"],
    aum_text: kv["净资产规模"],
    fee_rates,
  };
}

export function extractApidataContent(text: string): string | null {
  const start = text.indexOf('content:"');
  if (start < 0) return null;
  let i = start + 'content:"'.length;
  let out = "";
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "\\" && i + 1 < text.length) {
      out += text[i + 1];
      i += 2;
      continue;
    }
    if (ch === '"') break;
    out += ch;
    i += 1;
  }
  return out || null;
}

function parseHoldingsAsOf(html: string): string | undefined {
  const m = html.match(/截止至：[^0-9]*(\d{4}-\d{2}-\d{2})/);
  return m?.[1];
}

function latestQuarterHoldingsHtml(html: string): string {
  const parts = html.split(/<h4[^>]*class=['"]t['"][^>]*>/i);
  if (parts.length > 1) return parts[1] ?? html;
  return html;
}

function parseEmHoldingsTable(
  html: string,
  kind: "stock" | "bond",
): { holdings: L0TopHolding[]; as_of?: string } {
  const assetType: HoldingAssetType = kind === "stock" ? "stock" : "bond";
  const section = latestQuarterHoldingsHtml(html);
  const as_of = parseHoldingsAsOf(section) ?? parseHoldingsAsOf(html);

  const holdings: L0TopHolding[] = [];
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(section)) !== null) {
    const row = rowMatch[1]!;
    if (/<th/i.test(row)) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
    );
    if (cells.length < 4) continue;

    const pctCell = cells.find((c) => /^\d+(?:\.\d+)?%$/.test(c));
    const weight = pctCell ? Number(pctCell.replace("%", "")) : undefined;
    if (weight == null || !Number.isFinite(weight)) continue;

    let code = "";
    let name = "";
    if (kind === "stock" && cells.length >= 5) {
      code = cells[1] ?? "";
      name = cells[2] ?? "";
    } else if (kind === "bond") {
      code = cells[1] ?? "";
      name = cells[2] ?? "";
    }
    if (!name || /^\d+$/.test(name)) continue;
    if (/序号|股票代码|债券代码/.test(name)) continue;

    holdings.push({
      name,
      code: /^\d{6}$/.test(code) ? code : undefined,
      asset_type: assetType,
      weight_pct: weight,
    });
  }

  const byWeight = holdings
    .filter((h) => h.weight_pct != null && h.weight_pct > 0)
    .sort((a, b) => (b.weight_pct ?? 0) - (a.weight_pct ?? 0))
    .slice(0, 10);

  return { holdings: byWeight, as_of };
}

async function fetchEmPortfolioRaw(
  fundCode: string,
  type: "jjcc" | "zqcc",
  year: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    type,
    code: fundCode,
    topline: "10000",
    year,
    month: "",
    rt: "0.9",
  });
  const res = await fetch(
    `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?${params}`,
    { headers: EM_HEADERS, signal: AbortSignal.timeout(12000) },
  );
  if (!res.ok) return null;
  const text = await res.text();
  return extractApidataContent(text);
}

/** 股票前十（AKShare fund_portfolio_hold_em 等价） */
export async function fetchFundStockHoldingsEm(
  fundCode: string,
  year = String(new Date().getFullYear() - 1),
): Promise<{ holdings: L0TopHolding[]; as_of?: string } | null> {
  const html = await fetchEmPortfolioRaw(fundCode, "jjcc", year);
  if (!html) return null;
  const parsed = parseEmHoldingsTable(html, "stock");
  return parsed.holdings.length ? parsed : null;
}

/** 债券前十（AKShare fund_portfolio_bond_hold_em 等价） */
export async function fetchFundBondHoldingsEm(
  fundCode: string,
  year = String(new Date().getFullYear() - 1),
): Promise<{ holdings: L0TopHolding[]; as_of?: string } | null> {
  const html = await fetchEmPortfolioRaw(fundCode, "zqcc", year);
  if (!html) return null;
  const parsed = parseEmHoldingsTable(html, "bond");
  return parsed.holdings.length ? parsed : null;
}

export function concentrationFromHoldings(holdings: L0TopHolding[]): number | undefined {
  const sum = holdings.reduce((acc, h) => acc + (h.weight_pct ?? 0), 0);
  return sum > 0 ? Math.round(sum * 10) / 10 : undefined;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function cleanDividendHistory(records: L0DividendRecord[]): L0DividendRecord[] {
  const cleaned = records
    .filter((r) => {
      if (!r.ex_date || !DATE_RE.test(r.ex_date.trim())) return false;
      const amount = r.amount_per_share;
      if (amount == null || Number.isNaN(amount) || amount <= 0) return false;
      return true;
    })
    .map((r) => ({
      ex_date: r.ex_date.trim(),
      amount_per_share: Number(r.amount_per_share),
      pay_date: r.pay_date && DATE_RE.test(r.pay_date.trim()) ? r.pay_date.trim() : undefined,
    }));

  const seen = new Set<string>();
  const deduped: L0DividendRecord[] = [];
  for (const r of cleaned) {
    const key = `${r.ex_date}|${r.amount_per_share}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }

  return deduped.sort((a, b) => a.ex_date.localeCompare(b.ex_date));
}

function extractAmountFromDividendText(text: string): number | undefined {
  if (!text) return undefined;
  const m = text.match(/([\d.]+)\s*元/);
  if (!m) return undefined;
  const val = Number(m[1]);
  return Number.isFinite(val) && val > 0 ? val : undefined;
}

function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Extract dividend records from freeform web search text.
 *  Handles patterns like:
 *  - "2024-01-15 每份分红0.50元"
 *  - "除息日 2024-01-15 每份 0.50 元"
 *  - "分红送配: 2024-01-15 每份派现金0.5000元"
 *  - "权益登记日：2024-01-15 每份派息0.50元"
 */
function extractDividendsFromWebText(text: string): L0DividendRecord[] {
  if (!text) return [];
  const records: L0DividendRecord[] = [];
  // Pattern: date (YYYY-MM-DD) followed within ~150 chars by an amount-per-share
  const datePattern = /\d{4}-\d{2}-\d{2}/g;
  const amountPattern = /([\d.]{2,})\s*(?:元(?:\/份)?|派现金|每份)/;
  let dateMatch: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((dateMatch = datePattern.exec(text)) !== null) {
    const datePos = dateMatch.index;
    const ex_date = dateMatch[0];
    // Look for amount within ~150 chars after the date
    const window = text.slice(datePos, datePos + 150);
    const amtMatch = amountPattern.exec(window);
    if (!amtMatch) continue;
    const amount_per_share = Number(amtMatch[1]);
    if (!Number.isFinite(amount_per_share) || amount_per_share <= 0) continue;
    // Also look for pay_date within the same window
    const payDateRe = /\d{4}-\d{2}-\d{2}/g;
    payDateRe.lastIndex = 0;
    let pay_date: string | undefined;
    let payMatch: RegExpExecArray | null;
    // Find second date occurrence as pay_date
    let payCount = 0;
    while ((payMatch = payDateRe.exec(window)) !== null) {
      payCount++;
      if (payCount > 1) {
        pay_date = payMatch[0];
        break;
      }
    }
    const key = `${ex_date}|${amount_per_share}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({ ex_date, amount_per_share, pay_date });
  }
  return records;
}

/** 轻量分红拉取：优先 JSONP API，失败后回退 HTML 解析，最后尝试联网搜索。
 *  每个 Tier 仅在确实拿到数据时才早退；空结果或错误均自动降级到下一 Tier。 */
export async function fetchFundDividendsLightweight(
  fundCode: string,
  fundName?: string,
): Promise<L0DividendRecord[]> {
  // Tier 1: JSONP API
  try {
    const res = await fetch(
      `https://api.fund.eastmoney.com/f10/fhsp?callback=jQuery&fundCode=${fundCode}&pageIndex=1&pageSize=50`,
      { headers: EM_HEADERS, signal: AbortSignal.timeout(12000) },
    );
    if (res.ok) {
      const text = await res.text();
      // Strip JSONP wrapper: jQuery(...)
      const jsonStart = text.indexOf("(");
      const jsonEnd = text.lastIndexOf(")");
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        const jsonStr = text.slice(jsonStart + 1, jsonEnd);
        const parsed = JSON.parse(jsonStr) as {
          Data?: { list?: Array<Record<string, unknown>> };
        };
        const list = parsed?.Data?.list;
        if (Array.isArray(list)) {
          const records: L0DividendRecord[] = [];
          for (const item of list) {
            const ex_date = String(item["EXDIVIDEND"] ?? "").trim();
            const amount_per_share = Number(item["DIVIDEND"]);
            const pay_date = String(item["PAYDATE"] ?? "").trim();
            if (!ex_date || !Number.isFinite(amount_per_share) || amount_per_share <= 0) continue;
            records.push({ ex_date, amount_per_share, pay_date: pay_date || undefined });
          }
          const cleaned = cleanDividendHistory(records);
          if (cleaned.length > 0) return cleaned;
        }
      }
    }
  } catch {
    // JSONP failed — fall through to Tier 2
  }

  // Tier 2: HTML page parsing
  try {
    const res = await fetch(
      `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=fhsp&code=${fundCode}&topline=50&rt=${Math.random()}`,
      { headers: EM_HEADERS, signal: AbortSignal.timeout(12000) },
    );
    if (res.ok) {
      const html = await res.text();
      const records: L0DividendRecord[] = [];
      const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowRe.exec(html)) !== null) {
        const row = rowMatch[1]!;
        if (/<th/i.test(row)) continue;
        const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
          m[1]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
        );
        if (cells.length < 7) continue;
        // Expected columns: 年份, 权益登记日, 除息日, 每份分红, 分红发放日
        const exDateIdx = 2;
        const payDateIdx = 4;
        const dividendIdx = 3;
        const ex_date = (cells[exDateIdx] ?? "").match(/\d{4}-\d{2}-\d{2}/)?.[0];
        const pay_date = (cells[payDateIdx] ?? "").match(/\d{4}-\d{2}-\d{2}/)?.[0];
        const amountText = cells[dividendIdx] ?? "";
        const m = amountText.match(/([\d.]+)\s*元/);
        const amount_per_share = m ? Number(m[1]) : undefined;
        if (!ex_date || amount_per_share == null || !Number.isFinite(amount_per_share)) continue;
        records.push({ ex_date, amount_per_share, pay_date });
      }
      const cleaned = cleanDividendHistory(records);
      if (cleaned.length > 0) return cleaned;
    }
  } catch {
    // HTML failed — fall through to Tier 3
  }

  // Tier 3: Web search fallback
  if (fundName) {
    try {
      const { webSearch } = await import("@/harness/tools/web_search");
      const result = await webSearch({
        query: `${fundName} ${fundCode} 累计现金分红 每份`,
        max_results: 5,
      });
      const blob = result.summary + "\n" + (result.snippets ?? []).join("\n");
      const records = extractDividendsFromWebText(blob);
      if (records.length > 0) {
        console.log(`[eastmoney] ${fundCode} 分红来自 web search: ${records.length} 条`);
        return cleanDividendHistory(records);
      }
    } catch (e) {
      console.warn(`[eastmoney] ${fundCode} web search 分红兜底失败:`, e instanceof Error ? e.message : String(e));
    }
  }

  return [];
}

/** 天天基金 · 分红详情（HTML 页面兜底） */
export async function fetchFundDividendsEm(fundCode: string): Promise<L0DividendRecord[]> {
  try {
    const res = await fetch(`https://fundf10.eastmoney.com/fhsp_${fundCode}.html`, {
      headers: EM_HEADERS,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)];
    for (const table of tables) {
      const tableHtml = table[0] ?? "";
      const inner = table[1] ?? "";
      // Robustly locate the dividend table by header marker or class containing cfxq
      const isDividendTable =
        /<th[^>]*class=['"]first['"][^>]*>\s*年份\s*<\/th>/i.test(tableHtml) ||
        /class=['"][^'"]*\bcfxq\b/i.test(tableHtml);
      if (!isDividendTable) continue;

      const headerCells = [...inner.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
        stripHtmlTags(m[1] ?? ""),
      );
      if (!headerCells.length) continue;

      const colIndex: Record<string, number> = {};
      headerCells.forEach((h, i) => {
        if (/年份/.test(h)) colIndex.year = i;
        if (/权益登记日/.test(h)) colIndex.recordDate = i;
        if (/除息日/.test(h)) colIndex.exDate = i;
        if (/每份分红/.test(h)) colIndex.dividend = i;
        if (/分红发放日/.test(h)) colIndex.payDate = i;
      });

      if (colIndex.exDate == null || colIndex.dividend == null) continue;

      const records: L0DividendRecord[] = [];
      const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let rowMatch: RegExpExecArray | null;
      while ((rowMatch = rowRe.exec(inner)) !== null) {
        const row = rowMatch[1]!;
        if (/<th/i.test(row)) continue;
        const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) =>
          stripHtmlTags(m[1] ?? ""),
        );
        if (cells.length < Math.max(colIndex.exDate, colIndex.dividend) + 1) continue;

        const exDateRaw = cells[colIndex.exDate] ?? "";
        const dividendRaw = cells[colIndex.dividend] ?? "";
        const payDateRaw = colIndex.payDate != null ? cells[colIndex.payDate] : "";

        const ex_date = exDateRaw.match(/\d{4}-\d{2}-\d{2}/)?.[0];
        const pay_date = payDateRaw.match(/\d{4}-\d{2}-\d{2}/)?.[0];
        const amount_per_share = extractAmountFromDividendText(dividendRaw);

        if (!ex_date || amount_per_share == null) continue;
        records.push({ ex_date, amount_per_share, pay_date });
      }

      return cleanDividendHistory(records);
    }
    return [];
  } catch {
    return [];
  }
}
