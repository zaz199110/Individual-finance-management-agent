import type { ModelSlot } from "@/lib/supabase/server";

export type ProviderId = "mimo" | "kimi" | "deepseek" | "zhipu" | "env";

export interface SlotConfig {
  api_base_url: string;
  api_key: string;
  model_name: string;
  provider: ProviderId;
}

function pick(
  primary: Partial<SlotConfig> | null,
  fallback: Partial<SlotConfig> | null,
): SlotConfig | null {
  const usePrimary =
    primary?.api_base_url && primary.api_key && primary.model_name;
  const src = usePrimary ? primary : fallback;
  const url = src?.api_base_url;
  const key = src?.api_key;
  const model = src?.model_name;
  if (!url || !key || !model) return null;
  return {
    api_base_url: url,
    api_key: key,
    model_name: model,
    provider: src?.provider ?? "env",
  };
}

export function listReasoningCandidates(): SlotConfig[] {
  const stack = resolveProviderStack();
  const seen = new Set<string>();
  const out: SlotConfig[] = [];
  for (const cfg of [stack.reasoning, stack.deep]) {
    if (!cfg) continue;
    const key = `${cfg.api_base_url}|${cfg.model_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cfg);
  }
  const deepseek: Partial<SlotConfig> | null =
    process.env.LLM_API_URL && process.env.LLM_API_KEY
      ? {
          api_base_url: process.env.LLM_API_URL,
          api_key: process.env.LLM_API_KEY,
          model_name: process.env.LLM_MODEL_NAME ?? "deepseek-chat",
          provider: "deepseek",
        }
      : null;
  const ds = pick(deepseek, null);
  if (ds) {
    const key = `${ds.api_base_url}|${ds.model_name}`;
    if (!seen.has(key)) out.push(ds);
  }
  return out;
}

/** 本地联调默认栈：推理/深度/多模态 = Mimo v2.5；联网 = 智谱 Search-Std；嵌入 = 可选 Embedding-3 */
export function resolveProviderStack(): Record<ModelSlot, SlotConfig | null> {
  const mimo: Partial<SlotConfig> | null =
    process.env.MIMO_API_URL && process.env.MIMO_API_KEY
      ? {
          api_base_url: process.env.MIMO_API_URL,
          api_key: process.env.MIMO_API_KEY,
          model_name: process.env.MIMO_MODEL_NAME ?? "mimo-v2.5",
          provider: "mimo",
        }
      : null;

  const deepseek: Partial<SlotConfig> | null =
    process.env.LLM_API_URL && process.env.LLM_API_KEY
      ? {
          api_base_url: process.env.LLM_API_URL,
          api_key: process.env.LLM_API_KEY,
          model_name: process.env.LLM_MODEL_NAME ?? "deepseek-chat",
          provider: "deepseek",
        }
      : null;

  const reasoning = pick(mimo, deepseek);

  const zhipuWeb: Partial<SlotConfig> | null =
    process.env.ZHIPU_API_KEY
      ? {
          api_base_url:
            process.env.ZHIPU_WEB_API_URL ?? "https://open.bigmodel.cn/api",
          api_key: process.env.ZHIPU_API_KEY,
          model_name:
            process.env.ZHIPU_WEB_SEARCH_ENGINE ?? "search_std",
          provider: "zhipu",
        }
      : null;

  /** 联网与推理分离，不回落到 Mimo/Kimi */
  const web = pick(zhipuWeb, null);

  /** 深度推理默认与快推理相同（Mimo v2.5） */
  const deep = reasoning;

  /** 图片理解：独立配置 VISION_* env，不自动回退到推理模型（推理模型通常不支持图片输入） */
  const visionCfg: Partial<SlotConfig> | null =
    process.env.VISION_API_URL && process.env.VISION_API_KEY
      ? {
          api_base_url: process.env.VISION_API_URL,
          api_key: process.env.VISION_API_KEY,
          model_name: process.env.VISION_MODEL_NAME ?? "mimo-v2.5",
          provider: (process.env.VISION_PROVIDER as ProviderId) ?? "mimo",
        }
      : null;
  const vision = pick(visionCfg, null);

  const zhipuEmbedding: Partial<SlotConfig> | null =
    process.env.ZHIPU_API_KEY && process.env.ZHIPU_EMBEDDING_MODEL
      ? {
          api_base_url:
            process.env.ZHIPU_EMBEDDING_API_URL ??
            "https://open.bigmodel.cn/api/paas/v4",
          api_key: process.env.ZHIPU_API_KEY,
          model_name: process.env.ZHIPU_EMBEDDING_MODEL,
          provider: "zhipu",
        }
      : null;

  return {
    reasoning,
    deep,
    vision,
    web,
    embedding: pick(zhipuEmbedding, null),
  };
}

export async function probeOpenAICompatible(
  cfg: SlotConfig,
  userMessage = "ping",
): Promise<{ ok: boolean; message: string }> {
  if (cfg.provider === "zhipu" && /^search_/i.test(cfg.model_name)) {
    const { probeZhipuWebSearch } = await import("@/lib/zhipu/web-search");
    return probeZhipuWebSearch({
      api_key: cfg.api_key,
      api_base_url: cfg.api_base_url,
      model_name: cfg.model_name,
    });
  }
  if (cfg.provider === "zhipu" && /^embedding-/i.test(cfg.model_name)) {
    const { probeZhipuEmbedding } = await import("@/lib/zhipu/embedding");
    return probeZhipuEmbedding({
      api_key: cfg.api_key,
      api_base_url: cfg.api_base_url,
      model_name: cfg.model_name,
    });
  }
  const { probeModel } = await import("@/lib/llm/invoke");
  return probeModel(cfg, userMessage);
}

export const MODEL_SLOT_LABELS: Record<ModelSlot, string> = {
  reasoning: "推理模型（快）",
  deep: "深度推理模型",
  vision: "图片理解模型",
  web: "联网搜索",
  embedding: "文本嵌入",
};

export const CHAT_REQUIRED_SLOTS: ModelSlot[] = ["reasoning", "web"];

/** CLI / 设置页共用：探测单个模型槽位 */
export async function probeModelSlot(
  slot: ModelSlot,
): Promise<{ slot: ModelSlot; ok: boolean; message: string; skipped?: boolean }> {
  const stack = resolveProviderStack();
  const cfg = stack[slot];
  if (!cfg) {
    const optional = slot === "embedding";
    return {
      slot,
      ok: false,
      skipped: optional,
      message: optional
        ? "未配置（可选槽位，设置 ZHIPU_EMBEDDING_MODEL 后可用）"
        : "未配置 API 地址或密钥",
    };
  }
  const result = await probeOpenAICompatible(cfg);
  return { slot, ...result };
}

export async function probeAllModelSlots(options?: {
  slots?: ModelSlot[];
}): Promise<
  Array<{ slot: ModelSlot; ok: boolean; message: string; skipped?: boolean }>
> {
  const all: ModelSlot[] = [
    "reasoning",
    "deep",
    "vision",
    "web",
    "embedding",
  ];
  const slots = options?.slots ?? all;
  const results: Array<{
    slot: ModelSlot;
    ok: boolean;
    message: string;
    skipped?: boolean;
  }> = [];
  for (const slot of slots) {
    results.push(await probeModelSlot(slot));
  }
  return results;
}
