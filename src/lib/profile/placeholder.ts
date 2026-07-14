import type { ProfileReadResult } from "./types";

export interface ProfilePlaceholder {
  scene: "profile";
  title: string;
  empty_body: string;
  hint: string;
}

export function buildProfilePlaceholderHint(
  read: ProfileReadResult,
  hasUnconfirmed?: boolean,
): string {
  if (!read.has_basic_info) {
    return "请告诉我您的年龄、收入、家庭情况，以及这笔钱打算做什么。";
  }
  if (read.eligible_groups.length > 0 || read.incomplete_groups.length > 0) {
    return "需求已整理好，回复「生成报告」生成报告，或告诉我需要修改的地方。";
  }
  return "基本情况已记录。请前往「当前画像」页复制场景示例，按实际情况修改后发送。";
}

export function buildProfilePlaceholder(read: ProfileReadResult): ProfilePlaceholder {
  const hint = buildProfilePlaceholderHint(read);

  if (!read.has_basic_info) {
    return {
      scene: "profile",
      title: "先聊聊您的基本情况",
      empty_body: "请告诉我您的年龄、收入、家庭情况，以及这笔钱打算做什么。",
      hint,
    };
  }

  if (read.eligible_groups.length > 0 || read.incomplete_groups.length > 0) {
    return {
      scene: "profile",
      title: "需求已整理好",
      empty_body: "需求已整理好，回复「生成报告」生成报告，或告诉我需要修改的地方。",
      hint,
    };
  }

  return {
    scene: "profile",
    title: "基本情况已记录",
    empty_body: "基本情况已记录。请前往「当前画像」页复制场景示例，按实际情况修改后发送。",
    hint,
  };
}
