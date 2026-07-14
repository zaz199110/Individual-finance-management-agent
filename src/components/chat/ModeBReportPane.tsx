"use client";

import { useEffect, useRef, useState } from "react";
import { ReportMarkdownPreview } from "@/components/reports/ReportMarkdownPreview";
import { FundWatchlistPanel } from "@/components/fund/FundWatchlistPanel";
import { PortfolioHoldingsPanel } from "@/components/portfolio/PortfolioHoldingsPanel";
import { ProfileViewPanel } from "@/components/profile/ProfileViewPanel";
import { CurrentConfigPanel } from "@/components/plan/CurrentConfigPanel";
import type { SceneId } from "@/harness/registry/load";
import {
  buildDraftPreviewUrl,
  previewTargetKey,
  type ReportPreviewTarget,
} from "@/lib/chat/report-publish-card";

export type ModeBLeftTab = "preview" | "watchlist" | "holdings" | "profile_view" | "current_config";

interface ModeBReportPaneProps {
  conversationId: string;
  activeTab: SceneId;
  leftTab: ModeBLeftTab;
  previewTarget: ReportPreviewTarget | null;
  /** 递增时在加载完成后滚到预览顶部（仅新草稿/用户点卡片） */
  scrollToTopToken?: number;
  /** 同 run 草稿内容更新时递增，静默刷新不重载骨架 */
  previewRefreshToken?: number;
  /** 持仓确认后递增，触发持仓面板刷新 */
  holdingsRefreshToken?: number;
  /** plan 确认后递增，触发当前配置刷新 */
  configRefreshToken?: number;
  onAnalyzeFund?: (fundCode: string, fundName: string) => void;
  /** 画像生成报告：ChatShell 接收结果并插入卡片 */
  onProfileGenerateReport?: (result: {
    ok: boolean;
    markdown?: string;
    report_name?: string;
    file_path?: string;
    error?: string;
  }) => void;
  /** 设置聊天输入框内容 */
  onSetInput?: (text: string) => void;
  /** 在聊天中发送消息 */
  onSendMessage?: (text: string) => void;
  /** 流是否活跃 */
  isStreamActive?: () => boolean;
}

