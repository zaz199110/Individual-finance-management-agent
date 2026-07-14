import fs from "node:fs";
import {
  getProposeArtifact,
  readArtifactPayload,
} from "@/lib/profile/artifacts";
import { getSupabase } from "@/lib/supabase/server";

const MAX_PAYLOAD_CHARS = 8000;

export async function runArtifactRead(input: Record<string, unknown>): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const artifactId = String(input.artifact_id ?? input.id ?? "").trim();
  if (!artifactId) {
    return { ok: false, preview: "", error: "缺少 artifact_id。" };
  }

  const supabase = await getSupabase();
  if (!supabase) {
    return { ok: false, preview: "", error: "数据库未连接。" };
  }

  const artifact = await getProposeArtifact(supabase, artifactId);
  if (!artifact) {
    return { ok: false, preview: "", error: "找不到 propose artifact。" };
  }

  let payload: Record<string, unknown> | null = null;
  let truncated = false;
  let fileError: string | undefined;

  if (artifact.payload_path && fs.existsSync(artifact.payload_path)) {
    try {
      payload = readArtifactPayload(artifact.payload_path);
      const raw = JSON.stringify(payload);
      if (raw.length > MAX_PAYLOAD_CHARS) {
        truncated = true;
        payload = JSON.parse(raw.slice(0, MAX_PAYLOAD_CHARS)) as Record<
          string,
          unknown
        >;
      }
    } catch (err) {
      fileError =
        err instanceof Error ? err.message : "payload 文件解析失败。";
    }
  } else {
    fileError = "payload 文件缺失。";
  }

  const data = {
    artifact_id: artifact.id,
    kind: artifact.kind,
    status: artifact.status,
    summary_zh: artifact.summary_zh,
    payload,
    truncated,
    payload_path: artifact.payload_path,
    file_error: fileError,
  };

  const preview = fileError
    ? `${artifact.summary_zh}\n（${fileError}）`
    : `${artifact.kind} · ${artifact.status} · ${artifact.summary_zh}`;

  return {
    ok: !fileError || Boolean(payload),
    preview: preview.slice(0, 1500),
    data,
    error: fileError && !payload ? fileError : undefined,
  };
}
