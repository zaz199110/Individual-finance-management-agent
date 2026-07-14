import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  getSupabase: vi.fn(async () => null),
}));

describe("embedding settings", () => {
  let tmpDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "embedding-settings-"));
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    fs.mkdirSync(path.join(tmpDir, "data"), { recursive: true });
  });

  afterEach(async () => {
    cwdSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("can disable rerank via settings flag", async () => {
    const { setEmbeddingFilterEnabled, getEmbeddingFilterSettings, isEmbeddingRerankEnabled } =
      await import("./settings");
    await setEmbeddingFilterEnabled(false);
    const s = await getEmbeddingFilterSettings();
    expect(s.enabled).toBe(false);
    expect(await isEmbeddingRerankEnabled()).toBe(false);
  });

  it("re-enables after toggle back", async () => {
    const { setEmbeddingFilterEnabled, getEmbeddingFilterSettings } = await import("./settings");
    await setEmbeddingFilterEnabled(false);
    await setEmbeddingFilterEnabled(true);
    const s = await getEmbeddingFilterSettings();
    expect(s.enabled).toBe(true);
  });
});
