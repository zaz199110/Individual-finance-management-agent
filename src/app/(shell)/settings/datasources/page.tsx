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
  CONFIG_FROM_ENV_HINT,
  SETTINGS_SECTIONS,
} from "@/lib/settings/copy";
import { emptyLabel } from "@/lib/settings/mask";
import { SETTINGS_STARTUP_PROBE_EVENT } from "@/components/settings/SettingsStartupProbe";

interface DatasourceSettings {
  tushare_token_masked: string | null;
  tushare_check_status: string;
  tushare_last_error_message: string | null;
  akshare_check_status: string;
  akshare_last_error_message: string | null;
  config_source?: "saved" | "env";
}

export default function DatasourcesSettingsPage() {
  const copy = SETTINGS_SECTIONS.datasources;
  const [settings, setSettings] = useState<DatasourceSettings | null>(null);
  const [editingTushare, setEditingTushare] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<"tushare" | "akshare" | null>(null);
  const { message, showFeedback, clearMessage } = useFeedbackMessage();

  const load = useCallback(async () => {
    const res = await fetch("/api/settings/datasources");
    const data = await res.json();
    setSettings(data.datasources ?? null);
  }, []);

  useEffect(() => {
    void load();
    const onProbeDone = () => void load();
    window.addEventListener(SETTINGS_STARTUP_PROBE_EVENT, onProbeDone);
    return () =>
      window.removeEventListener(SETTINGS_STARTUP_PROBE_EVENT, onProbeDone);
  }, [load]);

  async function saveTushareAndDone() {
    setSaving(true);
    clearMessage();
    const hadNewToken = Boolean(tokenInput.trim());
    const body: Record<string, unknown> = tokenInput.trim()
      ? { tushare_token: tokenInput.trim() }
      : settings?.tushare_token_masked
        ? {}
        : { clear_tushare_token: true };
    const res = await fetch("/api/settings/datasources", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      showFeedback(data.error ?? "保存失败", { persist: true });
      return;
    }
    setTokenInput("");
    setSettings(data.datasources);
    setEditingTushare(false);
    showFeedback(hadNewToken ? "已保存，请重新检测。" : "已保存。");
  }

  async function runTest(provider: "tushare" | "akshare") {
    setTesting(provider);
    clearMessage();
    const res = await fetch("/api/settings/datasources/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    const data = await res.json();
    setTesting(null);
    showFeedback(data.message ?? (data.ok ? "检测通过" : "检测未通过"), {
      persist: !data.ok,
    });
    void load();
  }

  const tushareStatus = settings?.tushare_check_status ?? "unchecked";
  const akshareStatus = settings?.akshare_check_status ?? "unchecked";

  return (
    <>
      <SettingsPageHeader title={copy.title} />
      {settings?.config_source === "env" && (
        <SettingsNotice>{CONFIG_FROM_ENV_HINT}</SettingsNotice>
      )}
      {message && <SettingsNotice>{message}</SettingsNotice>}

      <SettingsEditableCard
        title="Tushare"
        editing={editingTushare}
        onEdit={() => {
          setTokenInput("");
          clearMessage();
          setEditingTushare(true);
        }}
        onCancel={() => {
          setEditingTushare(false);
          setTokenInput("");
        }}
        onDone={() => void saveTushareAndDone()}
        doneLabel={saving ? "保存中…" : "完成"}
        doneDisabled={saving}
        headerExtra={
          <>
            <SettingsStatusBadge
              tone={CHECK_STATUS_TONE[tushareStatus] ?? "neutral"}
              label={CHECK_STATUS_LABEL[tushareStatus] ?? "尚未检测"}
            />
            {!editingTushare && (
              <button
                type="button"
                disabled={testing === "tushare" || !settings?.tushare_token_masked}
                onClick={() => void runTest("tushare")}
                className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer disabled:opacity-50"
              >
                {testing === "tushare" ? "检测中…" : "检测"}
              </button>
            )}
          </>
        }
        viewContent={
          <SettingsFieldView
            label="访问密钥"
            value={emptyLabel(settings?.tushare_token_masked)}
          />
        }
        editContent={
          <>
            {settings?.tushare_token_masked && (
              <p className="text-xs text-[#615d59] m-0 mb-2">
                已保存：{settings.tushare_token_masked}
              </p>
            )}
            <SecretInput
              value={tokenInput}
              onChange={setTokenInput}
              placeholder="粘贴 Token；留空则保留原值"
            />
          </>
        }
        footer={
          settings?.tushare_last_error_message ? (
            <p className="text-sm text-[#e03e3e] m-0">{settings.tushare_last_error_message}</p>
          ) : null
        }
      />

      <SettingsEditableCard
        title="AKShare（备用）"
        editing={false}
        editable={false}
        onEdit={() => {}}
        onCancel={() => {}}
        onDone={() => {}}
        headerExtra={
          <>
            <SettingsStatusBadge
              tone={CHECK_STATUS_TONE[akshareStatus] ?? "neutral"}
              label={CHECK_STATUS_LABEL[akshareStatus] ?? "尚未检测"}
            />
            <button
              type="button"
              disabled={testing === "akshare"}
              onClick={() => void runTest("akshare")}
              className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer disabled:opacity-50"
            >
              {testing === "akshare" ? "检测中…" : "检测"}
            </button>
          </>
        }
        viewContent={
          <SettingsFieldView label="访问密钥" value="无需填写" />
        }
        editContent={null}
        footer={
          settings?.akshare_last_error_message ? (
            <p className="text-sm text-[#e03e3e] m-0">{settings.akshare_last_error_message}</p>
          ) : null
        }
      />
    </>
  );
}
