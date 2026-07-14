"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTransientNotice } from "@/lib/ui/transient-notice";
import { ReportMarkdownPreview } from "@/components/reports/ReportMarkdownPreview";
import {
  pageBannerClasses,
  pageSectionClasses,
} from "@/components/layout/page-layout";
import { formatReportFilePathDisplay } from "@/lib/reports/display";
import type { ReportTab } from "@/lib/reports/types";

export function ReportViewPageClient() {
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") ?? "profile") as ReportTab;
  const reportId = searchParams.get("id");
  const conversationId = searchParams.get("c");

  const [content, setContent] = useState("");
  const [reportName, setReportName] = useState("");
  const [filePath, setFilePath] = useState("");
  const [fileExists, setFileExists] = useState(true);
  const [validReportIds, setValidReportIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { notice: toast, showNotice: showToast } = useTransientNotice();
  const [editHintShown, setEditHintShown] = useState(false);

  const listHref = `/reports?tab=${tab}${reportId ? `&id=${reportId}` : ""}${conversationId ? `&c=${conversationId}` : ""}`;

  const loadReport = useCallback(async () => {
    if (!reportId) {
      setError("缺少报告 id。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}?_t=${Date.now()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "加载失败");
        return;
      }
      setContent(data.content ?? data.markdown ?? "");
      setReportName(data.report_name ?? "");
      setFilePath(data.file_path ?? "");
      setFileExists(data.file_exists !== false);
      setValidReportIds(data.valid_report_ids ?? []);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  async function openReportEditor() {
    if (!reportId) return;
    const res = await fetch(`/api/reports/${reportId}/actions/open-file`, {
      method: "POST",
    });
    if (res.status === 501) {
      showToast("当前环境无法用系统编辑器打开文件");
      return;
    }
    if (res.status === 409) {
      showToast("报告文件不存在");
      return;
    }
    if (!res.ok) {
      const data = await res.json();
      showToast(data.message ?? "打开文件失败");
      return;
    }
    if (!editHintShown) {
      setEditHintShown(true);
      showToast("将用记事本打开本地文件，保存后请点刷新");
    }
  }

  async function refreshPreview() {
    if (!fileExists) return;
    await loadReport();
    showToast("已刷新");
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
      <header className={pageSectionClasses.header}>
          <Link href={listHref} className="text-[15px] font-semibold text-[#0075de]">
            ← 返回列表
          </Link>
          <h1 className="text-lg font-semibold m-0 truncate flex-1">
            {reportName || "报告全屏阅读"}
          </h1>
          {reportId && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!fileExists}
                onClick={() => void openReportEditor()}
                className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer disabled:opacity-50"
              >
                编辑
              </button>
              <button
                type="button"
                disabled={!fileExists}
                onClick={() => void refreshPreview()}
                className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer disabled:opacity-50"
              >
                刷新
              </button>
            </div>
          )}
        </header>

        {toast && (
          <div className={pageSectionClasses.banner}>
            <div className={pageBannerClasses.info}>{toast}</div>
          </div>
        )}

        {filePath && (
          <div className={`${pageSectionClasses.subheader} truncate`}>
            {formatReportFilePathDisplay(filePath)}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full">
          {loading && <p className="text-[#615d59]">加载中…</p>}
          {error && fileExists && <p className="text-[#e03e3e]">{error}</p>}
          {!loading && !fileExists && (
            <div className="rounded-lg border border-[#f59e0b] bg-[#fffbeb] px-4 py-4 text-sm">
              <p className="font-semibold m-0 mb-2">报告文件不存在</p>
              <p className="m-0 text-[#615d59]">
                本地文件{" "}
                <code className="text-xs">{formatReportFilePathDisplay(filePath)}</code>{" "}
                已缺失或被移动。
              </p>
            </div>
          )}
          {content && !loading && fileExists && (
            <ReportMarkdownPreview
              markdown={content}
              linkPolicy="published"
              validReportIds={validReportIds}
            />
          )}
        </div>
    </div>
  );
}
