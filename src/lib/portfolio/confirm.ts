import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getProposeArtifact,
  markArtifactConfirmed,
  readArtifactPayload,
} from "@/lib/profile/artifacts";
import { validateHoldings } from "./validate";
import type { HoldingsPosition, HoldingsProposePayload } from "./types";

export interface HoldingsConfirmResult {
  ok: boolean;
  holdings_version_id?: string;
  error?: string;
}

export async function holdingsConfirmArtifact(
  supabase: SupabaseClient | null,
  artifactId: string,
): Promise<HoldingsConfirmResult> {
  if (!supabase) {
    return { ok: false, error: "数据库未连接。" };
  }

  const artifact = await getProposeArtifact(supabase, artifactId);
  if (!artifact) {
    return { ok: false, error: "确认卡不存在或已失效。" };
  }
  if (artifact.status !== "pending") {
    return { ok: false, error: `该确认卡状态为 ${artifact.status}，无法再次确认。` };
  }
  if (artifact.kind !== "holdings") {
    return { ok: false, error: `暂不支持确认 kind=${artifact.kind}。` };
  }

  const payload = readArtifactPayload(
    artifact.payload_path,
  ) as unknown as HoldingsProposePayload;
  const validation = validateHoldings(payload);
  if (!validation.ok || !validation.data) {
    return { ok: false, error: validation.errors.join(" ") };
  }

  const data = validation.data;
  const now = new Date().toISOString();

  const { data: current } = await supabase
    .from("holdings_versions")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  let previousId: string | null = data.previous_version_id ?? null;
  if (current?.id) {
    previousId = current.id as string;
    await supabase
      .from("holdings_versions")
      .update({ is_current: false })
      .eq("id", current.id);
  }

  // Full overwrite: set default values for action and invested_at
  const finalPositions: HoldingsPosition[] = data.positions.map((p) => ({
    ...p,
    action: p.action ?? "add",
    invested_at: p.invested_at ?? "1970-01-01",
  }));

  const { data: inserted, error } = await supabase
    .from("holdings_versions")
    .insert({
      is_current: true,
      positions: finalPositions,
      change_summary: data.change_summary,
      previous_version_id: previousId,
      confirmed_at: now,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "写入 holdings_versions 失败。" };
  }

  await markArtifactConfirmed(supabase, artifactId);

  return {
    ok: true,
    holdings_version_id: inserted.id as string,
  };
}
