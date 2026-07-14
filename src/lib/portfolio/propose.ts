import type { SupabaseClient } from "@supabase/supabase-js";
import { createProposeArtifact } from "@/lib/profile/artifacts";
import type { ConfirmCardBlock } from "@/lib/profile/types";
import { formatHoldingsCardBody, validateHoldings } from "./validate";
import type { HoldingsProposePayload } from "./types";

export interface HoldingsProposeResult {
  ok: boolean;
  artifact_id?: string;
  summary_zh?: string;
  card?: ConfirmCardBlock;
  preview?: string;
  error?: string;
}

export async function holdingsPropose(
  supabase: SupabaseClient | null,
  params: {
    conversationId: string;
    runId: string;
    payload: HoldingsProposePayload;
  },
): Promise<HoldingsProposeResult> {
  if (!supabase) {
    return { ok: false, error: "数据库未连接，无法创建确认卡。" };
  }

  const validation = validateHoldings(params.payload);
  if (!validation.ok || !validation.data) {
    return { ok: false, error: validation.errors.join(" ") };
  }

  const data = validation.data;
  const { data: current } = await supabase
    .from("holdings_versions")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  const isInitial = !current?.id;
  if (isInitial && data.change_summary.kind !== "initial") {
    data.change_summary.kind = "initial";
  }
  if (!isInitial && !data.previous_version_id) {
    data.previous_version_id = current!.id as string;
  }

  const summary = `${data.change_summary.narrative.slice(0, 60)} · ${data.positions.length} 笔`;
  const cardTitle =
    data.card_title ??
    (isInitial ? "请确认：首次录入持仓" : "请确认：更新当前持仓");

  const fullPayload: HoldingsProposePayload = {
    ...data,
    card_title: cardTitle,
  };

  const artifact = await createProposeArtifact(supabase, {
    conversationId: params.conversationId,
    runId: params.runId,
    kind: "holdings",
    summaryZh: summary,
    payload: fullPayload as unknown as Record<string, unknown>,
  });

  const card: ConfirmCardBlock = {
    type: "confirm_card",
    status: "active",
    artifact_id: artifact.id,
    card_kind: "holdings",
    summary_zh: summary,
    card_title: cardTitle,
  };

  return {
    ok: true,
    artifact_id: artifact.id,
    summary_zh: summary,
    card,
    preview: formatHoldingsCardBody(fullPayload),
  };
}

export { loadSampleHoldingsInitial, loadSampleHoldingsSingle } from "./samples";
