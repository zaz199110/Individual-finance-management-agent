"use client";



import { useEffect, useState } from "react";

import { useReadiness } from "@/contexts/ReadinessContext";

import { SettingsEditableCard } from "@/components/settings/SettingsEditableCard";

import { SettingsFieldView } from "@/components/settings/SettingsFieldView";

import { SettingsStatusBadge } from "@/components/settings/SettingsStatusBadge";

import { SecretInput } from "@/components/ui/SecretInput";

import { useFeedbackMessage } from "@/lib/ui/transient-notice";

import {

  CHECK_STATUS_LABEL,

  CHECK_STATUS_TONE,

} from "@/lib/settings/copy";

import { emptyLabel } from "@/lib/settings/mask";



export type ModelSlot =

  | "reasoning"

  | "deep"

  | "vision"

  | "web"

  | "embedding";



export interface ModelSlotRow {

  slot: ModelSlot;

  model_name: string | null;

  api_base_url: string | null;

  api_key_masked: string | null;

  has_api_key: boolean;

  use_same_as_reasoning: boolean;

  check_status: string;

  config_source?: "saved" | "env";

}



const SLOT_LABELS: Record<ModelSlot, string> = {

  reasoning: "日常对话",

  deep: "深度分析",

  vision: "图片识别",

  web: "联网搜索",

  embedding: "基金资料检索（可选）",

};



const SLOT_REQUIRED: ModelSlot[] = ["reasoning", "web"];

const SAME_AS_REASONING_SLOTS: ModelSlot[] = ["deep", "vision"];



interface ModelSlotFormProps {

  slot: ModelSlot;

  row: ModelSlotRow | null;

  embeddingEnabled?: boolean;

  onEmbeddingEnabledChange?: (enabled: boolean) => void;

  onRefresh: () => Promise<void>;

}



