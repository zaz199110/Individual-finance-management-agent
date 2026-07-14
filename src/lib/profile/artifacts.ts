import fs from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { getRunWorkspacePath } from "@/harness/runs/workspace";

export interface ProposeArtifactRow {
  id: string;
  conversation_id: string;
  run_id: string;
  kind: string;
  status: string;
  summary_zh: string;
  payload_path: string;
  supersedes_id?: string | null;
}

/**
 * 将同一对话中同 kind 的 pending artifact 标记为 superseded。
 * PRD §5.3.10b：用户修订 propose 时旧卡标 superseded。
 */
async function supersedePendingArtifacts(
  supabase: SupabaseClient,
  conversationId: string,
  kind: string,
): Promise<string | null> {
  const { data: pending } = await supabase
    .from("propose_artifacts")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("kind", kind)
    .eq("status", "pending");

  if (!pending?.length) return null;

  const ids = pending.map((r) => r.id as string);
  await supabase
    .from("propose_artifacts")
    .update({
      status: "superseded",
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);

  // 返回最新的一条（最后创建的）作为 supersedes_id
  return ids[ids.length - 1];
}

export async function createProposeArtifact(
  supabase: SupabaseClient,
  params: {
    conversationId: string;
    runId: string;
    kind: string;
    summaryZh: string;
    payload: Record<string, unknown>;
  },
): Promise<ProposeArtifactRow> {
  // §5.3.10b：先将同 kind 的 pending 标为 superseded
  const supersedesId = await supersedePendingArtifacts(
    supabase,
    params.conversationId,
    params.kind,
  );

  const artifactId = uuidv4();
  const runDir = getRunWorkspacePath(params.conversationId, params.runId);
  fs.mkdirSync(path.join(runDir, "artifacts"), { recursive: true });
  const payloadPath = path.join(runDir, "artifacts", `${artifactId}.json`);
  fs.writeFileSync(payloadPath, JSON.stringify(params.payload, null, 2), "utf8");

  const { data, error } = await supabase
    .from("propose_artifacts")
    .insert({
      id: artifactId,
      conversation_id: params.conversationId,
      run_id: params.runId,
      kind: params.kind,
      status: "pending",
      summary_zh: params.summaryZh,
      payload_path: payloadPath,
      supersedes_id: supersedesId,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`创建 propose_artifacts 失败：${error?.message ?? "unknown"}`);
  }

  return data as ProposeArtifactRow;
}

export function readArtifactPayload(payloadPath: string): Record<string, unknown> {
  const raw = fs.readFileSync(payloadPath, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

export async function getProposeArtifact(
  supabase: SupabaseClient,
  artifactId: string,
): Promise<ProposeArtifactRow | null> {
  const { data } = await supabase
    .from("propose_artifacts")
    .select("*")
    .eq("id", artifactId)
    .maybeSingle();
  return (data as ProposeArtifactRow | null) ?? null;
}

export async function markArtifactConfirmed(
  supabase: SupabaseClient,
  artifactId: string,
): Promise<void> {
  await supabase
    .from("propose_artifacts")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", artifactId);
}

export async function markArtifactAbandoned(
  supabase: SupabaseClient,
  artifactId: string,
): Promise<void> {
  await supabase
    .from("propose_artifacts")
    .update({
      status: "abandoned",
      updated_at: new Date().toISOString(),
    })
    .eq("id", artifactId);
}
