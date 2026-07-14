import { spawnSync } from "node:child_process";

function pythonWorks(parts: string[]): boolean {
  const [exe, ...args] = parts;
  const result = spawnSync(exe, [...args, "--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0;
}

/** argv prefix for `spawn(exe, [...prefix, script, ...args])` */
export function resolvePythonCommand(): string[] {
  const candidates =
    process.platform === "win32"
      ? [["python"], ["py", "-3"], ["python3"]]
      : [["python3"], ["python"]];

  for (const parts of candidates) {
    if (pythonWorks(parts)) return parts;
  }

  return process.platform === "win32" ? ["python"] : ["python3"];
}

export function runPythonScript(
  scriptPath: string,
  args: string[] = [],
  cwd?: string,
): void {
  const prefix = resolvePythonCommand();
  const result = spawnSync(prefix[0], [...prefix.slice(1), scriptPath, ...args], {
    cwd,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`Python script failed: ${scriptPath} (exit ${result.status ?? 1})`);
  }
}
