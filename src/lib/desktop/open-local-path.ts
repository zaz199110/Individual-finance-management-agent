import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import { getDataDir } from "@/lib/paths";

const execFileAsync = promisify(execFile);

/** Local dev / desktop shell has writable data dir and is not serverless-only. */
export function isDesktopShellAvailable(): boolean {
  if (process.env.VERCEL === "1") return false;
  try {
    const dir = getDataDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return fs.existsSync(dir);
  } catch {
    return false;
  }
}

/** Open a folder or non-text file with the OS default handler (Explorer, Finder, …). */
export async function openLocalPath(absPath: string): Promise<void> {
  const platform = process.platform;
  if (platform === "win32") {
    // explorer.exe always opens a new visible window; avoids cmd /c start quirks
    await execFileAsync("explorer", [absPath]);
    return;
  }
  if (platform === "darwin") {
    await execFileAsync("open", [absPath]);
    return;
  }
  await execFileAsync("xdg-open", [absPath]);
}

/**
 * Open a local text/markdown file in the system text editor.
 * Windows: Notepad (记事本) — avoids broken .md file associations.
 */
export async function openLocalTextFile(absPath: string): Promise<void> {
  const platform = process.platform;
  if (platform === "win32") {
    // `start` uses ShellExecute (shows on the interactive desktop). Direct notepad.exe or
    // detached spawn from a Node server often returns immediately but never surfaces a window.
    await execFileAsync(
      "cmd",
      ["/c", "start", "", "notepad.exe", absPath],
      { windowsHide: true },
    );
    return;
  }
  if (platform === "darwin") {
    await execFileAsync("open", ["-t", absPath]);
    return;
  }
  await execFileAsync("xdg-open", [absPath]);
}
