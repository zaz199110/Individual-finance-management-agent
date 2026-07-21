import path from "node:path";

/** Project root (encoding-kit / agent-demo-app). */
export function getProjectRoot(): string {
  return process.cwd();
}

export function getDataDir(): string {
  return path.join(getProjectRoot(), "data");
}

export function getRunsDir(): string {
  return path.join(getDataDir(), "runs");
}

export function getRegistryPath(): string {
  return path.join(getProjectRoot(), "app-config", "registry.yaml");
}
