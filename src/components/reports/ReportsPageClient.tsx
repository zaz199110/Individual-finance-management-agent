"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTransientNotice } from "@/lib/ui/transient-notice";
import { ReportMarkdownPreview } from "@/components/reports/ReportMarkdownPreview";
import {
  pageBannerClasses,
  pageSectionClasses,
} from "@/components/layout/page-layout";
import { buildReportDeepLink } from "@/lib/reports/deep-link";
import { formatReportFilePathDisplay } from "@/lib/reports/display";
import { REPORT_TABS, type ReportListItem, type ReportTab } from "@/lib/reports/types";

const EMPTY_TAB_COPY: Record<
  ReportTab,
  { title: string; body: string }
> = {
  profile: {
    title: "还没有投资需求报告",
    body: "完成某一投资目标的需求梳理并确认发布报告后，会出现在这里。请先在「需求梳理」Tab 完成约束采集与报告确认发布。",
  },
  plan: {
    title: "还没有资产配置方案报告",
    body: "在资产配置场景生成方案并确认发布后，会出现在这里。",
  },
  portfolio: {
    title: "还没有持仓分析报告",
    body: "完成一次持仓分析并确认发布，或开启定时持仓分析后，会出现在这里。",
  },
  fund: {
    title: "还没有基金解读报告",
    body: "在基金解读场景生成报告并确认发布，或对自选基金使用「AI 解析」。",
  },
};

function formatGeneratedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function buildReportsQuery(params: {
  tab: ReportTab;
  id?: string | null;
  c?: string | null;
}): string {
  const q = new URLSearchParams();
  q.set("tab", params.tab);
  if (params.id) q.set("id", params.id);
  if (params.c) q.set("c", params.c);
  return `/reports?${q.toString()}`;
}

