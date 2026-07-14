"use client";

import { useEffect, useRef, useState } from "react";
import type { EChartsType } from "echarts";

// ── Types ───────────────────────────────────────────────────────────

interface FundItem {
  fund_code: string;
  fund_name: string;
  weight_in_category?: number;
  allocation_pct_of_portfolio: number;
  recommendation_reason: string;
  role_label?: string;
}

interface DetailCategory {
  category: string;
  allocation_pct: number;
  items: FundItem[];
  structure_note?: string;
}

interface TargetAllocationCategory {
  category: string;
  allocation_pct: number;
  amount_cny?: number;
}

interface ScenarioConfig {
  has_data: boolean;
  goal_constraint_id: string;
  scenario_name: string;
  goal_type: string | null;
  principal_amount: number;
  monthly_amount: number;
  target_allocation: {
    total_amount_cny?: number;
    categories: TargetAllocationCategory[];
  } | null;
  allocation_rationale: string | null;
  detailed_plan: {
    categories?: DetailCategory[];
  } | null;
  investment_constraints: Record<string, unknown> | null;
  has_step1: boolean;
  has_step2_current: boolean;
}

interface AllConfigsResponse {
  has_data: boolean;
  has_profile: boolean;
  conversation_id: string;
  eligible_count: number;
  scenario_count: number;
  scenarios: ScenarioConfig[];
}

interface CurrentConfigPanelProps {
  conversationId: string;
  refreshToken?: number;
  onSetInput?: (text: string) => void;
  onSendMessage?: (text: string) => void;
  isStreamActive?: () => boolean;
}

// ── Pie chart sub-component ─────────────────────────────────────────

function ScenarioPieChart({
  categories,
}: {
  categories: { category: string; allocation_pct: number }[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let chart: EChartsType | null = null;
    void import("echarts").then((echarts) => {
      if (!containerRef.current) return;
      chart = echarts.init(containerRef.current);
      chartRef.current = chart;
      chart.setOption({
        tooltip: { trigger: "item" },
        legend: {
          orient: "horizontal",
          bottom: 0,
          left: "center",
          textStyle: { fontSize: 11 },
          itemWidth: 10,
          itemHeight: 10,
          itemGap: 12,
        },
        series: [
          {
            type: "pie",
            radius: ["36%", "64%"],
            center: ["50%", "44%"],
            avoidLabelOverlap: true,
            padAngle: 1,
            itemStyle: { borderRadius: 3 },
            label: {
              show: true,
              position: "outside",
              formatter: "{b}\n{d}%",
              fontSize: 11,
              lineHeight: 15,
              width: 70,
              overflow: "truncate",
            },
            labelLine: {
              length: 12,
              length2: 8,
              smooth: true,
            },
            emphasis: {
              label: { fontSize: 13, fontWeight: "bold" },
            },
            data: categories.map((c) => ({
              name: c.category,
              value: c.allocation_pct,
            })),
          },
        ],
      });
    });
    return () => {
      chart?.dispose();
    };
  }, [categories]);

  return <div ref={containerRef} style={{ width: 260, height: 230 }} />;
}

// ── Per-scenario card ───────────────────────────────────────────────

