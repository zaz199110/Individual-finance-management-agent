export type ReportTab = "profile" | "plan" | "portfolio" | "fund";

export const REPORT_TABS: Array<{ id: ReportTab; label: string }> = [
  { id: "profile", label: "投资需求" },
  { id: "plan", label: "资产配置方案" },
  { id: "portfolio", label: "持仓分析" },
  { id: "fund", label: "基金解读" },
];

export interface ReportListItem {
  id: string;
  report_type: ReportTab;
  report_name: string;
  generated_at: string;
  file_path: string;
  goal_constraint_id?: string | null;
  fund_code?: string | null;
  is_current?: boolean;
  /** portfolio 定时任务直发时 metadata.trigger_source=scheduled */
  trigger_source?: "scheduled";
}

export interface ReportDetail extends ReportListItem {
  markdown: string;
  valid_report_ids: string[];
}
