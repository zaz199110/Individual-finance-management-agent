export const DOC_TYPE_LABELS: Record<string, string> = {
  prospectus: "招募说明书",
  quarterly_report: "季报",
  semiannual_report: "半年报",
  annual_report: "年报",
  expert_opinion: "专家观点",
  other: "其他",
};

export const ALL_DOC_TYPES = [
  "prospectus",
  "quarterly_report",
  "semiannual_report",
  "annual_report",
  "expert_opinion",
  "other",
] as const;

export type DocType = (typeof ALL_DOC_TYPES)[number];

/**
 * FK-ENRICH-01 · 最低披露集标准
 * 每只基金需满足：4季报 + 2半年报 + 1年报 + 1产品说明 + ≥3专家观点（近12个月）
 */
export const MIN_DISCLOSURE_STANDARD: Record<string, number> = {
  prospectus: 1,
  quarterly_report: 4,
  semiannual_report: 2,
  annual_report: 1,
  expert_opinion: 3,
};

export function docTypeLabel(docType: string): string {
  return DOC_TYPE_LABELS[docType] ?? docType;
}
