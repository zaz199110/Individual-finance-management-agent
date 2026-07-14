import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const EXTERNAL_URL_RE = /^https?:\/\//i;

export function isExternalHttpUrl(url: string): boolean {
  return EXTERNAL_URL_RE.test(url.trim());
}

/** Open an http(s) URL in the system default browser. */
export async function openExternalUrl(url: string): Promise<void> {
  const trimmed = url.trim();
  if (!isExternalHttpUrl(trimmed)) {
    throw new Error("ERR-URL-INVALID");
  }

  const platform = process.platform;
  if (platform === "win32") {
    await execFileAsync("cmd", ["/c", "start", "", trimmed], { windowsHide: true });
    return;
  }
  if (platform === "darwin") {
    await execFileAsync("open", [trimmed]);
    return;
  }
  await execFileAsync("xdg-open", [trimmed]);
}
