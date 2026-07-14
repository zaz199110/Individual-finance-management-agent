"use client";

import { useCallback, useEffect, useState } from "react";
import { useTransientNotice } from "@/lib/ui/transient-notice";
import type { BasicInfo, InvestmentConstraints } from "@/lib/profile/types";

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface GoalItem {
  goal_type: string;
  goal_display_name: string;
  goal_detail: Record<string, unknown>;
  investment_constraints: InvestmentConstraints;
}

interface ProfileViewPayload {
  profile_version_id: string;
  basic_info: BasicInfo | null;
  goals: GoalItem[];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ProfileViewPanelProps {
  embedded?: boolean;
  refreshToken?: number;
  /** When embedded in chat: conversation ID for API file write */
  conversationId?: string;
  /** Called when embedded: receives API result to insert chat card */
  onGenerateReport?: (result: {
    ok: boolean;
    markdown?: string;
    report_name?: string;
    file_path?: string;
    error?: string;
  }) => void;
  /** Send a chat message (shows 4-step progress bar via pipeline) */
  onSendMessage?: (text: string) => void;
}

// ---------------------------------------------------------------------------
// Label maps
// ---------------------------------------------------------------------------

const BASIC_INFO_LABELS: Record<keyof BasicInfo, string> = {
  name: "姓名",
  age: "年龄",
  gender: "性别",
  marital_status: "婚姻状况",
  has_children: "子女情况",
  occupation: "职业",
  investment_experience: "投资经验",
  annual_income_after_tax: "税后年收入",
  monthly_income_after_tax: "每月税后到手",
  financial_assets: "可投资金融资产",
  loan_balance_total: "贷款待还总额",
  monthly_loan_payment: "每月还贷",
  monthly_fixed_expense: "每月固定生活开支",
  monthly_investable: "每月可投资",
};

const BASIC_INFO_GROUPS: {
  title: string;
  keys: (keyof BasicInfo)[];
}[] = [
  {
    title: "个人资料",
    keys: [
      "name",
      "age",
      "gender",
      "marital_status",
      "has_children",
      "occupation",
      "investment_experience",
    ],
  },
  {
    title: "收支概况",
    keys: [
      "annual_income_after_tax",
      "monthly_income_after_tax",
      "monthly_fixed_expense",
      "monthly_investable",
    ],
  },
  {
    title: "资产与负债",
    keys: ["financial_assets", "loan_balance_total", "monthly_loan_payment"],
  },
];

// 每个场景的字段顺序（按照报告格式）
const GOAL_FIELD_ORDER: Record<string, string[]> = {
  retirement: [
    "risk_tolerance",
    "max_drawdown",
    "target_return",
    "principal_amount",
    "monthly_amount",
    "start_invest_date",
    "money_needed_date",
    "monthly_retirement_spending",
    "dca_completion_months",
  ],
  education: [
    "risk_tolerance",
    "start_invest_date",
    "money_needed_date",
    "principal_amount",
    "monthly_amount",
    "target_return",
    "max_drawdown",
    "dca_completion_months",
  ],
  housing: [
    "risk_tolerance",
    "start_invest_date",
    "money_needed_date",
    "principal_amount",
    "monthly_amount",
    "target_return",
    "max_drawdown",
    "dca_completion_months",
  ],
  marriage_child: [
    "risk_tolerance",
    "start_invest_date",
    "money_needed_date",
    "target_amount",
    "principal_amount",
    "monthly_amount",
    "target_return",
    "max_drawdown",
    "dca_completion_months",
  ],
  wealth_growth: [
    "risk_tolerance",
    "investment_duration",
    "principal_amount",
    "monthly_amount",
    "target_return",
    "max_drawdown",
    "dca_completion_months",
  ],
};

const FIELD_LABELS: Record<string, string> = {
  risk_tolerance: "风险偏好",
  max_drawdown: "最大回撤承受",
  target_return: "目标年化收益",
  principal_amount: "一次性投入",
  monthly_amount: "每月投入",
  start_invest_date: "计划开始日期",
  money_needed_date: "资金需求日期",
  monthly_retirement_spending: "每月退休生活支出",
  target_amount: "目标金额",
  investment_duration: "投资期限",
  dca_completion_months: "定投期限",
};

const GOAL_TYPE_MAP: Record<string, string> = {
  marriage_child: "结婚生育",
  wealth_growth: "财富增值",
  retirement: "退休养老",
  education: "子女教育",
  housing: "购房置业",
};

// ---------------------------------------------------------------------------
// Example sections for empty state
// ---------------------------------------------------------------------------

interface ExampleSection {
  id: string;
  title: string;
  text: string;
  /** Tailwind left-border color class */
  accent: string;
}

const EXAMPLE_SECTIONS: ExampleSection[] = [
  {
    id: "basic",
    title: "基本信息",
    accent: "border-l-[#0075de]",
    text: [
      "姓名：张三",
      "年龄：35 岁",
      "性别：男",
      "婚姻状况：已婚",
      "子女情况：一孩",
      "职业：软件工程师",
      "投资经验：3年",
      "税后年收入：300,000 元",
      "每月税后到手：25,000 元",
      "可投资金融资产：500,000 元",
      "贷款待还总额：1,200,000 元",
      "每月还贷：8,000 元",
      "每月固定生活开支：10,000 元",
      "每月可投资：7,000 元",
    ].join("\n"),
  },
  {
    id: "retirement",
    title: "退休养老",
    accent: "border-l-[#8b5cf6]",
    text: [
      "风险偏好：稳健型",
      "计划开始日期：2025-01-01",
      "资金需求日期：2055-01-01",
      "每月退休生活支出：15,000 元",
      "一次性投入：100,000 元",
      "每月投入：5,000 元",
      "目标年化收益：6%",
      "最大回撤承受：15%",
      "定投期限：12个月",
    ].join("\n"),
  },
  {
    id: "education",
    title: "子女教育",
    accent: "border-l-[#10b981]",
    text: [
      "风险偏好：平衡型",
      "计划开始日期：2025-01-01",
      "资金需求日期：2038-09-01",
      "一次性投入：50,000 元",
      "每月投入：3,000 元",
      "目标年化收益：7%",
      "最大回撤承受：10%",
      "定投期限：12个月",
    ].join("\n"),
  },
  {
    id: "housing",
    title: "购房置业",
    accent: "border-l-[#f59e0b]",
    text: [
      "风险偏好：保守型",
      "计划开始日期：2025-01-01",
      "资金需求日期：2028-06-01",
      "一次性投入：200,000 元",
      "每月投入：8,000 元",
      "目标年化收益：5%",
      "最大回撤承受：5%",
      "定投期限：12个月",
    ].join("\n"),
  },
  {
    id: "marriage",
    title: "结婚生育",
    accent: "border-l-[#ec4899]",
    text: [
      "风险偏好：平衡型",
      "计划开始日期：2025-01-01",
      "资金需求日期：2027-12-01",
      "目标金额：500,000 元",
      "一次性投入：80,000 元",
      "每月投入：3,000 元",
      "目标年化收益：6%",
      "最大回撤承受：10%",
      "定投期限：12个月",
    ].join("\n"),
  },
  {
    id: "wealth",
    title: "财富增值",
    accent: "border-l-[#06b6d4]",
    text: [
      "风险偏好：进取型",
      "投资期限：5年",
      "一次性投入：300,000 元",
      "每月投入：10,000 元",
      "目标年化收益：10%",
      "最大回撤承受：20%",
      "定投期限：12个月",
    ].join("\n"),
  },
];

function displayGoalType(goalType: string): string {
  return GOAL_TYPE_MAP[goalType] ?? goalType;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatDisplayValue(value: unknown, key?: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && value.trim() === "") return "未提供";
  if (typeof value === "number") {
    if (value === 0) return "—";
    if (key === "target_return") return `${value}%`;
    return value.toLocaleString("zh-CN");
  }
  return String(value);
}

function formatCopyValue(value: unknown, key?: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && value.trim() === "") return "未提供";
  if (typeof value === "number") {
    if (value === 0) return "—";
    if (key === "target_return") return `${value}%`;
    return value.toLocaleString("zh-CN");
  }
  return String(value);
}

