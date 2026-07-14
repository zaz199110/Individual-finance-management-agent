import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getRunWorkspacePath } from "@/harness/runs/workspace";
import { getSupabase } from "@/lib/supabase/server";

export const OVERLAY_MAX_BLOCKS = 10;
export const OVERLAY_MAX_CONTENT_CHARS = 6000;
export const OVERLAY_SUMMARY_THRESHOLD = 800;
export const OVERLAY_SUMMARY_MAX = 220;

export interface ReportOverlayBlock {
  id: string;
  anchor: string;
  title?: string;
  content: string;
  summary?: string;
  source_message_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ReportOverlayState {
  run_id: string;
  blocks: ReportOverlayBlock[];
  updated_at: string;
}

function overlayFilePath(conversationId: string, runId: string): string {
  return path.join(getRunWorkspacePath(conversationId, runId), "report-overlay.json");
}

export function generateOverlaySummary(content: string): string {
  if (content.length <= OVERLAY_SUMMARY_THRESHOLD) return "";
  const trimmed = content.trim();
  if (trimmed.length <= OVERLAY_SUMMARY_MAX) return trimmed;
  return `${trimmed.slice(0, OVERLAY_SUMMARY_MAX - 1)}…`;
}

export async function loadReportOverlay(
  conversationId: string,
  runId: string,
): Promise<ReportOverlayState | null> {
  const supabase = await getSupabase();
  if (supabase) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("metadata")
      .eq("id", conversationId)
      .maybeSingle();
    const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
    const overlay = meta.report_overlay as ReportOverlayState | undefined;
    if (overlay?.run_id === runId && Array.isArray(overlay.blocks)) {
      return overlay;
    }
  }

  const file = overlayFilePath(conversationId, runId);
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as ReportOverlayState;
    if (parsed.run_id === runId) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

async function persistReportOverlay(
  conversationId: string,
  overlay: ReportOverlayState,
): Promise<void> {
  const file = overlayFilePath(conversationId, overlay.run_id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(overlay, null, 2), "utf8");

  const supabase = await getSupabase();
  if (!supabase) return;

  const { data: conv } = await supabase
    .from("conversations")
    .select("metadata")
    .eq("id", conversationId)
    .maybeSingle();
  const meta = (conv?.metadata ?? {}) as Record<string, unknown>;

  await supabase
    .from("conversations")
    .update({
      metadata: { ...meta, report_overlay: overlay },
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
}

export async function patchReportOverlay(input: {
  conversationId: string;
  runId: string;
  action: "upsert" | "delete";
  block: {
    id?: string;
    anchor: string;
    title?: string;
    content?: string;
    source_message_id?: string;
  };
}): Promise<{ ok: boolean; overlay?: ReportOverlayState; error?: string }> {
  const content = input.block.content ?? "";
  if (input.action === "upsert") {
    if (!content.trim()) {
      return { ok: false, error: "overlay 块 content 不能为空。" };
    }
    if (content.length > OVERLAY_MAX_CONTENT_CHARS) {
      return { ok: false, error: `单块 content 不得超过 ${OVERLAY_MAX_CONTENT_CHARS} 字。` };
    }
  }

  const now = new Date().toISOString();
  let overlay =
    (await loadReportOverlay(input.conversationId, input.runId)) ??
    ({
      run_id: input.runId,
      blocks: [],
      updated_at: now,
    } satisfies ReportOverlayState);

  if (input.action === "delete") {
    const id = input.block.id;
    if (!id) return { ok: false, error: "delete 须指定 block.id。" };
    overlay = {
      ...overlay,
      blocks: overlay.blocks.filter((b) => b.id !== id),
      updated_at: now,
    };
  } else {
    const id = input.block.id ?? randomUUID();
    const summary =
      content.length > OVERLAY_SUMMARY_THRESHOLD
        ? generateOverlaySummary(content)
        : undefined;
    const nextBlock: ReportOverlayBlock = {
      id,
      anchor: input.block.anchor,
      title: input.block.title,
      content,
      summary,
      source_message_id: input.block.source_message_id,
      created_at: overlay.blocks.find((b) => b.id === id)?.created_at ?? now,
      updated_at: now,
    };
    const others = overlay.blocks.filter((b) => b.id !== id);
    if (others.length >= OVERLAY_MAX_BLOCKS && !overlay.blocks.some((b) => b.id === id)) {
      return { ok: false, error: `overlay 块数不得超过 ${OVERLAY_MAX_BLOCKS}。` };
    }
    overlay = {
      run_id: input.runId,
      blocks: [...others, nextBlock],
      updated_at: now,
    };
  }

  await persistReportOverlay(input.conversationId, overlay);
  return { ok: true, overlay };
}

export function mergeOverlayIntoMarkdown(
  markdown: string,
  overlay: ReportOverlayState | null,
): string {
  if (!overlay?.blocks.length) return markdown;

  let result = markdown;
  for (const block of overlay.blocks) {
    const section = [
      block.title ? `### ${block.title}` : "",
      block.content,
    ]
      .filter(Boolean)
      .join("\n\n");

    const anchor = block.anchor;
    if (anchor === "append:end" || !anchor.startsWith("after:") && !anchor.startsWith("before:")) {
      result = `${result.trim()}\n\n---\n\n${section}\n`;
      continue;
    }

    const heading = anchor.replace(/^(after|before):/, "");
    const needle = `## ${heading}`;
    const idx = result.indexOf(needle);
    if (idx < 0) {
      result = `${result.trim()}\n\n---\n\n${section}\n`;
      continue;
    }

    const lineEnd = result.indexOf("\n", idx);
    const insertAt =
      anchor.startsWith("before:") ? idx : lineEnd >= 0 ? lineEnd + 1 : result.length;

    result = `${result.slice(0, insertAt)}\n\n${section}\n${result.slice(insertAt)}`;
  }

  return result;
}

export async function mergeReportOverlayIntoDraft(input: {
  conversationId: string;
  runId: string;
  draftPath: string;
}): Promise<{ ok: boolean; merged_path?: string; error?: string }> {
  if (!fs.existsSync(input.draftPath)) {
    return { ok: false, error: "草稿文件不存在。" };
  }

  const overlay = await loadReportOverlay(input.conversationId, input.runId);
  if (!overlay?.blocks.length) {
    return { ok: true, merged_path: input.draftPath };
  }

  const raw = fs.readFileSync(input.draftPath, "utf8");
  const merged = mergeOverlayIntoMarkdown(raw, overlay);
  fs.writeFileSync(input.draftPath, merged, "utf8");
  return { ok: true, merged_path: input.draftPath };
}

export async function clearReportOverlay(conversationId: string): Promise<void> {
  const supabase = await getSupabase();
  if (supabase) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("metadata")
      .eq("id", conversationId)
      .maybeSingle();
    const meta = (conv?.metadata ?? {}) as Record<string, unknown>;
    const overlay = meta.report_overlay as ReportOverlayState | undefined;
    if (overlay?.run_id) {
      const file = overlayFilePath(conversationId, overlay.run_id);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    await supabase
      .from("conversations")
      .update({
        metadata: { ...meta, report_overlay: null },
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
  }
}