export function ModeBReportPane({
  conversationId,
  activeTab,
  leftTab,
  previewTarget,
  scrollToTopToken = 0,
  previewRefreshToken = 0,
  holdingsRefreshToken = 0,
  configRefreshToken = 0,
  onAnalyzeFund,
  onProfileGenerateReport,
  onSetInput,
  onSendMessage,
  isStreamActive,
}: ModeBReportPaneProps) {
  const [markdown, setMarkdown] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("报告预览");
  const [validReportIds, setValidReportIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadedKeyRef = useRef("");
  const fetchGenRef = useRef(0);
  const lastScrollTokenRef = useRef(0);
  const previewTargetRef = useRef(previewTarget);
  previewTargetRef.current = previewTarget;
  const targetKey = previewTargetKey(previewTarget);

  useEffect(() => {
    if (leftTab !== "preview") {
      setLoading(false);
      return;
    }
    const target = previewTargetRef.current;
    if (!target?.run_id && !target?.file_path) {
      loadedKeyRef.current = "";
      setLoading(false);
      setMarkdown("");
      setError("当前无报告草稿可预览。");
      return;
    }

    const silentRefresh = loadedKeyRef.current === targetKey && targetKey !== "";
    const gen = ++fetchGenRef.current;

    if (!silentRefresh) {
      setLoading(true);
      setError(null);
    }

    void fetch(buildDraftPreviewUrl(conversationId, target))
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "无法加载报告草稿");
        }
        return r.json() as Promise<{
          markdown: string;
          valid_report_ids?: string[];
          report_name?: string;
        }>;
      })
      .then((data) => {
        if (fetchGenRef.current !== gen) return;
        loadedKeyRef.current = targetKey;
        setMarkdown(data.markdown ?? "");
        setValidReportIds(data.valid_report_ids ?? []);
        setDisplayName(data.report_name ?? target.report_name ?? "报告预览");
        setError(null);
      })
      .catch((e) => {
        if (fetchGenRef.current !== gen) return;
        setError(e instanceof Error ? e.message : "加载失败");
      })
      .finally(() => {
        if (fetchGenRef.current === gen) setLoading(false);
      });
  }, [conversationId, leftTab, targetKey, previewRefreshToken]);

  useEffect(() => {
    if (leftTab !== "preview" || loading || error) return;
    if (scrollToTopToken === lastScrollTokenRef.current) return;
    lastScrollTokenRef.current = scrollToTopToken;
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [scrollToTopToken, leftTab, loading, error]);

  if (leftTab === "watchlist" && activeTab === "fund") {
    return (
      <FundWatchlistPanel onAnalyze={onAnalyzeFund ?? (() => undefined)} />
    );
  }

  if (leftTab === "holdings" && activeTab === "portfolio") {
    return (
      <PortfolioHoldingsPanel
        embedded
        refreshToken={holdingsRefreshToken}
        onGenerateReport={() => onSendMessage?.("重新分析")}
      />
    );
  }

  if (leftTab === "profile_view" && activeTab === "profile") {
    return <ProfileViewPanel embedded refreshToken={holdingsRefreshToken} conversationId={conversationId} onGenerateReport={onProfileGenerateReport} onSendMessage={onSendMessage} />;
  }

  if (leftTab === "current_config" && activeTab === "plan") {
    return (
      <CurrentConfigPanel
        conversationId={conversationId}
        refreshToken={configRefreshToken}
        onSetInput={onSetInput}
        onSendMessage={onSendMessage}
        isStreamActive={isStreamActive}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-[#615d59] text-[15px]">
        正在加载报告预览…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-[#e03e3e] text-[15px]">{error}</div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-4 py-3 border-b border-[rgba(0,0,0,0.08)] bg-[#fafafa]">
        <h2 className="text-[17px] font-semibold m-0">
          {displayName}
        </h2>
        <p className="text-xs text-[#615d59] mt-1 mb-0">
          左侧为待确认草稿 · 修改请在右侧聊天说明
        </p>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <ReportMarkdownPreview
          markdown={markdown}
          linkPolicy="draft"
          validReportIds={validReportIds}
        />
      </div>
    </div>
  );
}

interface ModeBLeftTabsProps {
  activeTab: SceneId;
  leftTab: ModeBLeftTab;
  onChange: (tab: ModeBLeftTab) => void;
}

export function ModeBLeftTabs({
  activeTab,
  leftTab,
  onChange,
}: ModeBLeftTabsProps) {
  if (activeTab === "fund") {
    return (
      <div className="flex gap-2 px-4 pt-3 pb-2 border-b border-[rgba(0,0,0,0.06)]">
        {(
          [
            { id: "preview" as const, label: "报告预览" },
            { id: "watchlist" as const, label: "我的自选" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`rounded-full px-4 py-1.5 text-[14px] font-semibold border cursor-pointer ${
              leftTab === tab.id
                ? "bg-[#0075de] text-white border-[#0075de]"
                : "bg-white text-[#615d59] border-[rgba(0,0,0,0.1)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  if (activeTab === "portfolio") {
    return (
      <div className="flex gap-2 px-4 pt-3 pb-2 border-b border-[rgba(0,0,0,0.06)]">
        {(
          [
            { id: "preview" as const, label: "报告预览" },
            { id: "holdings" as const, label: "当前持仓" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`rounded-full px-4 py-1.5 text-[14px] font-semibold border cursor-pointer ${
              leftTab === tab.id
                ? "bg-[#0075de] text-white border-[#0075de]"
                : "bg-white text-[#615d59] border-[rgba(0,0,0,0.1)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  if (activeTab === "plan") {
    return (
      <div className="flex gap-2 px-4 pt-3 pb-2 border-b border-[rgba(0,0,0,0.06)]">
        {(
          [
            { id: "preview" as const, label: "报告预览" },
            { id: "current_config" as const, label: "当前配置" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`rounded-full px-4 py-1.5 text-[14px] font-semibold border cursor-pointer ${
              leftTab === tab.id
                ? "bg-[#0075de] text-white border-[#0075de]"
                : "bg-white text-[#615d59] border-[rgba(0,0,0,0.1)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  if (activeTab === "profile") {
    return (
      <div className="flex gap-2 px-4 pt-3 pb-2 border-b border-[rgba(0,0,0,0.06)]">
        {(
          [
            { id: "preview" as const, label: "报告预览" },
            { id: "profile_view" as const, label: "当前画像" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`rounded-full px-4 py-1.5 text-[14px] font-semibold border cursor-pointer ${
              leftTab === tab.id
                ? "bg-[#0075de] text-white border-[#0075de]"
                : "bg-white text-[#615d59] border-[rgba(0,0,0,0.1)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  return null;
}
