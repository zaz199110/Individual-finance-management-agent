"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTransientNotice } from "@/lib/ui/transient-notice";
import { parseFundCodeFromVaultRelPath } from "@/lib/fund-knowledge/vault-dir";
import { FundKnowledgeLinePreview } from "@/components/fund-knowledge/FundKnowledgeLinePreview";
import {
  pageBannerClasses,
  pageSectionClasses,
} from "@/components/layout/page-layout";

type IndexStatus = "synced" | "pending_refresh" | "index_failed";

interface TreeFile {
  path: string;
  filename: string;
  index_status: IndexStatus;
  chunk_count: number;
}

interface TreeDocType {
  doc_type: string;
  label_zh: string;
  files: TreeFile[];
}

interface TreeFund {
  fund_code: string;
  fund_name: string;
  vault_dir: string;
  doc_types: TreeDocType[];
}

interface ChunkItem {
  chunk_id: string;
  heading: string;
  line_start: number;
  line_end: number;
  content: string;
}

const STATUS_LABEL: Record<IndexStatus, string> = {
  synced: "🟢 已索引",
  pending_refresh: "🟠 待刷新",
  index_failed: "🔴 索引失败",
};

const DOC_TYPES = [
  { id: "prospectus", label: "招募说明书" },
  { id: "quarterly_report", label: "季报" },
  { id: "semiannual_report", label: "半年报" },
  { id: "annual_report", label: "年报" },
  { id: "expert_opinion", label: "专家观点" },
  { id: "other", label: "其他" },
];

const LOG_TYPE_LABEL: Record<string, string> = {
  upload: "上传材料",
  refresh_reindex: "刷新并同步索引",
  manual_reindex: "更新搜索索引",
  chunk_delete: "删除文档块",
  document_delete: "删除文档",
};

const LOG_STATUS_STYLE: Record<string, { label: string; className: string }> = {
  success: { label: "成功", className: "bg-[#ecfdf5] text-[#047857]" },
  partial: { label: "部分成功", className: "bg-[#fffbeb] text-[#b45309]" },
  failed: { label: "失败", className: "bg-[#fef2f2] text-[#b91c1c]" },
};

function buildFkQuery(params: {
  c?: string | null;
  fund?: string | null;
  path?: string | null;
  line?: string | null;
}): string {
  const q = new URLSearchParams();
  if (params.c) q.set("c", params.c);
  if (params.fund) q.set("fund", params.fund);
  if (params.path) q.set("path", params.path);
  if (params.line) q.set("line", params.line);
  const s = q.toString();
  return s ? `/fund-knowledge?${s}` : "/fund-knowledge";
}

function formatLogTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function basename(path: string | null | undefined): string | null {
  if (!path) return null;
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? path;
}

