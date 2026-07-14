import fs from "node:fs";
import path from "node:path";
import {
  isDesktopShellAvailable,
  openLocalTextFile,
} from "@/lib/desktop/open-local-path";
import { getDataDir } from "@/lib/paths";
import { getSupabase } from "@/lib/supabase/server";

export const USER_MEMORY_FILE_REL = "data/user-memory.md";

export interface UserMemoryRecord {
  content_md: string;
  updated_at: string | null;
  file_path: string;
  file_exists: boolean;
}

interface UserMemoryRow {
  id: string;
  content_md: string | null;
  updated_at: string;
}

function getMemoryFileAbs(): string {
  return path.join(getDataDir(), "user-memory.md");
}

function readLocalFallback(): { content_md: string; updated_at: string | null } {
  const p = path.join(getDataDir(), "settings", "user_memory.json");
  try {
    if (!fs.existsSync(p)) return { content_md: "", updated_at: null };
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as { content_md?: string; updated_at?: string | null };
    return { content_md: raw.content_md ?? "", updated_at: raw.updated_at ?? null };
  } catch {
    return { content_md: "", updated_at: null };
  }
}

function writeLocalFallback(content_md: string, updated_at: string): void {
  const p = path.join(getDataDir(), "settings", "user_memory.json");
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ content_md, updated_at }, null, 2), "utf8");
}

async function readStored(): Promise<{ content_md: string; updated_at: string | null }> {
  const supabase = await getSupabase();
  if (supabase) {
    const { data } = await supabase
      .from("user_memory")
      .select("id, content_md, updated_at")
      .limit(1)
      .maybeSingle();
    if (data) {
      return {
        content_md: (data as UserMemoryRow).content_md ?? "",
        updated_at: (data as UserMemoryRow).updated_at ?? null,
      };
    }
  }
  return readLocalFallback();
}

async function writeStored(content_md: string): Promise<string> {
  const updated_at = new Date().toISOString();
  const supabase = await getSupabase();
  if (supabase) {
    const { data: existing } = await supabase
      .from("user_memory")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from("user_memory")
        .update({ content_md, updated_at })
        .eq("id", (existing as { id: string }).id);
      if (error) {
        writeLocalFallback(content_md, updated_at);
      }
    } else {
      const { error } = await supabase
        .from("user_memory")
        .insert({ content_md, updated_at });
      if (error) {
        writeLocalFallback(content_md, updated_at);
      }
    }
  } else {
    writeLocalFallback(content_md, updated_at);
  }
  return updated_at;
}

export async function getUserMemory(): Promise<UserMemoryRecord> {
  const stored = await readStored();
  const abs = getMemoryFileAbs();
  return {
    content_md: stored.content_md ?? "",
    updated_at: stored.updated_at ?? null,
    file_path: USER_MEMORY_FILE_REL,
    file_exists: fs.existsSync(abs),
  };
}

export async function patchUserMemory(content_md: string): Promise<{
  content_md: string;
  updated_at: string;
}> {
  const updated_at = await writeStored(content_md);
  return { content_md, updated_at };
}

/** Before external edit: ensure disk file reflects DB when file missing or DB is newer. */
export async function syncMemoryFileBeforeEdit(): Promise<string> {
  const stored = await readStored();
  const abs = getMemoryFileAbs();
  fs.mkdirSync(path.dirname(abs), { recursive: true });

  const content = stored.content_md ?? "";
  const dbUpdated = stored.updated_at ? Date.parse(stored.updated_at) : 0;
  let shouldWrite = !fs.existsSync(abs);

  if (fs.existsSync(abs)) {
    const stat = fs.statSync(abs);
    shouldWrite = dbUpdated > stat.mtimeMs;
  }

  if (shouldWrite) {
    fs.writeFileSync(abs, content, "utf8");
  }

  return abs;
}

async function readUtf8FileFresh(absPath: string): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return fs.readFileSync(absPath, "utf8");
    } catch (e) {
      lastErr = e;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("read failed");
}

export async function refreshUserMemoryFromFile(): Promise<{
  content_md: string;
  updated_at: string;
}> {
  const abs = getMemoryFileAbs();
  if (!fs.existsSync(abs)) {
    const err = new Error("ERR-MEM-FILE-MISSING") as Error & { code: string };
    err.code = "ERR-MEM-FILE-MISSING";
    throw err;
  }
  const content_md = await readUtf8FileFresh(abs);
  return patchUserMemory(content_md);
}

export async function openUserMemoryFile(): Promise<{ opened_path: string }> {
  if (!isDesktopShellAvailable()) {
    const err = new Error("ERR-DESKTOP-UNAVAILABLE") as Error & { code: string };
    err.code = "ERR-DESKTOP-UNAVAILABLE";
    throw err;
  }

  const abs = await syncMemoryFileBeforeEdit();
  try {
    await openLocalTextFile(abs);
  } catch (e) {
    const err = new Error(
      e instanceof Error ? e.message : "open failed",
    ) as Error & { code: string };
    err.code = "ERR-DESKTOP-OPEN-FAILED";
    throw err;
  }
  return { opened_path: abs };
}
