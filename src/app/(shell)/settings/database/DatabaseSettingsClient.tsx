"use client";

import { useCallback, useEffect, useState } from "react";

import { SettingsEditableCard } from "@/components/settings/SettingsEditableCard";
import { SettingsFieldView } from "@/components/settings/SettingsFieldView";
import { SettingsNotice } from "@/components/settings/SettingsNotice";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { SettingsStatusBadge } from "@/components/settings/SettingsStatusBadge";
import { SecretInput } from "@/components/ui/SecretInput";
import { useFeedbackMessage } from "@/lib/ui/transient-notice";
import {
  CHECK_STATUS_LABEL,
  CHECK_STATUS_TONE,
  SETTINGS_SECTIONS,
} from "@/lib/settings/copy";
import { emptyLabel } from "@/lib/settings/mask";
import { clearReadinessCache } from "@/lib/settings/readiness-cache";
import { SETTINGS_STARTUP_PROBE_EVENT } from "@/components/settings/SettingsStartupProbe";

interface DatabaseSettings {
  supabase_url: string | null;
  anon_key_masked: string | null;
  service_role_key_masked: string | null;
  db_password_masked: string | null;
  has_anon_key: boolean;
  has_service_role_key: boolean;
  check_status: string;
  last_checked_at: string | null;
  last_error_message: string | null;
  config_source?: "saved" | "env";
  mode: "local" | "cloud";
}

