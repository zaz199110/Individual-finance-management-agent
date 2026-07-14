import fs from "node:fs";
import path from "node:path";
import { getProjectRoot } from "@/lib/paths";
import { getSkillById, listSkills } from "@/harness/registry/load";
import type { SceneId } from "@/harness/registry/load";

const cache = new Map<string, string>();

export function loadSkillContent(skillId: string): string | null {
  if (cache.has(skillId)) return cache.get(skillId)!;

  const skill = getSkillById(skillId);
  if (!skill) return null;

  const fullPath = path.join(getProjectRoot(), skill.path);
  if (!fs.existsSync(fullPath)) return null;

  const content = fs.readFileSync(fullPath, "utf8");
  cache.set(skillId, content);
  return content;
}

/** Lazy load skill index for Planner — title + first section only. */
export function loadSkillIndex(scene: SceneId): string {
  const skills = listSkills(scene);
  return skills
    .map((s) => {
      const body = loadSkillContent(s.id);
      const preview = body
        ? body.replace(/^#+\s.*$/m, "").trim().slice(0, 200)
        : "";
      return `- ${s.id}：${s.description_zh}\n  ${preview}…`;
    })
    .join("\n");
}

export function clearSkillCache(): void {
  cache.clear();
}
