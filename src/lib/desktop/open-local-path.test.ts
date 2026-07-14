import { afterEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.hoisted(() =>
  vi.fn((_cmd: string, _args: string[], _opts: unknown, cb?: (err: null) => void) => {
    const callback = typeof _opts === "function" ? _opts : cb;
    callback?.(null);
  }),
);

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

describe("openLocalTextFile", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    execFileMock.mockClear();
    vi.resetModules();
  });

  it("uses cmd start notepad.exe on Windows", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const { openLocalTextFile } = await import("@/lib/desktop/open-local-path");
    await openLocalTextFile("D:\\proj\\data\\user-memory.md");
    expect(execFileMock).toHaveBeenCalledWith(
      "cmd",
      ["/c", "start", "", "notepad.exe", "D:\\proj\\data\\user-memory.md"],
      { windowsHide: true },
      expect.any(Function),
    );
  });

  it("uses TextEdit on macOS", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const { openLocalTextFile } = await import("@/lib/desktop/open-local-path");
    await openLocalTextFile("/tmp/note.md");
    expect(execFileMock).toHaveBeenCalledWith(
      "open",
      ["-t", "/tmp/note.md"],
      expect.any(Function),
    );
  });
});