/** Extract unit suffix for copy text (e.g. "岁" for age, "元" for monetary fields) */
function getUnitSuffix(key: string): string {
  const units: Record<string, string> = {
    age: " 岁",
    annual_income_after_tax: " 元",
    monthly_income_after_tax: " 元",
    financial_assets: " 元",
    loan_balance_total: " 元",
    monthly_loan_payment: " 元",
    monthly_fixed_expense: " 元",
    monthly_investable: " 元",
    target_return: "%",
    principal_amount: " 元",
    monthly_amount: " 元",
    max_drawdown: "",
    target_amount: " 元",
    monthly_retirement_spending: " 元",
  };
  return units[key] ?? "";
}

/** Check if a value is meaningful (not null/undefined/empty string/zero) */
function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  if (typeof value === "number" && value === 0) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Profile section copy helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProfileViewPanel({
  embedded,
  refreshToken,
  conversationId,
  onGenerateReport,
  onSendMessage,
}: ProfileViewPanelProps) {
  const [data, setData] = useState<ProfileViewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedGoals, setExpandedGoals] = useState<Set<number>>(new Set());
  const [basicInfoExpanded, setBasicInfoExpanded] = useState(true);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const { notice: toast, showNotice: showToast } = useTransientNotice();

  // ----- fetch -----

  const loadProfile = useCallback(() => {
    setLoading(true);
    setError(null);
    void fetch("/api/profile/current")
      .then(async (r) => {
        if (r.status === 404) {
          // No profile version yet — treat as empty state
          setData(null);
          setLoading(false);
          return;
        }
        if (!r.ok) throw new Error(`请求失败 (${r.status})`);
        const json = (await r.json()) as ProfileViewPayload;
        setData(json);
        // Expand the first goal by default
        if (json.goals && json.goals.length > 0) {
          setExpandedGoals(new Set([0]));
        }
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "加载失败");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile, refreshToken]);

  // ----- copy -----

  const copyToClipboardFallback = useCallback((text: string): boolean => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }, []);

  // ----- copy example sections -----

  const handleCopySection = useCallback(async (sectionId: string) => {
    const section = EXAMPLE_SECTIONS.find((s) => s.id === sectionId);
    if (!section) return;
    // 复制时自带场景说明，方便对话框识别
    const copyText = `【${section.title}】\n${section.text}`;
    try {
      await navigator.clipboard.writeText(copyText);
    } catch {
      copyToClipboardFallback(copyText);
    }
    setCopiedSection(sectionId);
    setTimeout(() => setCopiedSection(null), 2000);
  }, [copyToClipboardFallback]);

  const handleCopyAll = useCallback(async () => {
    // 复制全部示例时，每个场景自带场景说明
    const allText = EXAMPLE_SECTIONS.map((s) => `【${s.title}】\n${s.text}`).join("\n\n");
    try {
      await navigator.clipboard.writeText(allText);
    } catch {
      copyToClipboardFallback(allText);
    }
    setCopiedSection("all");
    setTimeout(() => setCopiedSection(null), 2000);
  }, [copyToClipboardFallback]);

  // ----- copy individual profile sections -----

  /** Copy all basic info as key-value text */
  const handleCopyAllBasicInfo = useCallback(async () => {
    if (!data?.basic_info) return;
    const lines: string[] = ["【基本情况】"];
    for (const group of BASIC_INFO_GROUPS) {
      for (const key of group.keys) {
        const value = data.basic_info[key];
        if (!hasValue(value)) continue;
        const label = BASIC_INFO_LABELS[key];
        const formatted = formatCopyValue(value, key);
        const unit = getUnitSuffix(key);
        lines.push(`${label}：${formatted}${unit}`);
      }
    }
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      copyToClipboardFallback(text);
    }
    showToast("已复制到剪贴板");
  }, [data, showToast, copyToClipboardFallback]);

  /** Copy a single goal as 【目标名】key:value text */
  const handleCopyGoal = useCallback(
    async (goal: GoalItem) => {
      const displayName =
        goal.goal_display_name || displayGoalType(goal.goal_type);
      const lines = [`【${displayName}】`];
      const c = goal.investment_constraints as unknown as Record<
        string,
        unknown
      >;
      const goalDetail = (goal.goal_detail ?? {}) as Record<string, unknown>;

      // Get field order for this goal type
      const fieldOrder = GOAL_FIELD_ORDER[goal.goal_type] || [];
      
      // Build fields in order
      for (const key of fieldOrder) {
        const value = c[key] ?? goalDetail[key] ?? null;
        if (!hasValue(value)) continue;
        const label = FIELD_LABELS[key] || key;
        const formatted = formatCopyValue(value, key);
        const unit = getUnitSuffix(key);
        lines.push(`${label}：${formatted}${unit}`);
      }

      const text = lines.join("\n");
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        copyToClipboardFallback(text);
      }
      showToast("已复制到剪贴板");
    },
    [showToast, copyToClipboardFallback],
  );

  // ----- clear individual profile sections -----

  const handleClearBasicInfo = useCallback(async () => {
    if (!window.confirm("确定要清空基本信息吗？")) return;
    try {
      const res = await fetch("/api/profile/basic-info/reset", { method: "POST" });
      const result = await res.json();
      if (!res.ok) {
        showToast(result.error || "清空基本信息失败。");
        return;
      }
      showToast(result.message || "已清空基本信息。");
      loadProfile();
    } catch {
      showToast("清空基本信息失败。");
    }
  }, [showToast, loadProfile]);

  const handleClearGoal = useCallback(
    async (goalType: string) => {
      if (!window.confirm("确定要清空该投资需求吗？")) return;
      try {
        const res = await fetch("/api/profile/goals/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goal_type: goalType }),
        });
        const result = await res.json();
        if (!res.ok) {
          showToast(result.error || "清空投资需求失败。");
          return;
        }
        showToast(result.message || "已清空投资需求。");
        loadProfile();
      } catch {
        showToast("清空投资需求失败。");
      }
    },
    [showToast, loadProfile],
  );

  // ----- goal collapse toggle -----

  const toggleGoal = useCallback((index: number) => {
    setExpandedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // ----- generate report -----

  const handleGenerateReport = useCallback(async () => {
    if (onSendMessage) {
      onSendMessage("生成报告");
      return;
    }
    setGenerating(true);
    try {
      const body: Record<string, unknown> = {};
      if (conversationId) {
        body.conversation_id = conversationId;
      }
      const res = await fetch("/api/profile/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) {
        showToast(result.error || "生成报告失败。");
        return;
      }

      // Embedded mode: pass result to ChatShell callback
      if (onGenerateReport) {
        onGenerateReport(result);
        return;
      }

      // Standalone mode: download as MD file
      const blob = new Blob([result.markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${result.report_name || "投资需求报告"}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast("报告已生成并下载。");
    } catch {
      showToast("生成报告失败。");
    } finally {
      setGenerating(false);
    }
  }, [showToast, conversationId, onGenerateReport, onSendMessage]);

  // ----- wrapper class -----

  const wrapperClass = embedded
    ? "p-4 h-full overflow-y-auto"
    : "max-w-2xl mx-auto p-6";

  const hasData = data?.basic_info || (data?.goals && data.goals.length > 0);

  // ----- loading skeleton -----

  if (loading) {
    return (
      <div className={`${wrapperClass} space-y-5 animate-pulse`}>
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-28 rounded bg-[#e5e5e5]" />
            <div className="h-4 w-44 rounded bg-[#e5e5e5]" />
          </div>
          <div className="h-8 w-28 rounded-lg bg-[#e5e5e5]" />
        </div>

        {/* Card skeleton */}
        <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-5 space-y-4">
          <div className="h-4 w-20 rounded bg-[#e5e5e5]" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-12 rounded bg-[#e5e5e5]" />
                <div className="h-4 w-20 rounded bg-[#e5e5e5]" />
              </div>
            ))}
          </div>
        </div>

        {/* Second card skeleton */}
        <div className="rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-5 space-y-3">
          <div className="h-4 w-20 rounded bg-[#e5e5e5]" />
          <div className="h-12 w-full rounded bg-[#e5e5e5]" />
        </div>
      </div>
    );
  }

  // ----- error -----

  if (error) {
    return (
      <div className={wrapperClass}>
        <div className="rounded-xl border border-[#e03e3e]/20 bg-[#fef2f2] p-5 text-center">
          <p className="text-sm text-[#e03e3e] font-medium">
            无法加载画像数据
          </p>
          <p className="mt-1 text-xs text-[#615d59]">{error}</p>
          <button
            type="button"
            onClick={loadProfile}
            className="mt-3 text-sm font-medium text-[#0075de] hover:underline transition"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isAllCopied = copiedSection === "all";

  return (
    <div className={wrapperClass}>
      {/* ---- Empty state hero (only when no data) ---- */}
      {!hasData && (
        <div className="flex flex-col items-center text-center mb-6">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#f0f7ff] to-[#e8f4fd]">
            <svg
              className="h-6 w-6 text-[#0075de]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              <line x1="9" y1="14" x2="15" y2="14" />
              <line x1="9" y1="17" x2="13" y2="17" />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-[#1a1a1a]">
            暂无画像数据
          </h3>
          <p className="mt-1.5 max-w-sm text-[13px] text-[#615d59] leading-relaxed">
            以下是一些示例，可复制后修改并发送到对话中。
          </p>
        </div>
      )}

      {/* ---- Profile data (when has data) ---- */}
      {hasData && data && (
        <>
          {/* Header row */}
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#1a1a1a]">当前画像</h2>
            {(() => {
              const hasBasicInfo = !!data.basic_info;
              const hasGoals = data.goals && data.goals.length > 0;
              const canGenerate = hasBasicInfo && hasGoals;
              return (
                <button
                  type="button"
                  onClick={handleGenerateReport}
                  disabled={!canGenerate || generating}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    canGenerate && !generating
                      ? "bg-[#0075de] text-white hover:bg-[#0066c8]"
                      : "bg-[#e5e5e5] text-[#a39e98] cursor-not-allowed"
                  }`}
                >
                  {generating ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      生成中...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      生成报告
                    </>
                  )}
                </button>
              );
            })()}
          </div>

          {/* Toast */}
          {toast && (
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-lg bg-[#0075de]/[0.08] px-3 py-2 text-sm text-[#0075de]">
              <CheckIcon className="w-4 h-4" />
              <span>{toast}</span>
            </div>
          )}

          {/* BasicInfo */}
          {data.basic_info && (
            <section className="mb-6">
              <BasicInfoCard
                basicInfo={data.basic_info}
                expanded={basicInfoExpanded}
                onToggle={() => setBasicInfoExpanded((prev) => !prev)}
                onCopy={handleCopyAllBasicInfo}
                onClear={handleClearBasicInfo}
              />
            </section>
          )}

          {/* Goals */}
          {data.goals && data.goals.length > 0 && (
            <section className="mb-6">
              <h3 className="text-sm font-semibold text-[#1a1a1a] mb-3 flex items-center gap-2">
                <span className="inline-block w-1 h-4 rounded-full bg-[#0075de]" />
                投资目标
              </h3>
              <div className="space-y-3">
                  {data.goals.map((goal, index) => (
                    <GoalCard
                      key={`${goal.goal_type}-${index}`}
                      goal={goal}
                      expanded={expandedGoals.has(index)}
                      onToggle={() => toggleGoal(index)}
                      onCopy={handleCopyGoal}
                      onClear={() => handleClearGoal(goal.goal_type)}
                    />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ---- Examples section (always visible) ---- */}
      <section className={!hasData ? "" : "border-t border-[#f0f0f0] pt-6"}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#1a1a1a] flex items-center gap-2">
            <span className="inline-block w-1 h-4 rounded-full bg-[#0075de]" />
            {hasData ? "示例参考" : "可复制的示例"}
          </h2>
          <button
            type="button"
            onClick={handleCopyAll}
            className={`inline-flex items-center gap-1.5 rounded-lg bg-[#f6f5f4] px-3 py-1.5 text-[12px] font-medium transition-colors ${
              isAllCopied
                ? "text-[#0075de]"
                : "text-[#615d59] hover:text-[#0075de]"
            }`}
          >
            {isAllCopied ? (
              <>
                <CheckIcon className="w-3.5 h-3.5" />
                全部已复制
              </>
            ) : (
              <>
                <CopyIcon className="w-3.5 h-3.5" />
                复制全部示例
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {EXAMPLE_SECTIONS.map((section) => {
            const isCopied = copiedSection === section.id;
            return (
              <div
                key={section.id}
                className={`rounded-xl border border-[#e5e5e5] bg-white text-left overflow-hidden border-l-[3px] self-start ${section.accent}`}
              >
                {/* Section header */}
                <div className="flex items-center justify-between px-4 pt-3 pb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <h4 className="text-[13px] font-semibold text-[#1a1a1a]">
                      {section.title}
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopySection(section.id)}
                    className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      isCopied
                        ? "bg-[#0075de]/[0.08] text-[#0075de]"
                        : "text-[#a39e98] hover:bg-[#f6f5f4] hover:text-[#0075de] active:bg-[#e8f4fd]"
                    }`}
                  >
                    {isCopied ? (
                      <>
                        <CheckIcon className="w-3 h-3" />
                        已复制
                      </>
                    ) : (
                      <>
                        <CopyIcon className="w-3 h-3" />
                        复制
                      </>
                    )}
                  </button>
                </div>

                {/* Copyable text block */}
                <div className="px-4 pb-3">
                  <pre className="text-[12px] text-[#615d59] font-mono bg-[#fafaf8] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">{section.text}</pre>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BasicInfo Card
// ---------------------------------------------------------------------------

function BasicInfoCard({
  basicInfo,
  expanded,
  onToggle,
  onCopy,
  onClear,
}: {
  basicInfo: BasicInfo;
  expanded: boolean;
  onToggle: () => void;
  onCopy?: () => void;
  onClear?: () => void;
}) {
  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white shadow-sm overflow-hidden">
      {/* Header (clickable) */}
      <div className="flex items-center justify-between px-5 py-4 hover:bg-[#fafafa] transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
        >
          <span className="text-sm font-semibold text-[#1a1a1a] truncate">
            基本信息
          </span>
          <ChevronIcon
            className={`w-4 h-4 text-[#a39e98] shrink-0 transition-transform duration-300 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </button>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {onClear && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[#a39e98] hover:text-[#e03e3e] hover:bg-[#fef2f2] transition-colors"
            >
              清空
            </button>
          )}
          {onCopy && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCopy();
              }}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[#a39e98] hover:text-[#0075de] hover:bg-[#0075de]/[0.04] transition-colors"
            >
              <CopyIcon className="w-3 h-3" />
              复制
            </button>
          )}
        </div>
      </div>

      {/* Collapsible content */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          expanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-5 pb-5 pt-1 border-t border-[#f0f0f0]">
          {BASIC_INFO_GROUPS.map((group, gi) => (
            <div
              key={group.title}
              className={gi > 0 ? "mt-4" : ""}
            >
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#a39e98] mb-2.5">
                {group.title}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                {group.keys.map((key) => {
                  const value = basicInfo[key];
                  return (
                    <div key={key} className="flex flex-col min-w-0">
                      <span className="text-[11px] text-[#a39e98] leading-tight">
                        {BASIC_INFO_LABELS[key]}
                      </span>
                      <span className="text-sm text-[#1a1a1a] font-medium mt-0.5 truncate">
                        {formatDisplayValue(value, key)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Goal Card (collapsible)
// ---------------------------------------------------------------------------

function GoalCard({
  goal,
  expanded,
  onToggle,
  onCopy,
  onClear,
}: {
  goal: GoalItem;
  expanded: boolean;
  onToggle: () => void;
  onCopy?: (goal: GoalItem) => void;
  onClear?: (goal: GoalItem) => void;
}) {
  const c = goal.investment_constraints as unknown as Record<string, unknown>;
  const goalDetail = (goal.goal_detail ?? {}) as Record<string, unknown>;
  const displayName = goal.goal_display_name || displayGoalType(goal.goal_type);
  
  // Get field order for this goal type
  const fieldOrder = GOAL_FIELD_ORDER[goal.goal_type] || [];
  
  // Build fields list with values from investment_constraints or goal_detail
  const fields = fieldOrder.map(key => ({
    key,
    value: c[key] ?? goalDetail[key] ?? null,
    label: FIELD_LABELS[key] || key,
  }));

  return (
    <div className="rounded-xl border border-[#e5e5e5] bg-white shadow-sm overflow-hidden">
      {/* Header (clickable) */}
      <div className="flex items-center justify-between px-5 py-4 hover:bg-[#fafafa] transition-colors">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
        >
          <span className="text-sm font-semibold text-[#1a1a1a] truncate">
            {displayName}
          </span>
          <ChevronIcon
            className={`w-4 h-4 text-[#a39e98] shrink-0 transition-transform duration-300 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </button>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {onClear && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear(goal);
              }}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[#a39e98] hover:text-[#e03e3e] hover:bg-[#fef2f2] transition-colors"
            >
              清空
            </button>
          )}
          {onCopy && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCopy(goal);
              }}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[#a39e98] hover:text-[#0075de] hover:bg-[#0075de]/[0.04] transition-colors"
            >
              <CopyIcon className="w-3 h-3" />
              复制
            </button>
          )}
        </div>
      </div>

      {/* Collapsible content */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          expanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-5 pb-5 pt-3 border-t border-[#f0f0f0]">
          {/* All fields in order */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            {fields.map(({ key, value, label }) => (
              <div key={key} className="flex flex-col min-w-0">
                <span className="text-[11px] text-[#a39e98] leading-tight">
                  {label}
                </span>
                <span className="text-sm text-[#1a1a1a] font-medium mt-0.5 truncate">
                  {formatDisplayValue(value, key)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "w-4 h-4"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "w-4 h-4"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "w-4 h-4"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