function describeLogAction(item: Record<string, unknown>): string {
  const type = String(item.type ?? "");
  const fundCode = item.fund_code ? String(item.fund_code) : null;
  const filePath = item.file_path ? String(item.file_path) : null;
  const fileName = basename(filePath);
  const docType = item.doc_type ? String(item.doc_type) : null;
  const docLabel = docType
    ? DOC_TYPES.find((d) => d.id === docType)?.label ?? docType
    : null;

  switch (type) {
    case "manual_reindex":
      return fundCode ? `重建基金 ${fundCode} 的搜索索引` : "重建全部基金的搜索索引";
    case "refresh_reindex":
      return fileName
        ? `刷新「${fileName}」并同步索引${docLabel ? `（${docLabel}）` : ""}`
        : "刷新文档并同步索引";
    case "upload":
      return fileName
        ? `上传「${fileName}」${docLabel ? `至${docLabel}` : ""}${fundCode ? ` · ${fundCode}` : ""}`
        : fundCode
          ? `上传材料至基金 ${fundCode}`
          : "上传新材料";
    case "chunk_delete":
      return fileName ? `删除「${fileName}」中的选中文档块` : "删除选中的文档块";
    case "document_delete":
      return fileName
        ? `删除文档「${fileName}」${docLabel ? `（${docLabel}）` : ""}`
        : "删除选中的文档";
    default:
      return LOG_TYPE_LABEL[type] ?? type;
  }
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`bg-white rounded-2xl w-full shadow-xl max-h-[85vh] flex flex-col overflow-hidden ${
          wide ? "max-w-2xl" : "max-w-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fk-modal-title"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-[rgba(0,0,0,0.08)] shrink-0">
          <div>
            <h2 id="fk-modal-title" className="text-lg font-semibold m-0 text-[rgba(0,0,0,0.9)]">
              {title}
            </h2>
            {subtitle && <p className="text-sm text-[#615d59] mt-1 mb-0">{subtitle}</p>}
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-lg border border-[rgba(0,0,0,0.1)] bg-white text-[#615d59] cursor-pointer hover:bg-[#f6f5f4] text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

function TreeChevron({ expanded }: { expanded: boolean }) {
  return (
    <span
      className={`inline-flex w-4 h-4 shrink-0 items-center justify-center text-[10px] text-[#615d59] transition-transform duration-150 ${
        expanded ? "rotate-90" : ""
      }`}
      aria-hidden
    >
      ▶
    </span>
  );
}

export function FundKnowledgePageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("c");
  const deepFund = searchParams.get("fund");
  const deepPath = searchParams.get("path");
  const deepLine = searchParams.get("line");

  const [meta, setMeta] = useState<{
    vault_root: string;
    index_db_path: string;
  } | null>(null);
  const [funds, setFunds] = useState<TreeFund[]>([]);
  const [summary, setSummary] = useState<{ fund_count: number; file_count: number; chunk_count: number } | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(deepPath);
  const [markdown, setMarkdown] = useState("");
  const [chunks, setChunks] = useState<ChunkItem[]>([]);
  const [selectedChunks, setSelectedChunks] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [previewMode, setPreviewMode] = useState<"document" | "chunk">("document");
  const [focusedChunkId, setFocusedChunkId] = useState<string | null>(null);
  const [expandedFunds, setExpandedFunds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const { notice: toast, showNotice: showToast, clearNotice: clearToast } =
    useTransientNotice();
  const [showHelp, setShowHelp] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showIndex, setShowIndex] = useState(false);
  const [logItems, setLogItems] = useState<Array<Record<string, unknown>>>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logOffset, setLogOffset] = useState(0);
  const [logFilterFund, setLogFilterFund] = useState("");
  const [logFilterType, setLogFilterType] = useState("");
  const [logLoadingMore, setLogLoadingMore] = useState(false);
  const [uploadFund, setUploadFund] = useState(deepFund ?? "019305");
  const [uploadDocType, setUploadDocType] = useState("prospectus");
  const [indexScope, setIndexScope] = useState<"all" | "fund">("all");
  const [indexFund, setIndexFund] = useState(deepFund ?? "019305");
  const previewRef = useRef<HTMLDivElement>(null);


  const loadTree = useCallback(async () => {
    setLoading(true);
    try {
      const [metaRes, driftRes] = await Promise.all([
        fetch("/api/fund-knowledge/meta"),
        fetch("/api/fund-knowledge/drift-scan"),
      ]);
      const metaData = await metaRes.json();
      const driftData = await driftRes.json();
      setMeta(metaData);
      setFunds(driftData.tree?.funds ?? []);
      setSummary(driftData.tree?.summary ?? null);
      const fundList: TreeFund[] = driftData.tree?.funds ?? [];
      if (deepFund) {
        setExpandedFunds(new Set([deepFund]));
      } else if (fundList.length > 0 && fundList.length <= 4) {
        setExpandedFunds(new Set(fundList.map((f) => f.fund_code)));
      }
    } finally {
      setLoading(false);
    }
  }, [deepFund]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const loadFile = useCallback(async (path: string, refresh = false) => {
    const url = `/api/fund-knowledge/file?path=${encodeURIComponent(path)}${refresh ? "&refresh=1" : ""}&_t=${Date.now()}`;
    const fileRes = await fetch(url);
    const fileData = await fileRes.json();
    if (!fileData.file_exists) {
      setMarkdown("");
      showToast("文件不存在或已被删除。");
      return;
    }
    setMarkdown(fileData.markdown ?? "");
    const chunkRes = await fetch(`/api/fund-knowledge/chunks?path=${encodeURIComponent(path)}`);
    const chunkData = await chunkRes.json();
    setChunks(chunkData.chunks ?? []);
    setSelectedChunks(new Set());
    setPreviewMode("document");
    setFocusedChunkId(null);
    if (refresh) {
      showToast("已刷新文件并尝试同步索引。");
      void loadTree();
    }
  }, [loadTree]);

  useEffect(() => {
    if (deepPath) {
      setSelectedPath(deepPath);
      void loadFile(deepPath);
    }
  }, [deepPath, loadFile]);

  useEffect(() => {
    if (!deepLine || !chunks.length) return;
    const line = Number(deepLine);
    if (!Number.isFinite(line)) return;
    const chunk = chunks.find((c) => line >= c.line_start && line <= c.line_end);
    if (chunk) {
      setPreviewMode("chunk");
      setFocusedChunkId(chunk.chunk_id);
    }
  }, [deepLine, chunks]);

  useEffect(() => {
    if (!deepLine || !previewRef.current) return;
    const line = Number(deepLine);
    if (!Number.isFinite(line)) return;
    const el = previewRef.current.querySelector(`[data-line="${line}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      previewRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [deepLine, markdown]);

  function selectFile(fundCode: string, path: string) {
    setSelectedPath(path);
    setPreviewMode("document");
    setFocusedChunkId(null);
    router.push(buildFkQuery({ c: conversationId, fund: fundCode, path }));
    void loadFile(path);
  }

  function viewFullDocument() {
    if (!selectedPath) return;
    setPreviewMode("document");
    setFocusedChunkId(null);
    const fundCode = parseFundCodeFromVaultRelPath(selectedPath);
    router.push(buildFkQuery({ c: conversationId, fund: fundCode, path: selectedPath }));
  }

  function focusChunk(chunk: ChunkItem) {
    if (!selectedPath) return;
    setPreviewMode("chunk");
    setFocusedChunkId(chunk.chunk_id);
    const fundCode = parseFundCodeFromVaultRelPath(selectedPath);
    router.push(
      buildFkQuery({
        c: conversationId,
        fund: fundCode,
        path: selectedPath,
        line: String(chunk.line_start),
      }),
    );
  }

  function toggleFile(path: string) {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggleChunk(id: string) {
    setSelectedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function deleteSelectedChunks() {
    if (!selectedPath || !selectedChunks.size) return;
    if (!confirm(`确定删除 ${selectedChunks.size} 个块？此操作会修改 md 源文件。`)) return;
    const res = await fetch("/api/fund-knowledge/chunks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: selectedPath,
        chunk_ids: [...selectedChunks],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.code ?? "删除失败");
      return;
    }
    showToast(`已删除 ${data.deleted_chunk_ids?.length ?? 0} 个块。`);
    setFocusedChunkId(null);
    setPreviewMode("document");
    void loadFile(selectedPath, true);
  }

  async function deleteSelectedFiles() {
    if (!selectedFiles.size) return;
    if (!confirm(`确定删除 ${selectedFiles.size} 份文档？将同时移除磁盘文件与搜索索引。`)) return;
    const res = await fetch("/api/fund-knowledge/file", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: [...selectedFiles] }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.code ?? "删除失败");
      return;
    }
    const deleted = (data.deleted_paths as string[] | undefined) ?? [];
    showToast(`已删除 ${deleted.length} 份文档。`);
    setSelectedFiles(new Set());
    if (selectedPath && deleted.includes(selectedPath)) {
      setSelectedPath(null);
      setMarkdown("");
      setChunks([]);
      setPreviewMode("document");
      setFocusedChunkId(null);
    }
    void loadTree();
  }

  async function runIndex() {
    const body =
      indexScope === "fund"
        ? { scope: "fund", fund_code: indexFund }
        : { scope: "all" };
    const res = await fetch("/api/fund-knowledge/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.code ?? "索引失败");
      return;
    }
    showToast(`扫描 ${data.scanned} 个文件，重建 ${data.rebuilt} 个，跳过 ${data.skipped} 个。`);
    setShowIndex(false);
    void loadTree();
    if (selectedPath) void loadFile(selectedPath);
  }

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("fund_code", uploadFund);
    fd.set("doc_type", uploadDocType);
    const res = await fetch("/api/fund-knowledge/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.code ?? "上传失败");
      return;
    }
    const nameHint =
      data.fund_name && data.fund_name_source_label
        ? `；目录名：${uploadFund} ${data.fund_name}（${data.fund_name_source_label}）`
        : data.fund_name_source_label === "兜底规则"
          ? "；未识别基金简称，已用兜底目录名"
          : "";
    showToast(
      `上传完成：成功 ${data.summary?.success ?? 0}，失败 ${data.summary?.failed ?? 0}，跳过 ${data.summary?.skipped_unchanged ?? 0}${nameHint}。`,
    );
    setShowUpload(false);
    void loadTree();
    const first = data.results?.find((r: { md_path?: string }) => r.md_path);
    if (first?.md_path) {
      selectFile(uploadFund, first.md_path);
    }
  }

  const LOG_PAGE_SIZE = 30;

  async function fetchLogPage(offset: number, fund?: string, type?: string) {
    setLogLoadingMore(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(LOG_PAGE_SIZE));
      params.set("offset", String(offset));
      if (fund) params.set("fund_code", fund);
      if (type) params.set("type", type);
      const res = await fetch(`/api/fund-knowledge/maintenance-log?${params}`);
      const data = await res.json();
      if (offset === 0) {
        setLogItems(data.items ?? []);
      } else {
        setLogItems((prev) => [...prev, ...(data.items ?? [])]);
      }
      setLogTotal(data.total ?? 0);
      setSummary(data.summary ?? summary);
    } catch {
      showToast("加载维护日志失败");
    } finally {
      setLogLoadingMore(false);
    }
  }

  async function openMaintenanceLog() {
    setShowLog(true);
    setLogOffset(0);
    setLogFilterFund("");
    setLogFilterType("");
    await fetchLogPage(0);
  }

  async function loadMoreLogs() {
    const nextOffset = logOffset + LOG_PAGE_SIZE;
    setLogOffset(nextOffset);
    await fetchLogPage(nextOffset, logFilterFund, logFilterType);
  }

  async function applyLogFilters() {
    setLogOffset(0);
    await fetchLogPage(0, logFilterFund, logFilterType);
  }

  async function trimOldLogs() {
    if (!window.confirm("确认清理 90 天前的维护日志吗？此操作不可撤回。")) return;
    try {
      const params = new URLSearchParams();
      params.set("older_than_days", "90");
      const res = await fetch(`/api/fund-knowledge/maintenance-log?${params}`, {
        method: "DELETE",
      });
      const data = await res.json();
      showToast(`已清理 ${data.deleted_count ?? 0} 条旧日志`);
      setLogOffset(0);
      await fetchLogPage(0, logFilterFund, logFilterType);
    } catch {
      showToast("清理日志失败");
    }
  }

  async function openVaultFolder() {
    const res = await fetch("/api/fund-knowledge/actions/open-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target: "vault_root" }),
    });
    if (res.status === 501) {
      showToast("当前环境无法打开本地文件夹");
      return;
    }
    if (!res.ok) {
      const data = await res.json();
      showToast(data.message ?? "打开文件夹失败");
      return;
    }
    showToast("文件夹已打开");
  }

  async function openFileEditor() {
    if (!selectedPath) return;
    const res = await fetch("/api/fund-knowledge/actions/open-file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: selectedPath }),
    });
    if (res.status === 501) {
      showToast("当前环境无法用系统编辑器打开文件");
      return;
    }
    if (!res.ok) {
      const data = await res.json();
      showToast(data.message ?? "打开文件失败");
      return;
    }
    showToast("将用记事本打开本地文件，保存后请点刷新");
  }

  const activeFund = useMemo(() => {
    if (!selectedPath) return deepFund;
    return parseFundCodeFromVaultRelPath(selectedPath) || null;
  }, [selectedPath, deepFund]);

  const focusedChunk = useMemo(
    () => chunks.find((c) => c.chunk_id === focusedChunkId) ?? null,
    [chunks, focusedChunkId],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
      <header className={pageSectionClasses.header}>
        <h1 className="text-xl font-semibold m-0">基金知识库</h1>
          <div className="flex-1" />
          <button
            type="button"
            className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer"
            onClick={() => setShowHelp(true)}
          >
            文档结构说明
          </button>
          <button
            type="button"
            className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer"
            onClick={() => void openMaintenanceLog()}
          >
            维护日志
          </button>
          <button
            type="button"
            className="rounded-lg bg-[#0075de] text-white px-3 py-1.5 text-sm font-semibold border-0 cursor-pointer"
            onClick={() => setShowUpload(true)}
          >
            上传
          </button>
        </header>

        {meta && (
          <div className="px-6 py-3 text-xs text-[#615d59] border-b border-[rgba(0,0,0,0.1)] flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="font-semibold text-[rgba(0,0,0,0.78)] shrink-0">源文件目录</span>
              <code className="font-mono text-[11px] bg-[#f6f5f4] px-2 py-1 rounded break-all">
                {meta.vault_root}
              </code>
              <button
                type="button"
                onClick={() => void openVaultFolder()}
                className="rounded-lg border border-[#0075de] text-[#0075de] px-2.5 py-1 text-xs font-semibold bg-white cursor-pointer hover:bg-[#e8f4fd] shrink-0"
              >
                打开文件夹
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 justify-between">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 min-w-0">
                <span className="font-semibold text-[rgba(0,0,0,0.78)] shrink-0">搜索索引</span>
                <code className="font-mono text-[11px] bg-[#f6f5f4] px-2 py-1 rounded break-all">
                  {meta.index_db_path}
                </code>
                <span className="text-[#9ca3af] shrink-0">只读 · 请勿手动修改</span>
              </div>
              {summary && (
                <span className="text-[rgba(0,0,0,0.65)] font-medium shrink-0">
                  {summary.fund_count} 只基金 · {summary.file_count} 份文档 · {summary.chunk_count} 个块
                </span>
              )}
            </div>
          </div>
        )}

        {toast && (
          <div className={pageSectionClasses.banner}>
            <div className={`${pageBannerClasses.info} flex justify-between`}>
            <span>{toast}</span>
            <button type="button" className="border-0 bg-transparent cursor-pointer font-semibold" onClick={clearToast}>
              关闭
            </button>
            </div>
          </div>
        )}

        <div className="flex-1 flex min-h-0">
          <div className="w-[280px] shrink-0 border-r border-[rgba(0,0,0,0.1)] overflow-y-auto p-2">
            <p className="text-xs font-semibold text-[#615d59] px-2 py-1">源文档树</p>
            {loading ? (
              <p className="text-sm text-[#615d59] px-2">加载中…</p>
            ) : funds.length === 0 ? (
              <p className="text-sm text-[#615d59] px-2">暂无 vault 目录，请上传材料。</p>
            ) : (
              funds.map((fund) => {
                const expanded = expandedFunds.has(fund.fund_code);
                return (
                <div key={fund.fund_code} className="mb-1">
                  <button
                    type="button"
                    className={`w-full text-left px-2 py-2 rounded-lg border cursor-pointer text-sm flex items-start gap-1.5 transition-colors ${
                      expanded
                        ? "bg-[#e8f4fd] border-[#0075de]/25 font-semibold text-[rgba(0,0,0,0.9)]"
                        : "bg-transparent border-transparent hover:bg-[#f6f5f4] font-semibold text-[rgba(0,0,0,0.85)]"
                    }`}
                    aria-expanded={expanded}
                    onClick={() =>
                      setExpandedFunds((prev) => {
                        const next = new Set(prev);
                        if (next.has(fund.fund_code)) next.delete(fund.fund_code);
                        else next.add(fund.fund_code);
                        return next;
                      })
                    }
                  >
                    <TreeChevron expanded={expanded} />
                    <span className="min-w-0">
                      <span className="text-[#0075de]">{fund.fund_code}</span>{" "}
                      {fund.fund_name}
                    </span>
                  </button>
                  {expanded && (
                    <div className="ml-3 pl-2 border-l-2 border-[#0075de]/20 mt-0.5">
                    {fund.doc_types.map((dt) => (
                      <div key={dt.doc_type} className="pl-1 mb-1">
                        <div className="text-xs font-semibold text-[#615d59] py-1.5 px-1">
                          {dt.label_zh}
                          {dt.files.length > 0 && (
                            <span className="font-normal text-[#9ca3af] ml-1">({dt.files.length})</span>
                          )}
                        </div>
                        {dt.files.length === 0 ? (
                          <div className="text-xs text-[#9ca3af] pl-2 pb-1 italic">暂无文档</div>
                        ) : (
                          dt.files.map((file) => (
                            <div
                              key={file.path}
                              className={`flex items-start gap-1.5 rounded-lg px-1 py-0.5 mb-0.5 ${
                                selectedPath === file.path && previewMode === "document"
                                  ? "bg-white border border-[#0075de]/30 shadow-sm"
                                  : "border border-transparent"
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-1.5 shrink-0 cursor-pointer"
                                checked={selectedFiles.has(file.path)}
                                onChange={() => toggleFile(file.path)}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`选择文档 ${file.filename}`}
                              />
                              <button
                                type="button"
                                onClick={() => selectFile(fund.fund_code, file.path)}
                                className="flex-1 min-w-0 text-left rounded px-1 py-1 text-xs border-0 cursor-pointer bg-transparent hover:bg-[#f6f5f4] transition-colors"
                              >
                                <div className="truncate font-medium">{file.filename}</div>
                                <div className="text-[10px] text-[#615d59] mt-0.5">
                                  {STATUS_LABEL[file.index_status]} · {file.chunk_count} 块
                                </div>
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    ))}
                    </div>
                  )}
                </div>
              );
              })
            )}
          </div>

          <div className="w-[240px] shrink-0 border-r border-[rgba(0,0,0,0.1)] overflow-y-auto p-2">
            <p className="text-xs font-semibold text-[#615d59] px-2 py-1">块目录</p>
            {!selectedPath ? (
              <p className="text-sm text-[#615d59] px-2">选择左侧 md 文件。</p>
            ) : chunks.length === 0 ? (
              <p className="text-sm text-[#615d59] px-2">暂无块索引。</p>
            ) : (
              <ul className="list-none m-0 p-0 space-y-1">
                <li>
                  <button
                    type="button"
                    onClick={() => viewFullDocument()}
                    className={`w-full text-left px-2 py-2 rounded-lg text-xs border cursor-pointer mb-1 transition-colors ${
                      previewMode === "document"
                        ? "bg-[#e8f4fd] border-[#0075de]/25 font-semibold text-[#0075de]"
                        : "bg-transparent border-transparent hover:bg-[#f6f5f4] text-[rgba(0,0,0,0.85)]"
                    }`}
                  >
                    📄 整篇文档
                  </button>
                </li>
                {chunks.map((c) => (
                  <li key={c.chunk_id}>
                    <div
                      className={`flex gap-2 items-start px-2 py-1.5 rounded-lg transition-colors ${
                        previewMode === "chunk" && focusedChunkId === c.chunk_id
                          ? "bg-[#e8f4fd] ring-1 ring-[#0075de]/20"
                          : "hover:bg-[#f6f5f4]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0 cursor-pointer"
                        checked={selectedChunks.has(c.chunk_id)}
                        onChange={() => toggleChunk(c.chunk_id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`选择块 ${c.heading}`}
                      />
                      <button
                        type="button"
                        onClick={() => focusChunk(c)}
                        className="flex-1 min-w-0 text-left border-0 bg-transparent cursor-pointer p-0 text-xs"
                      >
                        <span className="font-medium text-[rgba(0,0,0,0.88)] block truncate">
                          {c.heading}
                        </span>
                        <span className="font-mono text-[10px] text-[#9ca3af] block truncate mt-0.5">
                          {c.chunk_id}
                        </span>
                        <span className="text-[10px] text-[#615d59]">L{c.line_start}–{c.line_end}</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div className={pageSectionClasses.panelToolbar}>
              <div className="truncate flex-1 min-w-0">
                <div className="text-sm text-[rgba(0,0,0,0.85)] truncate">
                  {selectedPath ?? "Preview"}
                </div>
                {selectedPath && (
                  <div className="text-xs text-[#615d59] mt-0.5">
                    {previewMode === "chunk" && focusedChunk ? (
                      <>
                        查看块：<strong>{focusedChunk.heading}</strong>
                        <button
                          type="button"
                          className="ml-2 text-[#0075de] border-0 bg-transparent cursor-pointer p-0 font-semibold"
                          onClick={() => viewFullDocument()}
                        >
                          看整篇
                        </button>
                      </>
                    ) : (
                      "查看整篇文档"
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={!selectedPath}
                onClick={() => void openFileEditor()}
                className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer disabled:opacity-50"
              >
                编辑
              </button>
              <button
                type="button"
                disabled={!selectedPath}
                className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer disabled:opacity-50"
                onClick={() => selectedPath && void loadFile(selectedPath, true)}
              >
                刷新
              </button>
              <button
                type="button"
                disabled={!selectedFiles.size}
                className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer disabled:opacity-50"
                onClick={() => void deleteSelectedFiles()}
              >
                删除选中文档
              </button>
              <button
                type="button"
                disabled={!selectedChunks.size}
                className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer disabled:opacity-50"
                onClick={() => void deleteSelectedChunks()}
              >
                删除选中块
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#0075de] text-white px-3 py-1.5 text-sm font-semibold border-0 cursor-pointer"
                onClick={() => {
                  if (activeFund) setIndexFund(activeFund);
                  setShowIndex(true);
                }}
              >
                更新搜索索引
              </button>
            </div>

            <div ref={previewRef} className="flex-1 overflow-y-auto p-6">
              {previewMode === "chunk" && focusedChunk && (
                <div className="mb-4 rounded-xl border border-[#0075de]/20 bg-[#e8f4fd] px-4 py-3 text-sm">
                  <p className="m-0 font-semibold text-[#0075de]">块预览 · {focusedChunk.heading}</p>
                  <p className="m-0 mt-1 text-xs text-[#615d59] font-mono">{focusedChunk.chunk_id}</p>
                  <p className="m-0 mt-1 text-xs text-[#615d59]">
                    源文件第 {focusedChunk.line_start}–{focusedChunk.line_end} 行 · 编辑/刷新仍作用于整篇 md
                  </p>
                </div>
              )}
              {deepLine && previewMode === "document" && (
                <p className="text-sm text-[#0075de] mb-4 font-semibold">
                  深链定位：第 {deepLine} 行附近
                </p>
              )}
              {!selectedPath && <p className="text-[#615d59]">选择文档以预览 Markdown。</p>}
              {selectedPath && markdown && (
                <FundKnowledgeLinePreview
                  markdown={
                    previewMode === "chunk" && focusedChunk?.content
                      ? focusedChunk.content
                      : markdown
                  }
                  highlightLine={
                    previewMode === "document" && deepLine ? Number(deepLine) : null
                  }
                  highlightRange={
                    previewMode === "document" && focusedChunk
                      ? { start: focusedChunk.line_start, end: focusedChunk.line_end }
                      : null
                  }
                />
              )}
            </div>
          </div>
        </div>

      {showHelp && (
        <ModalShell title="文档结构说明" subtitle="了解知识库如何存放基金材料" onClose={() => setShowHelp(false)} wide>
          <p className="text-sm text-[rgba(0,0,0,0.78)] leading-relaxed mt-0 mb-5">
            知识库用于存放基金的公开披露材料与解读资料。AI 解读报告时，可引用这里的原文并支持一键跳转到对应段落。
          </p>

          <div className="space-y-4">
            <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#fafafa] p-4">
              <h3 className="text-sm font-semibold m-0 mb-2 text-[rgba(0,0,0,0.88)]">📁 每只基金一个文件夹</h3>
              <p className="text-sm text-[#615d59] m-0 leading-relaxed">
                以基金代码命名，例如 <strong>019305-摩根标普500…</strong>。文件夹内按材料类型分子目录，便于查找与管理。
              </p>
            </section>

            <section className="rounded-xl border border-[rgba(0,0,0,0.08)] p-4">
              <h3 className="text-sm font-semibold m-0 mb-3 text-[rgba(0,0,0,0.88)]">📄 六类材料目录</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {DOC_TYPES.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[#f6f5f4]">
                    <span className="font-medium text-[rgba(0,0,0,0.85)]">{d.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#9ca3af] mt-3 mb-0">
                典型材料：招募说明书、季度/半年/年度报告、专家观点、其他公告等。
              </p>
            </section>

            <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-[#fafafa] p-4">
              <h3 className="text-sm font-semibold m-0 mb-2 text-[rgba(0,0,0,0.88)]">📥 上传后会发生什么</h3>
              <ul className="text-sm text-[#615d59] m-0 pl-4 space-y-1.5 leading-relaxed">
                <li>原始文件保存在 <code className="text-xs bg-white px-1 rounded">raw/</code> 子目录</li>
                <li>正文转为 Markdown，与原件同目录存放，便于阅读与检索</li>
                <li>系统按章节切分为「块」，报告脚注可点回原文对应位置</li>
              </ul>
            </section>

            <section className="rounded-xl border border-[rgba(0,0,0,0.08)] p-4">
              <h3 className="text-sm font-semibold m-0 mb-2 text-[rgba(0,0,0,0.88)]">🔍 搜索索引与维护</h3>
              <ul className="text-sm text-[#615d59] m-0 pl-4 space-y-1.5 leading-relaxed">
                <li>搜索索引保存在本地数据库，<strong>请勿手动修改</strong></li>
                <li>编辑 Markdown 后，请点「刷新」或「更新搜索索引」同步变更</li>
                <li>可用记事本编辑源文件，或在块目录中多选删除不需要的段落</li>
              </ul>
            </section>

            <section className="rounded-xl border border-[#0075de]/20 bg-[#e8f4fd] p-4">
              <h3 className="text-sm font-semibold m-0 mb-1 text-[#0075de]">💡 与「自选」的区别</h3>
              <p className="text-sm text-[#615d59] m-0 leading-relaxed">
                知识库管理的是<strong>基金材料</strong>；「我的自选」管理的是<strong>您常看的基金列表</strong>。两者相互独立，不必先加自选才能上传材料。
              </p>
            </section>
          </div>

          <button
            type="button"
            className="mt-6 w-full rounded-xl bg-[#0075de] text-white py-2.5 border-0 cursor-pointer font-semibold text-sm hover:bg-[#0066c4]"
            onClick={() => setShowHelp(false)}
          >
            知道了
          </button>
        </ModalShell>
      )}

      {showIndex && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold mt-0">更新搜索索引</h2>
            <div className="space-y-3 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={indexScope === "all"} onChange={() => setIndexScope("all")} />
                全局（全部基金）
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={indexScope === "fund"} onChange={() => setIndexScope("fund")} />
                单只基金
              </label>
              {indexScope === "fund" && (
                <input
                  className="w-full border rounded px-3 py-2"
                  value={indexFund}
                  onChange={(e) => setIndexFund(e.target.value)}
                  placeholder="6 位基金代码"
                />
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" className="flex-1 rounded-lg bg-[#0075de] text-white py-2 border-0 cursor-pointer" onClick={() => void runIndex()}>
                开始重建
              </button>
              <button type="button" className="flex-1 rounded-lg border py-2 cursor-pointer" onClick={() => setShowIndex(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpload && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <form className="bg-white rounded-xl max-w-md w-full p-6" onSubmit={(e) => void handleUpload(e)}>
            <h2 className="text-lg font-semibold mt-0">上传材料</h2>
            <p className="text-xs text-[#615d59]">
              支持 PDF / Word / MD / TXT / Excel·CSV / 图片（PNG·JPG·WebP）；表格转 Markdown，图片走 Vision OCR。同批须同一基金与文档类型。
            </p>
            <div className="space-y-3 mt-3">
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={uploadFund}
                onChange={(e) => setUploadFund(e.target.value)}
                placeholder="基金代码"
                required
              />
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={uploadDocType}
                onChange={(e) => setUploadDocType(e.target.value)}
              >
                {DOC_TYPES.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
              <input
                type="file"
                name="files[]"
                multiple
                accept=".md,.txt,.pdf,.doc,.docx,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp"
                className="w-full text-sm"
                required
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button type="submit" className="flex-1 rounded-lg bg-[#0075de] text-white py-2 border-0 cursor-pointer">
                上传
              </button>
              <button type="button" className="flex-1 rounded-lg border py-2 cursor-pointer" onClick={() => setShowUpload(false)}>
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {showLog && (
        <ModalShell
          title="维护日志"
          subtitle={
            summary
              ? `当前库内 ${summary.fund_count} 只基金 · ${summary.file_count} 份文档 · ${summary.chunk_count} 个块`
              : "记录上传、索引同步、块删除等维护操作"
          }
          onClose={() => setShowLog(false)}
          wide
        >
            {/* Filter bar */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <input
                type="text"
                placeholder="基金代码（可选）"
                value={logFilterFund}
                onChange={(e) => setLogFilterFund(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyLogFilters(); }}
                className="flex-1 rounded-lg border border-[rgba(0,0,0,0.12)] px-3 py-1.5 text-xs"
              />
              <select
                value={logFilterType}
                onChange={(e) => setLogFilterType(e.target.value)}
                className="rounded-lg border border-[rgba(0,0,0,0.12)] px-2 py-1.5 text-xs bg-white"
              >
                <option value="">全部类型</option>
                {Object.entries(LOG_TYPE_LABEL).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={applyLogFilters}
                className="rounded-lg bg-[#f6f5f4] px-3 py-1.5 text-xs font-medium hover:bg-[#eee]"
              >
                筛选
              </button>
              <span className="text-xs text-[#9ca3af] ml-auto">
                {logTotal > 0 ? `共 ${logTotal} 条` : ""}
              </span>
            </div>

            {logItems.length === 0 ? (
              <p className="text-sm text-[#615d59] m-0">暂无维护记录。上传材料或更新搜索索引后，操作结果会显示在这里。</p>
            ) : (
              <ul className="space-y-3 list-none p-0 m-0">
                {logItems.map((item) => {
                  const status = LOG_STATUS_STYLE[String(item.status)] ?? {
                    label: String(item.status),
                    className: "bg-[#f6f5f4] text-[#615d59]",
                  };
                  const typeLabel = LOG_TYPE_LABEL[String(item.type)] ?? String(item.type);
                  const action = describeLogAction(item);
                  const detail = item.error_message ? String(item.error_message) : null;
                  const chunkCount =
                    item.chunk_count != null ? Number(item.chunk_count) : null;
                  const durationMs =
                    item.duration_ms != null ? Number(item.duration_ms) : null;

                  return (
                    <li
                      key={String(item.id)}
                      className="rounded-xl border border-[rgba(0,0,0,0.08)] p-4 bg-white"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#e8f4fd] text-[#0075de]">
                          {typeLabel}
                        </span>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full ${status.className}`}
                        >
                          {status.label}
                        </span>
                        <span className="text-xs text-[#9ca3af] ml-auto">
                          {formatLogTime(String(item.created_at))}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-[rgba(0,0,0,0.88)] m-0 mb-1">
                        {action}
                      </p>
                      {detail && (
                        <p className="text-xs text-[#615d59] m-0 mb-1 leading-relaxed">{detail}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#9ca3af] mt-2">
                        {item.fund_code != null && String(item.fund_code) !== "" ? (
                          <span>基金 {String(item.fund_code)}</span>
                        ) : null}
                        {item.file_path != null && String(item.file_path) !== "" ? (
                          <span className="truncate max-w-full">文件 {String(item.file_path)}</span>
                        ) : null}
                        {chunkCount != null && chunkCount > 0 && (
                          <span>索引块 {chunkCount} 个</span>
                        )}
                        {durationMs != null && durationMs > 0 && (
                          <span>耗时 {(durationMs / 1000).toFixed(1)} 秒</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Load more */}
            {logItems.length < logTotal && (
              <button
                type="button"
                disabled={logLoadingMore}
                onClick={loadMoreLogs}
                className="mt-3 w-full rounded-xl border border-dashed border-[rgba(0,0,0,0.12)] py-2 cursor-pointer text-sm text-[#615d59] bg-transparent hover:bg-[#f6f5f4] disabled:opacity-50"
              >
                {logLoadingMore ? "加载中…" : `加载更多（已有 ${logItems.length} / ${logTotal} 条）`}
              </button>
            )}

            {/* Actions row */}
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={trimOldLogs}
                className="flex-1 rounded-xl border border-[rgba(0,0,0,0.12)] py-2.5 cursor-pointer font-semibold text-sm bg-white hover:bg-[#f6f5f4]"
              >
                清理 90 天前日志
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl border border-[rgba(0,0,0,0.12)] py-2.5 cursor-pointer font-semibold text-sm bg-white hover:bg-[#f6f5f4]"
                onClick={() => setShowLog(false)}
              >
                关闭
              </button>
            </div>
          </ModalShell>
      )}
    </div>
  );
}
