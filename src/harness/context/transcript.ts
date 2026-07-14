import fs from "node:fs";
import path from "node:path";
import type { MessageRow } from "@/harness/types";
import { getDataDir } from "@/lib/paths";

export function getTranscriptPath(conversationId: string): string {
  return path.join(getDataDir(), "transcripts", `${conversationId}.jsonl`);
}

export interface TranscriptEntry {
  id: string;
  role: string;
  content: string;
  created_at: string;
  archived_at: string;
  metadata?: Record<string, unknown>;
}

/** L4 / reactive 前归档完整 messages 到 jsonl（append-only） */
export function appendTranscript(
  conversationId: string,
  messages: MessageRow[],
): string {
  const filePath = getTranscriptPath(conversationId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const archivedAt = new Date().toISOString();

  for (const m of messages) {
    const entry: TranscriptEntry = {
      id: m.id,
      role: m.role,
      content: m.content ?? "",
      created_at: m.created_at,
      archived_at: archivedAt,
      metadata:
        m.metadata && typeof m.metadata === "object"
          ? (m.metadata as Record<string, unknown>)
          : undefined,
    };
    fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  return filePath;
}

export function readTranscriptEntries(
  conversationId: string,
): TranscriptEntry[] {
  const filePath = getTranscriptPath(conversationId);
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TranscriptEntry);
}
