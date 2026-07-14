import fs from "node:fs";
import yaml from "js-yaml";
import { getRegistryPath } from "@/lib/paths";

export type SceneId = "chat" | "profile" | "plan" | "portfolio" | "fund";

export type CommandType = "read" | "propose" | "write" | "meta" | "ops";

export interface RegistryAgent {
  id: string;
  description_zh: string;
}

export interface RegistrySkill {
  id: string;
  scene: SceneId;
  path: string;
  description_zh: string;
}

export interface RegistryCommand {
  id: string;
  description_zh: string;
  type: CommandType;
  scenes: SceneId[];
  slash_completion?: boolean;
  harness_tool?: string;
  requires_confirm?: boolean;
  fund_domain?: string;
}

export interface AgentRegistry {
  version: string;
  updated: string;
  command_types: Record<string, string>;
  agents: {
    scene: RegistryAgent[];
    infra: RegistryAgent[];
  };
  skills: RegistrySkill[];
  commands: RegistryCommand[];
  cli_commands?: Array<{
    id: string;
    cli: string;
    description_zh: string;
    type: CommandType;
    fund_domain?: string;
  }>;
  usage_pages?: Record<
    string,
    {
      title: string;
      groups: Array<{
        title: string;
        command_ids?: string[];
        cli_command_ids?: string[];
      }>;
    }
  >;
}

let cachedRegistry: AgentRegistry | null = null;

export function loadRegistry(): AgentRegistry {
  if (cachedRegistry) return cachedRegistry;
  const raw = fs.readFileSync(getRegistryPath(), "utf8");
  cachedRegistry = yaml.load(raw) as AgentRegistry;
  return cachedRegistry;
}

export function clearRegistryCache(): void {
  cachedRegistry = null;
}

export function listAgents(): {
  scene: RegistryAgent[];
  infra: RegistryAgent[];
} {
  return loadRegistry().agents;
}

export function listSkills(scene?: SceneId): RegistrySkill[] {
  const skills = loadRegistry().skills;
  if (!scene) return skills;
  return skills.filter((s) => s.scene === scene);
}

export interface ListedCommand {
  id: string;
  description_zh: string;
  type: CommandType;
  type_label_zh: string;
  scenes: SceneId[];
  slash_completion: boolean;
  harness_tool: string;
  requires_confirm?: boolean;
}

export function listCommands(options?: {
  scene?: SceneId;
  slashOnly?: boolean;
}): ListedCommand[] {
  const registry = loadRegistry();
  let commands = registry.commands;

  if (options?.scene) {
    commands = commands.filter((c) => c.scenes.includes(options.scene!));
  }
  if (options?.slashOnly) {
    commands = commands.filter((c) => c.slash_completion === true);
  }

  return commands.map((c) => ({
    id: c.id,
    description_zh: c.description_zh,
    type: c.type,
    type_label_zh: registry.command_types[c.type] ?? c.type,
    scenes: c.scenes,
    slash_completion: c.slash_completion ?? false,
    harness_tool: c.harness_tool ?? c.id,
    requires_confirm: c.requires_confirm,
  }));
}

export function getCommandById(id: string): RegistryCommand | undefined {
  return loadRegistry().commands.find((c) => c.id === id);
}

export function getSkillById(id: string): RegistrySkill | undefined {
  return loadRegistry().skills.find((s) => s.id === id);
}

export function getSceneHandlerId(scene: SceneId): string {
  return `scene_${scene}`;
}
