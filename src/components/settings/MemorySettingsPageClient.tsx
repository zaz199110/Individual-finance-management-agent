"use client";

import { useCallback, useEffect, useState } from "react";
import { SettingsNotice } from "@/components/settings/SettingsNotice";
import { useAutoDismissEffect } from "@/lib/ui/transient-notice";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { ReportMarkdownPreview } from "@/components/reports/ReportMarkdownPreview";
import { SETTINGS_SECTIONS } from "@/lib/settings/copy";

const EMPTY_PLACEHOLDER = "还没有设置回答偏好。点击 **编辑** 写下您的偏好。";

interface MemoryPayload {
  content_md: string;
  updated_at: string | null;
  file_path: string;
  file_exists: boolean;
}

export function MemorySettingsPageClient() {
  const copy = SETTINGS_SECTIONS.memory;
  const [memory, setMemory] = useState<MemoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"edit" | "refresh" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  useAutoDismissEffect(toast, clearToast);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/memory?_t=${Date.now()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as MemoryPayload & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "加载失败");
        return;
      }
      setMemory(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleEdit() {
    setBusy("edit");
    setError(null);
    setToast(null);
    try {
      const res = await fetch("/api/settings/memory/actions/open-file", {
        method: "POST",
      });
      const data = (await res.json()) as {
        code?: string;
        message?: string;
        opened_path?: string;
      };
      if (res.status === 501) {
        setError("当前环境无法打开本地文件。");
        return;
      }
      if (!res.ok) {
        setError(data.message ?? data.code ?? "打开文件失败");
        return;
      }
      const pathHint =
        memory?.file_path ??
        (data.opened_path ? data.opened_path.replace(/^.*[/\\]data[/\\]/, "data/") : null) ??
        "data/user-memory.md";
      setToast(`已用记事本打开 ${pathHint}，保存后请点击刷新。`);
      setMemory((prev) =>
        prev
          ? { ...prev, file_exists: true }
          : {
              content_md: "",
              updated_at: null,
              file_path: "data/user-memory.md",
              file_exists: true,
            },
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleRefresh() {
    setBusy("refresh");
    setError(null);
    setToast(null);
    try {
      const res = await fetch("/api/settings/memory/actions/refresh", {
        method: "POST",
      });
      const data = (await res.json()) as MemoryPayload & { code?: string };
      if (res.status === 404 && data.code === "ERR-MEM-FILE-MISSING") {
        setError("请先点击「编辑」创建并保存文件。");
        return;
      }
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "刷新失败");
        return;
      }
      await load();
      setToast("已更新");
    } finally {
      setBusy(null);
    }
  }

  const previewMd =
    memory?.content_md?.trim() ? memory.content_md : EMPTY_PLACEHOLDER;

  return (
    <div className="space-y-6">
      <SettingsPageHeader title={copy.title} />

      {toast && <SettingsNotice tone="success">{toast}</SettingsNotice>}
      {error && <SettingsNotice tone="error">{error}</SettingsNotice>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={busy !== null || loading}
          onClick={() => void handleEdit()}
          className="rounded-lg border border-[rgba(0,0,0,0.1)] px-4 py-2 text-sm font-semibold bg-white cursor-pointer disabled:opacity-50"
        >
          {busy === "edit" ? "打开中…" : "编辑"}
        </button>
        <button
          type="button"
          disabled={busy !== null || loading}
          onClick={() => void handleRefresh()}
          className="rounded-lg bg-[#0075de] text-white px-4 py-2 text-sm font-semibold border-0 cursor-pointer disabled:opacity-50"
        >
          {busy === "refresh" ? "刷新中…" : "刷新"}
        </button>
      </div>

      <SettingsSection>
        {loading ? (
          <p className="text-sm text-[#615d59] m-0">加载中…</p>
        ) : (
          <ReportMarkdownPreview
            key={memory?.updated_at ?? "empty"}
            markdown={previewMd}
            linkPolicy="published"
          />
        )}
      </SettingsSection>

      {memory?.updated_at && (
        <p className="text-xs text-[#615d59] m-0">
          上次更新：{new Date(memory.updated_at).toLocaleString("zh-CN")}
        </p>
      )}
    </div>
  );
}
