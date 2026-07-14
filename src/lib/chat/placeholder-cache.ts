import type { SceneId } from "@/harness/registry/load";

export interface ScenePlaceholderData {
  title?: string;
  body?: string;
  hint?: string;
}

const TTL_MS = 60_000;
const cache = new Map<SceneId, { data: ScenePlaceholderData; at: number }>();

function mapApiPayload(d: Record<string, unknown>): ScenePlaceholderData {
  return {
    title: typeof d.title === "string" ? d.title : undefined,
    body: typeof d.empty_body === "string" ? d.empty_body : undefined,
    hint: typeof d.hint === "string" ? d.hint : undefined,
  };
}

export async function fetchScenePlaceholder(
  scene: SceneId,
): Promise<ScenePlaceholderData> {
  const hit = cache.get(scene);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const res = await fetch(`/api/placeholder?scene=${scene}`);
  const data = mapApiPayload((await res.json()) as Record<string, unknown>);
  cache.set(scene, { data, at: Date.now() });
  return data;
}

export function invalidateScenePlaceholder(scene?: SceneId): void {
  if (scene) cache.delete(scene);
  else cache.clear();
}