function ScenarioCard({
  scenario,
  onSendMessage,
  isStreamActive,
  defaultExpanded = true,
}: {
  scenario: ScenarioConfig;
  onSendMessage?: (text: string) => void;
  isStreamActive?: () => boolean;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const hasPie =
    scenario.target_allocation?.categories &&
    scenario.target_allocation.categories.length > 0;
  const hasFunds =
    scenario.detailed_plan?.categories &&
    scenario.detailed_plan.categories.some(
      (cat) => (cat.items ?? []).length > 0,
    );

  // Collect all fund items across categories
  const fundItems = hasFunds
    ? (scenario.detailed_plan!.categories ?? []).flatMap((cat) =>
        (cat.items ?? []).map((item) => ({ ...item })),
      )
    : [];

  // Count total funds for display
  const fundCount = fundItems.length;

  return (
    <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-white shadow-sm overflow-hidden">
      {/* Scenario name heading - clickable to expand/collapse */}
      <div
        className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)] bg-[#fafafa] flex items-center justify-between cursor-pointer select-none hover:bg-[#f0f0f0] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-[#615d59] transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          <h3 className="text-[16px] font-semibold m-0">
            {scenario.scenario_name ?? "未命名场景"}
          </h3>
          {fundCount > 0 && (
            <span className="text-xs text-[#93918f] ml-1">
              ({fundCount}只基金)
            </span>
          )}
        </div>
        <button
          type="button"
          disabled={!(scenario.has_step1 && scenario.has_step2_current)}
          onClick={(e) => {
            e.stopPropagation();
            if (onSendMessage) {
              onSendMessage(`生成【${scenario.scenario_name ?? "未命名"}】资产配置报告`);
            }
          }}
          className="px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-[#4f46e5] text-white hover:bg-[#4338ca] disabled:hover:bg-[#4f46e5]"
        >
          生成报告
        </button>
      </div>

      {/* Collapsible content */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${expanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"}`}
      >
        {/* Flex row: pie chart left, table right */}
        <div className="flex gap-4 p-4">
          {/* Left: Pie chart */}
          <div className="shrink-0">
            {hasPie ? (
              <ScenarioPieChart
                categories={scenario.target_allocation!.categories}
              />
            ) : (
              <div
                style={{ width: 260, height: 230 }}
                className="flex items-center justify-center text-[#b6b3b0] text-sm"
              >
                暂无大类资产配置
              </div>
            )}
          </div>

          {/* Right: Fund table */}
          <div className="flex-1 min-w-0">
            {hasFunds ? (
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 bg-[#f5f5f5] z-10">
                    <tr>
                      <th className="text-left px-3 py-2 border-b border-[rgba(0,0,0,0.1)] text-[#615d59] font-semibold">
                        基金代码
                      </th>
                      <th className="text-left px-3 py-2 border-b border-[rgba(0,0,0,0.1)] text-[#615d59] font-semibold">
                        基金名称
                      </th>
                      <th className="text-right px-3 py-2 border-b border-[rgba(0,0,0,0.1)] text-[#615d59] font-semibold">
                        组合资产占比
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fundItems.map((item, idx) => {
                      return (
                        <tr
                          key={`${item.fund_code}-${idx}`}
                          className={
                            idx % 2 === 0 ? "bg-white" : "bg-[#fafafa]"
                          }
                        >
                          <td className="px-3 py-2 border-b border-[rgba(0,0,0,0.06)] font-mono text-[#333]">
                            {item.fund_code}
                          </td>
                          <td className="px-3 py-2 border-b border-[rgba(0,0,0,0.06)] text-[#333]">
                            {item.fund_name}
                          </td>
                          <td className="px-3 py-2 border-b border-[rgba(0,0,0,0.06)] text-right text-[#333]">
                            {item.allocation_pct_of_portfolio != null
                              ? `${item.allocation_pct_of_portfolio}%`
                              : "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-[#b6b3b0] text-sm py-8">
                {hasPie ? "（暂无基金明细）" : ""}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export function CurrentConfigPanel({
  conversationId,
  refreshToken = 0,
  onSendMessage,
  isStreamActive,
}: CurrentConfigPanelProps) {
  const [response, setResponse] = useState<AllConfigsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch all configs ────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/conversations/${conversationId}/all-configs`)
      .then(async (r) => {
        if (!r.ok) throw new Error("加载失败");
        return r.json() as Promise<AllConfigsResponse>;
      })
      .then((d) => {
        if (cancelled) return;
        setResponse(d);
        if (!d.has_data) {
          setError("暂无配置数据");
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, refreshToken]);

  // ── Render states ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[#615d59] text-[15px]">
        正在加载配置…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-center">
          <div className="text-[#93918f] text-sm mb-2">{error}</div>
          <div className="text-[#b6b3b0] text-xs">
            请先选择投资场景并完成大类资产配置，选择基金后方案将更加完整
          </div>
        </div>
      </div>
    );
  }

  if (!response?.has_data || !response.scenarios?.length) {
    return (
      <div className="flex items-center justify-center h-full text-[#93918f] text-[15px]">
        当您完成大类资产配置后，详细方案将在此展示。
      </div>
    );
  }

  const scenariosWithData = response.scenarios.filter((s) => s.has_data);

  if (scenariosWithData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[#93918f] text-[15px]">
        当您完成大类资产配置后，详细方案将在此展示。
      </div>
    );
  }

  // If there are many scenarios (3+), collapse them by default to save space
  const shouldCollapseByDefault = scenariosWithData.length >= 3;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Scrollable container */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {scenariosWithData.map((scenario) => (
          <ScenarioCard
            key={scenario.goal_constraint_id}
            scenario={scenario}
            onSendMessage={onSendMessage}
            isStreamActive={isStreamActive}
            defaultExpanded={!shouldCollapseByDefault}
          />
        ))}
      </div>

      {/* Hint at the bottom - fixed position */}
      <div className="shrink-0 text-center text-[#b6b3b0] text-xs px-4 py-2 border-t border-[rgba(0,0,0,0.06)] bg-[#fafafa]">
        提示：在右侧聊天中输入如「修改【场景名称】的大类资产配置或基金配置」来调整方案
      </div>
    </div>
  );
}
