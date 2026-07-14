import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  getSupabase: vi.fn(async () => null),
}));

describe("user-memory", () => {
  let tmpDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "user-memory-"));
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("refresh reads file and persists to local fallback", async () => {
    const filePath = path.join(tmpDir, "data", "user-memory.md");
    fs.writeFileSync(filePath, "请用简短分点回答。", "utf8");

    const { refreshUserMemoryFromFile, getUserMemory } = await import(
      "@/lib/settings/user-memory"
    );
    const refreshed = await refreshUserMemoryFromFile();
    expect(refreshed.content_md).toBe("请用简短分点回答。");

    const memory = await getUserMemory();
    expect(memory.content_md).toBe("请用简短分点回答。");
    expect(memory.file_exists).toBe(true);
  });

  it("refresh throws ERR-MEM-FILE-MISSING when file absent", async () => {
    const { refreshUserMemoryFromFile } = await import("@/lib/settings/user-memory");
    await expect(refreshUserMemoryFromFile()).rejects.toMatchObject({
      code: "ERR-MEM-FILE-MISSING",
    });
  });

  it("syncMemoryFileBeforeEdit writes DB content to disk", async () => {
    const { patchUserMemory, syncMemoryFileBeforeEdit } = await import(
      "@/lib/settings/user-memory"
    );
    await patchUserMemory("语气友好");

    const abs = await syncMemoryFileBeforeEdit();
    expect(fs.readFileSync(abs, "utf8")).toBe("语气友好");
  });
});
