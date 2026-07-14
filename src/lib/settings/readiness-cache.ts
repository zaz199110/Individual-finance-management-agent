import type { ReadinessResult } from "@/lib/settings/readiness";

const STORAGE_KEY = "agent-demo.readiness.v1";

export type CachedReadiness = Pick<
  ReadinessResult,
  "models" | "database" | "banners"
>;

export function getCachedReadiness(): CachedReadiness | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedReadiness;
    if (!parsed?.models || !parsed?.database) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeReadinessCache(readiness: ReadinessResult): void {
  if (typeof window === "undefined") return;
  try {
    const payload: CachedReadiness = {
      models: readiness.models,
      database: readiness.database,
      banners: readiness.banners,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota or private mode — ignore */
  }
}

export function clearReadinessCache(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
