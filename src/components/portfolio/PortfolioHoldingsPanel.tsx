"use client";

import { useEffect, useState } from "react";

interface HoldingsPosition {
  fund_code: string;
  fund_name?: string;
  invested_at: string;
  paid_amount: number;
  shares: number;
}

interface HoldingsPayload {
  has_current: boolean;
  position_count: number;
  total_cost: number;
  confirmed_at: string | null;
  positions_summary: string;
  summary: string;
  positions?: HoldingsPosition[];
}

interface PortfolioHoldingsPanelProps {
  embedded?: boolean;
  refreshToken?: number;
  /** 生成报告按钮点击回调 */
  onGenerateReport?: () => void;
}

export function PortfolioHoldingsPanel({ embedded, refreshToken, onGenerateReport }: PortfolioHoldingsPanelProps) {
  const [data, setData] = useState<HoldingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/portfolio/holdings")
      .then((r) => r.json())
      .then((d) => setData(d as HoldingsPayload))
      .catch(() => setError("无法加载持仓。"));
  }, [refreshToken]);

  const wrapperClass = embedded
    ? "p-4 h-full overflow-y-auto"
    : "max-w-2xl mx-auto p-6";

  if (error) {
    return <div className={`${wrapperClass} text-[#e03e3e]`}>{error}</div>;
  }

  if (!data) {
    return (
      <div className={`${wrapperClass} text-[#615d59]`}>正在加载当前持仓…</div>
    );
  }

  if (!data.has_current) {
    return (
      <div className={wrapperClass}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">当前持仓</h2>
          <button
            type="button"
            disabled
            className="px-4 py-2 text-sm font-medium text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed"
          >
            生成报告
          </button>
        </div>
        <p className="text-[#615d59] mt-2">暂无已确认的持仓快照。请在「持仓分析」Tab 录入并确认。</p>
      </div>
    );
  }

  const positions = data.positions ?? [];

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">当前持仓</h2>
        <button
          type="button"
          onClick={onGenerateReport}
          className="px-4 py-2 text-sm font-medium text-white bg-[#0075de] rounded-lg hover:bg-[#005bb5] transition-colors"
        >
          生成报告
        </button>
      </div>
      {positions.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[rgba(0,0,0,0.1)]">
                <th className="text-left py-2 px-3 font-semibold">基金名称</th>
                <th className="text-left py-2 px-3 font-semibold">基金代码</th>
                <th className="text-left py-2 px-3 font-semibold">买入时间</th>
                <th className="text-right py-2 px-3 font-semibold">买入金额</th>
                <th className="text-right py-2 px-3 font-semibold">持有份额</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p, i) => (
                <tr key={`${p.fund_code}-${p.invested_at}-${i}`} className="border-b border-[rgba(0,0,0,0.05)]">
                  <td className="py-2 px-3">{p.fund_name ?? p.fund_code}</td>
                  <td className="py-2 px-3">{p.fund_code}</td>
                  <td className="py-2 px-3">{p.invested_at}</td>
                  <td className="py-2 px-3 text-right">{p.paid_amount.toLocaleString("zh-CN")}</td>
                  <td className="py-2 px-3 text-right">{p.shares.toLocaleString("zh-CN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[15px] mt-2 whitespace-pre-line">{data.summary}</p>
      )}
      {data.confirmed_at && (
        <p className="text-xs text-[#615d59] mt-4">
          上次确认：{new Date(data.confirmed_at).toLocaleString("zh-CN")}
        </p>
      )}
    </div>
  );
}
