/**
 * Shared constraint key normalization and defensive value helpers.
 *
 * Why this exists:
 *   - DB `investment_constraints` JSONB evolves over time → key names drift.
 *   - DB values can be number/string/date → code must not assume a single JS type.
 *   - Duplicated normalize functions in report-merge.ts / report-draft.ts → single source of truth.
 *
 * Rules:
 *   1. Don't crash — every value read from constraints goes through a defensive converter.
 *   2. Don't drop — unknown DB keys pass through unchanged (no silent data loss).
 *   3. Don't be deaf — warn when DB keys don't match any known mapping.
 */

// ---------------------------------------------------------------------------
//  Key mapping (DB-native → code-canonical)
// ---------------------------------------------------------------------------

export const CONSTRAINT_KEY_MAP: Record<string, string> = {
  start_date: "start_invest_date",
  risk_preference: "risk_tolerance",
  target_annual_return: "target_return",
  target_date: "money_needed_date",
  monthly_retirement_payout: "monthly_retirement_spending",
  investment_horizon_years: "investment_duration",
  investment_horizon: "investment_duration",
  expected_return: "target_return",
};

// All known DB-native keys (keys that exist *before* normalization)
const KNOWN_DB_KEYS = new Set([
  ...Object.keys(CONSTRAINT_KEY_MAP),
  // Keys already in canonical form — they pass through as-is:
  "start_invest_date",
  "risk_tolerance",
  "target_return",
  "money_needed_date",
  "monthly_retirement_spending",
  "investment_duration",
  // Other commonly used keys from DB:
  "max_drawdown",
  "max_single_position",
  "liquidity_need",
  "money_needed_start_date",
  "payment_type",
  "payment_amount",
  "payment_duration_years",
  "retirement_age",
  "current_age",
  "dca_completion_months",
  // Goal-level fields merged into constraints:
  "principal_amount",
  "monthly_amount",
  "target_amount",
  // V2 field names (richer data model from seed JSON):
  "deploy_mode",
  "expected_return",
  "investment_scope",
  "investment_horizon",
]);

// All known code-canonical keys (keys code expects *after* normalization)
const KNOWN_CODE_KEYS = new Set([
  "start_invest_date",
  "risk_tolerance",
  "target_return",
  "money_needed_date",
  "monthly_retirement_spending",
  "investment_duration",
  "max_drawdown",
  "max_single_position",
  "liquidity_need",
  "money_needed_start_date",
  "payment_type",
  "payment_amount",
  "payment_duration_years",
  "retirement_age",
  "current_age",
  "dca_completion_months",
  // Goal-level values merged into constraints:
  "principal_amount",
  "monthly_amount",
  "target_amount",
]);

// ---------------------------------------------------------------------------
//  Normalize
// ---------------------------------------------------------------------------

export function normalizeConstraintKeys(
  c: Record<string, unknown>,
  opts?: { logWarnings?: boolean; goalId?: string },
): Record<string, unknown> {
  const log = opts?.logWarnings !== false;
  const prefix = opts?.goalId ? `[goal:${opts.goalId}]` : "[constraints]";

  const out: Record<string, unknown> = { ...c };

  // Rename known DB-native keys → canonical
  for (const [oldKey, newKey] of Object.entries(CONSTRAINT_KEY_MAP)) {
    if (out[oldKey] !== undefined && out[oldKey] !== null) {
      if (out[newKey] === undefined || out[newKey] === null) {
        out[newKey] = out[oldKey];
        delete out[oldKey];
      }
      // else: canonical key already has a value — keep it, drop the old one
      delete out[oldKey];
    }
  }

  // Warn about completely unknown keys
  if (log) {
    for (const key of Object.keys(out)) {
      if (!KNOWN_DB_KEYS.has(key) && !KNOWN_CODE_KEYS.has(key)) {
        console.warn(
          `${prefix} Unknown constraint key "${key}" (value type: ${typeof out[key]}). ` +
            "Data is preserved but no code reads it. Consider adding a mapping or canonical key.",
        );
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
//  Defensive value accessors
// ---------------------------------------------------------------------------

/** Convert any constraint value to a trimmed string, never throws. */
export function toSafeString(v: unknown, fallback = ""): string {
  if (v === undefined || v === null) return fallback;
  return String(v).trim();
}

/** Convert any constraint value to a number, never throws. Returns NaN for unparseable values. */
export function toSafeNumber(v: unknown): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return NaN;
}

/** Format a constraint value as Chinese yuan, safely. */
export function fmtYuanSafe(v: unknown, fallback = "—"): string {
  const n = toSafeNumber(v);
  if (Number.isNaN(n)) return fallback;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万元`;
  return `${n.toFixed(0)}元`;
}

/** Format a constraint value as percentage string (e.g. "15%"), safely. */
export function fmtPercentSafe(v: unknown, fallback = "—"): string {
  const n = toSafeNumber(v);
  if (Number.isNaN(n)) return fallback;
  return `${n}%`;
}
