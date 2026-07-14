"use client";



import { useCallback, useEffect, useState } from "react";

import {

  ModelSlotForm,

  type ModelSlot,

  type ModelSlotRow,

} from "@/components/settings/ModelSlotForm";

import { SettingsNotice } from "@/components/settings/SettingsNotice";
import { SettingsPageHeader } from "@/components/settings/SettingsPageHeader";
import { SETTINGS_STARTUP_PROBE_EVENT } from "@/components/settings/SettingsStartupProbe";

import { useReadiness } from "@/contexts/ReadinessContext";

import { CONFIG_FROM_ENV_HINT, SETTINGS_SECTIONS } from "@/lib/settings/copy";

const MODEL_PROTOCOL_HINT =
  "当前仅兼容 Anthropic API 协议（ Claude / 兼容该协议的第三方服务）。请填写服务商提供的模型名称与接口地址，例如接口地址通常以 /anthropic 或 /v1/messages 结尾。";



const SLOTS: ModelSlot[] = ["reasoning", "deep", "vision", "web", "embedding"];



export default function ModelsSettingsPage() {

  const copy = SETTINGS_SECTIONS.models;

  const { readiness } = useReadiness();

  const [slots, setSlots] = useState<ModelSlotRow[]>([]);

  const [embeddingEnabled, setEmbeddingEnabled] = useState(false);

  const [hasEnvDefaults, setHasEnvDefaults] = useState(false);



  const loadModels = useCallback(async () => {

    const modelsRes = await fetch("/api/settings/models");

    const modelsData = await modelsRes.json();

    const nextSlots = (modelsData.slots ?? []) as ModelSlotRow[];

    setSlots(nextSlots);

    setHasEnvDefaults(nextSlots.some((s) => s.config_source === "env"));

    if (modelsData.embedding_filter) {

      setEmbeddingEnabled(modelsData.embedding_filter.enabled !== false);

    }

  }, []);



  useEffect(() => {

    void loadModels();

    const onProbeDone = () => void loadModels();

    window.addEventListener(SETTINGS_STARTUP_PROBE_EVENT, onProbeDone);

    return () =>

      window.removeEventListener(SETTINGS_STARTUP_PROBE_EVENT, onProbeDone);

  }, [loadModels]);



  const slotByName = (slot: ModelSlot) =>

    slots.find((s) => s.slot === slot) ?? null;



  return (

    <>

      <SettingsPageHeader title={copy.title} />

      <p className="text-sm text-[#615d59] leading-relaxed m-0 mb-6">{MODEL_PROTOCOL_HINT}</p>

      {hasEnvDefaults && (

        <SettingsNotice>{CONFIG_FROM_ENV_HINT}</SettingsNotice>

      )}



      {readiness?.banners
        .filter((b) => !b.includes("Supabase"))
        .map((b) => (

        <SettingsNotice key={b}>{b}</SettingsNotice>

      ))}



      <div className="space-y-4">

        {SLOTS.map((slot) => (

          <ModelSlotForm

            key={slot}

            slot={slot}

            row={slotByName(slot)}

            embeddingEnabled={embeddingEnabled}

            onEmbeddingEnabledChange={

              slot === "embedding" ? setEmbeddingEnabled : undefined

            }

            onRefresh={loadModels}

          />

        ))}

      </div>

    </>

  );

}


