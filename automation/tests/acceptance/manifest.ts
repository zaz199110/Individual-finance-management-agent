/** PRD 验收用例索引 — 每条对应一个自动化测试 id */

export interface AcceptanceCase {
  id: string;
  ref: string;
  title: string;
  /** unit | integration | live-api */
  tier: "unit" | "integration" | "live-api";
}

export const ACCEPTANCE_CASES: AcceptanceCase[] = [
  { id: "REG-01", ref: "05-chat-qa §5.15.3", title: "registry validate", tier: "unit" },
  { id: "REG-02", ref: "05-chat-qa §5.15.3", title: "list_commands chat slash", tier: "unit" },
  { id: "SET-MIMO-01", ref: "02-settings §2.7.1-1", title: "Mimo 推理探针", tier: "live-api" },
  { id: "SET-MIMO-DEEP", ref: "02-settings §2.7.1-3", title: "Mimo 深度推理与快推理同栈", tier: "unit" },
  { id: "SET-ZHIPU-WEB", ref: "02-settings §2.7.1-2", title: "智谱 Search-Std 联网探针", tier: "live-api" },
  { id: "SET-MIMO-VISION", ref: "02-settings §2.7.1-4", title: "Mimo 多模态 Vision 探针", tier: "live-api" },
  { id: "SET-ZHIPU-EMB", ref: "02-settings §2.7.1-5", title: "智谱 Embedding-3 探针", tier: "live-api" },
  { id: "SET-SUPA-01", ref: "02-settings §2.7.1-6", title: "Supabase 连接", tier: "live-api" },
  { id: "SET-READINESS", ref: "02-settings §2.0.2", title: "readiness chat_ready", tier: "integration" },
  { id: "PLAN-Q2", ref: "05-chat-qa Q2", title: "最大回撤 simple_qa", tier: "unit" },
  { id: "PLAN-Q6", ref: "05-chat-qa Q6", title: "你能做什么", tier: "unit" },
  { id: "PLAN-Q4", ref: "05-chat-qa Q4", title: "理财规划 handoff", tier: "unit" },
  { id: "PLAN-D2", ref: "05-chat-shared D2", title: "持仓 Tab 短问", tier: "unit" },
  { id: "PLAN-PROFILE", ref: "06-profile", title: "profile scene_task", tier: "unit" },
  { id: "PROMPT-COMPLIANCE", ref: "PRD §0.7", title: "合规注入 system", tier: "unit" },
  { id: "CHAT-STREAM-Q6", ref: "05-chat-qa Q6", title: "Harness 能力介绍闭环", tier: "integration" },
  { id: "CHAT-STREAM-Q2", ref: "05-chat-qa Q2", title: "Harness 短问闭环", tier: "integration" },
  { id: "CLI-PROBE-01", ref: "02-settings §2.2.4", title: "模型探针 CLI 与 API 同源", tier: "integration" },
];
