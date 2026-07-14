import type { SceneId } from "@/harness/registry/load";

export type ToolPermission = "allow" | "deny" | "needs_confirm";

const WRITE_TOOLS = new Set([
  "profile_confirm",
  "profile_reset_goals",
  "plan_confirm",
  "holdings_confirm",
  "report_publish",
  "report_overlay_patch",
]);

const READ_TOOLS = new Set([
  "web_search",
  "vision_parse",
  "report_read",
  "artifact_read",
  "profile_read",
  "plan_read",
  "holdings_read",
  "fund_lookup",
  "fund_knowledge_explore",
  "fund_knowledge_semantic_search",
  "compact",
  "report_verify",
]);

export function checkToolPermission(
  toolName: string,
  scene: SceneId,
  options?: { hasConfirmToken?: boolean },
): { permission: ToolPermission; reason?: string } {
  if (WRITE_TOOLS.has(toolName)) {
    if (!options?.hasConfirmToken) {
      return { permission: "needs_confirm", reason: "写操作需要用户确认。" };
    }
    return { permission: "allow" };
  }

  if (READ_TOOLS.has(toolName) || toolName.startsWith("list_")) {
    return { permission: "allow" };
  }

  // Unknown tools denied by default in chat scene write paths
  if (scene === "chat" && toolName.includes("propose")) {
    return { permission: "deny", reason: "chat 场景不允许 propose 写路径。" };
  }

  return { permission: "allow" };
}