export function ReportsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") ?? "profile") as ReportTab;
  const selectedId = searchParams.get("id");
  const conversationId = searchParams.get("c");

  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [content, setContent] = useState<string>("");
  const [validReportIds, setValidReportIds] = useState<string[]>([]);
  const [filePath, setFilePath] = useState<string>("");
  const [fileExists, setFileExists] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [deletedConvBanner, setDeletedConvBanner] = useState(false);
  const { notice: toast, showNotice: showToast } = useTransientNotice();
  const [editHintShown, setEditHintShown] = useState(false);

  const reportsHref = buildReportsQuery({ tab, id: selectedId, c: conversationId });
  const searchEnabled = true;

  useEffect(() => {
    if (!conversationId) return;
    void fetch(`/api/conversations/${conversationId}?messages_limit=1`)
      .then((r) => {
        if (r.status === 404) setDeletedConvBanner(true);
      })
      .catch(() => {});
  }, [conversationId]);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setDbError(null);
    try {
      const q = searchEnabled && searchQuery.trim() ? `&q=${encodeURIComponent(searchQuery.trim())}` : "";
      const res = await fetch(`/api/reports?tab=${tab}${q}`);
      const data = await res.json();
      if (!res.ok) {
        setDbError(data.error ?? "加载报告列表失败。");
        setReports([]);
        return;
      }
      setReports(data.reports ?? data.items ?? []);
    } finally {
      setLoadingList(false);
    }
  }, [tab, searchQuery, searchEnabled]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadDetail = useCallback(
    async (id: string, opts?: { silentToast?: boolean }) => {
      setLoadingDetail(true);
      setError(null);
      try {
        const res = await fetch(`/api/reports/${id}?_t=${Date.now()}`);
        const data = await res.json();
        if (!res.ok || data.code === "ERR-RPT-NOT-FOUND") {
          showToast("找不到该报告");
          setError(data.error ?? "报告不存在。");
          setContent("");
          setFilePath("");
          setFileExists(false);
          return;
        }
        if (data.report_type && data.report_type !== tab) {
          router.replace(
            buildReportsQuery({
              tab: data.report_type as ReportTab,
              id,
              c: conversationId,
            }),
          );
          return;
        }
        setContent(data.content ?? data.markdown ?? "");
        setValidReportIds(data.valid_report_ids ?? []);
        setFilePath(data.file_path ?? "");
        setFileExists(data.file_exists !== false);
        if (!opts?.silentToast && data.file_exists === false) {
          setError(null);
        }
        if (!opts?.silentToast) {
          /* refresh toast handled by caller */
        }
      } finally {
        setLoadingDetail(false);
      }
    },
    [tab, conversationId, router, showToast],
  );

  useEffect(() => {
    if (!selectedId) {
      setContent("");
      setFilePath("");
      setFileExists(true);
      setError(null);
      return;
    }
    void loadDetail(selectedId, { silentToast: true });
  }, [selectedId, loadDetail]);

  function switchTab(nextTab: ReportTab) {
    setSearchQuery("");
    router.push(buildReportsQuery({ tab: nextTab, c: conversationId }));
  }

  function selectReport(id: string) {
    router.push(buildReportsQuery({ tab, id, c: conversationId }));
  }

  async function copyReportLink(report: ReportListItem) {
    const url = buildReportDeepLink({
      tab: report.report_type,
      reportId: report.id,
      conversationId,
    });
    try {
      await navigator.clipboard.writeText(url);
      showToast("链接已复制");
    } catch {
      showToast("复制失败，请手动复制地址栏链接");
    }
  }

  async function openReportsFolder() {
    const res = await fetch("/api/reports/actions/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_type: tab }),
    });
    const data = await res.json();
    if (res.status === 501) {
      showToast("当前环境无法打开本地文件夹");
      return;
    }
    if (!res.ok) {
      showToast(data.message ?? "打开文件夹失败");
      return;
    }
    showToast("文件夹已打开");
  }

  async function openReportEditor() {
    if (!selectedId) return;
    const res = await fetch(`/api/reports/${selectedId}/actions/open-file`, {
      method: "POST",
    });
    const data = await res.json();
    if (res.status === 501) {
      showToast("当前环境无法用系统编辑器打开文件");
      return;
    }
    if (res.status === 409) {
      showToast("报告文件不存在");
      return;
    }
    if (!res.ok) {
      showToast(data.message ?? "打开文件失败");
      return;
    }
    if (!editHintShown) {
      setEditHintShown(true);
      showToast("将用记事本打开本地文件，保存后请点刷新");
    }
  }

  async function refreshPreview() {
    if (!selectedId || !fileExists) return;
    await loadDetail(selectedId, { silentToast: true });
    showToast("已刷新");
  }

  async function refreshAll() {
    // listReports already syncs DB with local filesystem on every call,
    // so no separate repair step is needed.
    await loadList();
    if (selectedId) {
      await loadDetail(selectedId, { silentToast: true });
    }
    showToast("已刷新");
  }

  async function goFundScene() {
    const listRes = await fetch(
      "/api/conversations?limit=1&conversation_type=fund&type_locked=true",
    );
    const list = await listRes.json();
    const hit = list.conversations?.[0] as { id?: string } | undefined;
    if (hit?.id) {
      router.push(`/chat?c=${hit.id}`);
      return;
    }
    const createRes = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const created = (await createRes.json()) as { id?: string };
    if (created.id) {
      await fetch(`/api/conversations/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: { active_tab: "fund" } }),
      });
      router.push(`/chat?c=${created.id}`);
    }
  }

  const activeReport = reports.find((r) => r.id === selectedId);

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
      <header className={pageSectionClasses.header}>
        <h1 className="text-xl font-semibold m-0">我的报告</h1>
      </header>

        {deletedConvBanner && (
          <div className={pageSectionClasses.banner}>
            <div className={pageBannerClasses.warn}>
            <p className="font-semibold m-0 mb-1">无法返回原对话</p>
            <p className="m-0 text-[#615d59]">
              您离开时已打开的这条对话已被删除。您仍可在此查看报告；若要继续交流，请从侧栏新建或选择其它对话。
            </p>
            <button
              type="button"
              className="mt-2 text-[#0075de] font-semibold border-0 bg-transparent cursor-pointer p-0"
              onClick={() => setDeletedConvBanner(false)}
            >
              留在此页
            </button>
            </div>
          </div>
        )}

        {toast && (
          <div className={pageSectionClasses.banner}>
            <div className={pageBannerClasses.info}>
              {toast}
            </div>
          </div>
        )}

        {dbError && (
          <div className={pageSectionClasses.banner}>
            <div className={pageBannerClasses.error}>
              {dbError}
            </div>
          </div>
        )}

        <div className={pageSectionClasses.toolbar}>
          {REPORT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              className={`rounded-full px-4 py-1.5 text-[15px] font-semibold border cursor-pointer ${
                tab === t.id
                  ? "bg-[#0075de] text-white border-[#0075de]"
                  : "bg-white text-[#615d59] border-[rgba(0,0,0,0.1)]"
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            disabled={loadingList}
            onClick={() => void refreshAll()}
            className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            刷新
          </button>
          <button
            type="button"
            onClick={() => void openReportsFolder()}
            className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer ml-auto"
          >
            打开文件夹
          </button>
          {searchEnabled && (
            <input
              type="search"
              placeholder="搜索报告名称…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm w-[200px]"
            />
          )}
          {tab === "fund" && (
            <button
              type="button"
              onClick={() => void goFundScene()}
              className="rounded-lg bg-[#0075de] text-white px-3 py-1.5 text-sm font-semibold border-0 cursor-pointer"
            >
              解读新报告
            </button>
          )}
        </div>

        <div className="flex-1 flex min-h-0">
          <div className="w-[360px] shrink-0 border-r border-[rgba(0,0,0,0.1)] overflow-y-auto">
            {loadingList ? (
              <p className="p-4 text-[#615d59] text-sm">加载中…</p>
            ) : reports.length === 0 ? (
              <div className="p-4 text-sm">
                {searchQuery.trim() ? (
                  <p className="text-[#615d59] m-0">未找到匹配报告</p>
                ) : (
                  <>
                    <p className="font-semibold m-0 mb-2">{EMPTY_TAB_COPY[tab].title}</p>
                    <p className="text-[#615d59] m-0 leading-relaxed">{EMPTY_TAB_COPY[tab].body}</p>
                  </>
                )}
              </div>
            ) : (
                  <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-[#615d59] border-b border-[rgba(0,0,0,0.1)]">
                    <th className="p-2 font-semibold">报告名称</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-b border-[rgba(0,0,0,0.06)] ${
                        r.id === selectedId ? "bg-[#f6f5f4]" : ""
                      }`}
                    >
                      <td className="p-2 align-top">
                        <button
                          type="button"
                          onClick={() => selectReport(r.id)}
                          className="text-[15px] leading-snug font-medium text-left border-0 bg-transparent cursor-pointer p-0 hover:text-[#0075de]"
                        >
                          {r.report_name}
                        </button>
                        <div className="text-xs text-[#615d59] mt-1 flex items-center gap-2 flex-wrap">
                          {formatGeneratedAt(r.generated_at)}
                          {r.is_current && (
                            <span className="rounded bg-[#e8f4fd] text-[#0075de] px-1.5 py-0.5 font-semibold">
                              当前
                            </span>
                          )}
                          {r.trigger_source === "scheduled" && tab === "portfolio" && (
                            <span className="rounded bg-[#f0fdf4] text-[#16a34a] px-1.5 py-0.5 font-semibold">
                              定时生成
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div className={`${pageSectionClasses.panelToolbar} justify-between`}>
              <span className="text-sm text-[#615d59] truncate">
                {activeReport?.report_name ?? "选择左侧报告预览"}
              </span>
              {selectedId && (
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    disabled={!activeReport}
                    onClick={() => activeReport && void copyReportLink(activeReport)}
                    className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    复制链接
                  </button>
                  <button
                    type="button"
                    disabled={!fileExists}
                    onClick={() => void openReportEditor()}
                    className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    编辑
                  </button>
                  <Link
                    href={`/reports/view?tab=${tab}&id=${selectedId}${conversationId ? `&c=${conversationId}` : ""}`}
                    className="rounded-lg bg-[#0075de] text-white px-3 py-1.5 text-sm font-semibold"
                  >
                    全屏查看
                  </Link>
                </div>
              )}
            </div>

            {filePath && selectedId && (
              <div className="px-4 py-2 text-xs text-[#615d59] border-b border-[rgba(0,0,0,0.06)] truncate">
                {formatReportFilePathDisplay(filePath)}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6">
              {!selectedId && (
                <p className="text-[#615d59]">请从左侧列表选择一份报告。</p>
              )}
              {loadingDetail && selectedId && (
                <p className="text-[#615d59]">加载报告内容…</p>
              )}
              {selectedId && !loadingDetail && !fileExists && (
                <div className="rounded-lg border border-[#f59e0b] bg-[#fffbeb] px-4 py-4 text-sm max-w-lg">
                  <p className="font-semibold m-0 mb-2">报告文件不存在</p>
                  <p className="m-0 text-[#615d59] mb-3">
                    系统里有这条报告记录，但本地文件{" "}
                    <code className="text-xs">{formatReportFilePathDisplay(filePath)}</code>{" "}
                    已缺失或被移动。您可以用「打开文件夹」查看目录，或重新生成报告。
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => void openReportsFolder()}
                      className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer"
                    >
                      打开文件夹
                    </button>
                    {activeReport && (
                      <button
                        type="button"
                        onClick={() => void copyReportLink(activeReport)}
                        className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer"
                      >
                        复制链接
                      </button>
                    )}
                  </div>
                </div>
              )}
              {error && fileExists && <p className="text-[#e03e3e]">{error}</p>}
              {content && !loadingDetail && fileExists && (
                <ReportMarkdownPreview
                  markdown={content}
                  linkPolicy="published"
                  validReportIds={validReportIds}
                />
              )}
            </div>
          </div>
        </div>
    </div>
  );
}