export function DatabaseSettingsClient() {
  const copy = SETTINGS_SECTIONS.database;
  const [settings, setSettings] = useState<DatabaseSettings | null>(null);
  const [editing, setEditing] = useState(false);

  const [draftMode, setDraftMode] = useState<"local" | "cloud">("cloud");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftAnonKey, setDraftAnonKey] = useState("");
  const [draftServiceKey, setDraftServiceKey] = useState("");

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const { message, showFeedback, clearMessage } = useFeedbackMessage();

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/database");
    const data = await res.json();
    const db = data.database as DatabaseSettings | null;
    setSettings(db);
  }, []);

  useEffect(() => {
    void load();
    const onProbeDone = () => void load();
    window.addEventListener(SETTINGS_STARTUP_PROBE_EVENT, onProbeDone);
    return () =>
      window.removeEventListener(SETTINGS_STARTUP_PROBE_EVENT, onProbeDone);
  }, [load]);

  function startEdit() {
    setDraftMode(settings?.mode ?? "cloud");
    setDraftUrl(settings?.supabase_url ?? "");
    setDraftAnonKey("");
    setDraftServiceKey("");
    clearMessage();
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraftAnonKey("");
    setDraftServiceKey("");
  }

  async function saveDraft(): Promise<boolean> {
    // Step 1: If mode changed, save mode first
    if (draftMode !== (settings?.mode ?? "cloud")) {
      const res = await fetch("/api/settings/database", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: draftMode }),
      });
      if (!res.ok) {
        showFeedback("保存连接模式失败", { persist: true });
        return false;
      }
    }

    // Step 2: If cloud mode and fields provided, save cloud fields
    if (draftMode === "cloud") {
      const body: Record<string, string> = {};
      if (draftUrl.trim()) body.supabase_url = draftUrl.trim();
      if (draftAnonKey.trim()) body.anon_key = draftAnonKey.trim();
      if (draftServiceKey.trim()) body.service_role_key = draftServiceKey.trim();

      if (Object.keys(body).length > 0) {
        const res = await fetch("/api/settings/database", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          showFeedback("保存云端配置失败", { persist: true });
          return false;
        }
      }
    }

    return true;
  }

  async function saveAndDone() {
    setSaving(true);
    clearMessage();

    const ok = await saveDraft();
    if (!ok) {
      setSaving(false);
      return;
    }

    await load();
    setDraftAnonKey("");
    setDraftServiceKey("");
    setSaving(false);
    setEditing(false);
    clearReadinessCache();
    showFeedback("已保存。");
  }

  async function testEdit() {
    setTesting(true);
    clearMessage();

    const ok = await saveDraft();
    if (!ok) {
      setTesting(false);
      return;
    }

    const res = await fetch("/api/settings/database/test", { method: "POST" });
    const data = await res.json();
    showFeedback(data.message, { persist: !data.ok });
    setTesting(false);
    clearReadinessCache();
    await load();
  }

  async function testView() {
    setTesting(true);
    clearMessage();
    const res = await fetch("/api/settings/database/test", { method: "POST" });
    const data = await res.json();
    showFeedback(data.message, { persist: !data.ok });
    setTesting(false);
    clearReadinessCache();
    await load();
  }

  const status = settings?.check_status ?? "unchecked";

  return (
    <>
      <SettingsPageHeader title={copy.title} />
      {message && <SettingsNotice>{message}</SettingsNotice>}

      <SettingsEditableCard
        title="数据空间"
        editing={editing}
        onEdit={startEdit}
        onCancel={cancelEdit}
        onDone={() => void saveAndDone()}
        doneLabel={saving ? "保存中…" : "完成"}
        doneDisabled={saving}
        headerExtra={
          !editing ? (
            <>
              <SettingsStatusBadge
                tone={CHECK_STATUS_TONE[status] ?? "neutral"}
                label={CHECK_STATUS_LABEL[status] ?? "尚未检测"}
              />
              <button
                type="button"
                onClick={() => void testView()}
                disabled={testing}
                className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer disabled:opacity-50"
              >
                {testing ? "检测中…" : "检测"}
              </button>
            </>
          ) : undefined
        }
        viewContent={
          <div className="space-y-0">
            <SettingsFieldView
              label="连接类型"
              value={settings?.mode === "local" ? "本地" : "云端"}
            />
            {settings?.mode === "cloud" && (
              <>
                <SettingsFieldView
                  label="项目地址"
                  value={settings?.supabase_url?.trim() || "未设置"}
                />
                <SettingsFieldView
                  label="访问密钥"
                  value={emptyLabel(settings?.anon_key_masked)}
                />
                <SettingsFieldView
                  label="高级密钥（可选）"
                  value={emptyLabel(settings?.service_role_key_masked)}
                />
              </>
            )}
            {status === "failed" && settings?.last_error_message && (
              <div className="mt-2 text-xs text-[#c0392b] bg-[#fef2f2] rounded-lg px-3 py-2">
                {settings.last_error_message}
              </div>
            )}
          </div>
        }
        editContent={
          <div className="space-y-4">
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="radio"
                  name="db-mode-edit"
                  value="local"
                  checked={draftMode === "local"}
                  onChange={() => setDraftMode("local")}
                  className="cursor-pointer"
                />
                本地
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="radio"
                  name="db-mode-edit"
                  value="cloud"
                  checked={draftMode === "cloud"}
                  onChange={() => setDraftMode("cloud")}
                  className="cursor-pointer"
                />
                云端
              </label>
            </div>

            {draftMode === "cloud" ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold mb-1">项目地址</label>
                  <input
                    className="w-full rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-2 text-sm"
                    placeholder="https://xxxx.supabase.co"
                    value={draftUrl}
                    onChange={(e) => setDraftUrl(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">访问密钥</label>
                  {settings?.has_anon_key && (
                    <p className="text-xs text-[#615d59] mb-2 m-0">
                      已保存：{settings.anon_key_masked}
                    </p>
                  )}
                  <SecretInput
                    value={draftAnonKey}
                    onChange={setDraftAnonKey}
                    placeholder="填写新密钥；留空则保留原值"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">高级密钥（可选）</label>
                  <SecretInput
                    value={draftServiceKey}
                    onChange={setDraftServiceKey}
                    placeholder="留空则保留原值"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm text-[#615d59]">
                <p className="font-semibold text-[#2d2a26] m-0">本地 Supabase 前置准备：</p>
                <ol className="list-decimal pl-5 space-y-1 m-0">
                  <li>启动 Docker Desktop</li>
                  <li>
                    在项目根目录运行{" "}
                    <code className="bg-[#f5f2f0] px-1 rounded text-xs">
                      npm run supabase:recover
                    </code>
                  </li>
                </ol>
                <p className="text-xs m-0">
                  应用会自动从 .env.local 读取连接信息，无需手动填写。
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => void testEdit()}
              disabled={testing}
              className="rounded-lg bg-[#0075de] text-white px-4 py-2 text-sm font-semibold border-0 cursor-pointer disabled:opacity-50"
            >
              {testing ? "检测中…" : "检测可用性"}
            </button>
          </div>
        }
      />
    </>
  );
}
