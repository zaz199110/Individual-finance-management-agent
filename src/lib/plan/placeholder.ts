import type { ProfileReadResult } from "@/lib/profile/types";

export interface PlanPlaceholder {
  scene: "plan";
  title: string;
  empty_body: string;
  hint: string;
  n: number;
  eligible_groups: ProfileReadResult["eligible_groups"];
}

/** N=0：不可用才说明原因，并给出下一步 */
export function buildPlanBlockedBody(_read: ProfileReadResult): string {
  return "请先完成投资需求的整理";
}

function buildPlanBlockedHint(_read: ProfileReadResult): string {
  return "请先到「需求梳理」完成投资需求的整理";
}

export function buildPlanBlockedReply(read: ProfileReadResult): string {
  return buildPlanBlockedBody(read);
}

export function buildPlanPlaceholderHint(read: ProfileReadResult): string {
  const n = read.eligible_groups.length;
  if (n === 0) return buildPlanBlockedHint(read);
  if (n === 1) {
    return `可直接说「开始生成方案」，为「${read.eligible_groups[0]!.display_name}」出配置建议。`;
  }
  return "请先告诉我要为哪一组出方案，例如「先给养老做方案」。";
}

export function buildPlanPlaceholder(read: ProfileReadResult): PlanPlaceholder {
  const n = read.eligible_groups.length;
  const names = read.eligible_groups.map((g) => g.display_name).join(" · ");

  if (n === 0) {
    return {
      scene: "plan",
      title: "生成资产配置方案",
      empty_body: buildPlanBlockedBody(read),
      hint: buildPlanBlockedHint(read),
      n: 0,
      eligible_groups: [],
    };
  }

  if (n === 1) {
    const name = read.eligible_groups[0]!.display_name;
    return {
      scene: "plan",
      title: `为「${name}」出配置方案`,
      empty_body: `已有投资需求，可说「开始生成方案」为「${name}」出配置建议`,
      hint: `可直接说「开始生成方案」，为「${name}」出配置建议。`,
      n: 1,
      eligible_groups: read.eligible_groups,
    };
  }

  return {
    scene: "plan",
    title: "选择要为哪组出方案",
    empty_body: `已有投资需求，可选择投资场景，生成资产配置方案`,
    hint: `可选：${names}`,
    n,
    eligible_groups: read.eligible_groups,
  };
}