export function ModelSlotForm({

  slot,

  row,

  embeddingEnabled = false,

  onEmbeddingEnabledChange,

  onRefresh,

}: ModelSlotFormProps) {

  const { refreshReadiness } = useReadiness();

  const [editing, setEditing] = useState(false);

  const [modelName, setModelName] = useState("");

  const [apiUrl, setApiUrl] = useState("");

  const [apiKey, setApiKey] = useState("");

  const [sameAsReasoning, setSameAsReasoning] = useState(

    SAME_AS_REASONING_SLOTS.includes(slot),

  );

  const [testing, setTesting] = useState(false);

  const [saving, setSaving] = useState(false);

  const { message, showFeedback, clearMessage } = useFeedbackMessage();



  useEffect(() => {

    if (!row || editing) return;

    setModelName(row.model_name ?? "");

    setApiUrl(row.api_base_url ?? "");

    setSameAsReasoning(row.use_same_as_reasoning);

  }, [row, editing]);



  function startEdit() {

    setModelName(row?.model_name ?? "");

    setApiUrl(row?.api_base_url ?? "");

    setApiKey("");

    setSameAsReasoning(row?.use_same_as_reasoning ?? SAME_AS_REASONING_SLOTS.includes(slot));

    clearMessage();

    setEditing(true);

  }



  function cancelEdit() {

    setEditing(false);

    setApiKey("");

    setModelName(row?.model_name ?? "");

    setApiUrl(row?.api_base_url ?? "");

    setSameAsReasoning(row?.use_same_as_reasoning ?? SAME_AS_REASONING_SLOTS.includes(slot));

  }



  async function saveAndDone() {

    setSaving(true);

    clearMessage();

    const body: Record<string, unknown> = {

      slot,

      use_same_as_reasoning: sameAsReasoning,

    };

    if (slot === "embedding") {

      body.embedding_enabled = embeddingEnabled;

    }

    if (!sameAsReasoning || slot === "reasoning") {

      body.model_name = modelName;

      body.api_base_url = apiUrl;

      if (apiKey.trim()) body.api_key_encrypted = apiKey.trim();

    }

    const res = await fetch("/api/settings/models", {

      method: "PATCH",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify(body),

    });

    const data = await res.json();

    setSaving(false);

    if (data.error) {

      showFeedback(data.error, { persist: true });

      return;

    }

    setApiKey("");

    setEditing(false);

    showFeedback("已保存，请重新检测。");

    await onRefresh();

    await refreshReadiness();

  }



  async function test() {

    setTesting(true);

    clearMessage();

    const res = await fetch("/api/settings/models/test", {

      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ slot }),

    });

    const data = await res.json();

    showFeedback(data.message, { persist: !data.ok });

    setTesting(false);

    await onRefresh();

    await refreshReadiness();

  }



  const status = row?.check_status ?? "unchecked";

  const showFields = !sameAsReasoning || slot === "reasoning";



  const title = (

    <>

      {SLOT_LABELS[slot]}

      {SLOT_REQUIRED.includes(slot) && <span className="text-[#e03e3e] ml-1">*</span>}

    </>

  );



  return (

    <SettingsEditableCard

      title={title}

      editing={editing}

      onEdit={startEdit}

      onCancel={cancelEdit}

      onDone={() => void saveAndDone()}

      doneLabel={saving ? "保存中…" : "完成"}

      doneDisabled={saving}

      headerExtra={

        <>

          <SettingsStatusBadge

            tone={CHECK_STATUS_TONE[status] ?? "neutral"}

            label={CHECK_STATUS_LABEL[status] ?? "尚未检测"}

          />

          {!editing && (

            <button

              type="button"

              onClick={() => void test()}

              disabled={testing}

              className="rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-1.5 text-sm font-semibold bg-white cursor-pointer disabled:opacity-50"

            >

              {testing ? "检测中…" : "检测"}

            </button>

          )}

        </>

      }

      viewContent={

        <div className="space-y-2">

          {SAME_AS_REASONING_SLOTS.includes(slot) && (

            <SettingsFieldView

              label="配置方式"

              value={row?.use_same_as_reasoning ? "与日常对话相同" : "单独配置"}

            />

          )}

          {slot === "embedding" && (

            <SettingsFieldView

              label="智能资料匹配"

              value={embeddingEnabled ? "已开启" : "已关闭"}

            />

          )}

          {showFields && (

            <>

              <SettingsFieldView

                label="模型"

                value={row?.model_name?.trim() || "未设置"}

              />

              <SettingsFieldView

                label="接口地址"

                value={row?.api_base_url?.trim() || "未设置"}

              />

              <SettingsFieldView

                label="访问密钥"

                value={emptyLabel(row?.api_key_masked)}

              />

            </>

          )}

        </div>

      }

      editContent={

        <div className="space-y-3">

          {SAME_AS_REASONING_SLOTS.includes(slot) && (

            <label className="flex items-center gap-2 text-[15px]">

              <input

                type="checkbox"

                checked={sameAsReasoning}

                onChange={(e) => setSameAsReasoning(e.target.checked)}

              />

              与「日常对话」使用相同配置

            </label>

          )}

          {slot === "embedding" && (

            <label className="flex items-center gap-2 text-[15px]">

              <input

                type="checkbox"

                checked={embeddingEnabled}

                onChange={(e) => onEmbeddingEnabledChange?.(e.target.checked)}

              />

              启用基金解析语义筛选

            </label>

          )}

          {showFields && (

            <>

              <input

                className="w-full rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-2 text-sm"

                placeholder="模型名称"

                value={modelName}

                onChange={(e) => setModelName(e.target.value)}

              />

              <input

                className="w-full rounded-lg border border-[rgba(0,0,0,0.1)] px-3 py-2 text-sm"

                placeholder="接口地址"

                value={apiUrl}

                onChange={(e) => setApiUrl(e.target.value)}

              />

              {row?.has_api_key && (

                <p className="text-xs text-[#615d59] m-0">已保存：{row.api_key_masked}</p>

              )}

              <SecretInput

                value={apiKey}

                onChange={setApiKey}

                placeholder="填写新密钥；留空则保留原值"

              />

            </>

          )}

        </div>

      }

      footer={

        message || row?.config_source === "env" ? (

          <div className="space-y-1">

            {row?.config_source === "env" && (

              <p className="text-xs text-[#615d59] m-0">来自本地 .env.local（待写入配置表）</p>

            )}

            {message ? <p className="text-sm text-[#615d59] m-0">{message}</p> : null}

          </div>

        ) : null

      }

    />

  );

}


