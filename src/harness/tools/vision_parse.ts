import type { SlotConfig } from "@/lib/config/model-providers";
import { completeVision } from "@/lib/llm/vision";
import { buildModelProbeConfig } from "@/lib/settings/model-probe";
import type { HoldingsPosition } from "@/lib/portfolio/types";

export interface VisionParseResult {
  ok: boolean;
  source: "demo" | "vision" | "empty";
  positions: HoldingsPosition[];
  missing_fields: string[];
  image_count: number;
  preview: string;
  error?: string;
}

async function resolveVisionConfig(): Promise<SlotConfig | null> {
  const { resolveModelSlot } = await import("@/lib/supabase/server");
  const { resolveProviderStack } = await import("@/lib/config/model-providers");

  const row = await resolveModelSlot("vision");
  if (row) {
    const cfg = buildModelProbeConfig("vision", row);
    if (cfg) return cfg;
  }

  const stack = resolveProviderStack();
  return stack.vision ?? null;
}

/**
 * D2: 生产级 Vision 持仓截图识别
 * 支持 URL 和 base64 data URL；兼容 OpenAI 与 Anthropic（Mimo）协议
 */
export async function callVisionModel(
  imageUrls: string[],
  hint: string,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  const cfg = await resolveVisionConfig();
  if (!cfg?.api_key || !cfg.api_base_url) {
    return { ok: false, error: "Vision 模型未配置。" };
  }

  const prompt =
    "你是中国公募基金持仓截图识别助手。请仔细识别图片中的基金持仓信息。\n\n" +
    "输出要求：\n" +
    "- 输出一个 JSON 数组，不要 markdown 代码围栏\n" +
    "- 每项包含：fund_code（6位基金代码，必须准确）、fund_name（基金名称）、invested_at（买入日期 YYYY-MM-DD，识别不到则填 null）、paid_amount（买入支付金额，单位元，识别不到则填 null）、shares（持有份额，可选）\n" +
    "- 如果图片包含多只基金，请全部识别\n" +
    "- 基金代码务必仔细核对，不要猜测\n" +
    "- 金额保留原始数字，不要加逗号\n" +
    (hint ? `\n用户补充说明：${hint}` : "");

  return completeVision(cfg, {
    text: prompt,
    imageUrls,
    max_tokens: 3000,
    temperature: 0.1,
  });
}

/** FK-FMT-01：披露图片 OCR → Markdown 正文 */
export async function callVisionDocumentOcr(
  imageDataUrl: string,
  filenameHint?: string,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  const cfg = await resolveVisionConfig();
  if (!cfg?.api_key || !cfg.api_base_url) {
    return { ok: false, error: "Vision 模型未配置。" };
  }

  const prompt =
    "你是基金披露文档 OCR 助手。将图片中的文字完整转录为 Markdown，表格用 markdown table 语法。仅输出正文，不要解释或代码围栏。" +
    (filenameHint ? `\n文件名：${filenameHint}` : "");

  return completeVision(cfg, {
    text: prompt,
    imageUrls: [imageDataUrl],
    max_tokens: 4000,
    temperature: 0.1,
  });
}

function parsePositionsJson(text: string): HoldingsPosition[] {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  const raw = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
  return raw
    .map((row) => ({
      fund_code: String(row.fund_code ?? "").padStart(6, "0").slice(-6),
      fund_name: row.fund_name ? String(row.fund_name) : undefined,
      invested_at: row.invested_at ? String(row.invested_at) : "1970-01-01",
      paid_amount: Number(row.paid_amount ?? 0),
      shares: Number(row.shares ?? 0),
    }))
    .filter((p) => /^\d{6}$/.test(p.fund_code));
}

/** 自由问答等场景的通用图片理解（非持仓 JSON 解析） */
export async function callVisionGeneralQa(
  imageUrls: string[],
  userQuestion: string,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  const cfg = await resolveVisionConfig();
  if (!cfg?.api_key || !cfg.api_base_url) {
    return { ok: false, error: "Vision 模型未配置。" };
  }

  const question = userQuestion.trim();
  const prompt = question
    ? `用户上传了图片并提问：${question}\n请识别图片中的文字与关键信息，结合问题用简洁中文作答。`
    : "用户上传了图片但未附加文字。请识别图片内容，用简洁中文说明图中与理财、基金或投资相关的重要信息；若无相关内容，请客观描述图片。";

  return completeVision(cfg, {
    text: prompt,
    imageUrls,
    max_tokens: 2000,
    temperature: 0.2,
  });
}

export async function visionParseHoldings(input: {
  image_urls?: string[];
  image_url?: string;
  demo?: boolean;
  user_hint?: string;
}): Promise<VisionParseResult> {
  const urls = [
    ...(input.image_urls ?? []),
    ...(input.image_url ? [input.image_url] : []),
  ].filter(Boolean);

  if (urls.length === 0) {
    return {
      ok: false,
      source: "empty",
      positions: [],
      missing_fields: [],
      image_count: 0,
      preview: "",
      error: "请上传持仓截图（支持 JPG/PNG/WebP，单次最多 20 张），或直接文字描述持仓。",
    };
  }

  const vision = await callVisionModel(urls, input.user_hint ?? "");
  if (!vision.ok || !vision.text) {
    return {
      ok: false,
      source: "vision",
      positions: [],
      missing_fields: [],
      image_count: urls.length,
      preview: "",
      error: vision.error ?? "截图识别失败，请确保图片清晰并包含基金代码，或改用手输描述持仓。",
    };
  }

  const positions = parsePositionsJson(vision.text);
  const missing_fields: string[] = [];
  for (const p of positions) {
    if (!p.paid_amount || p.paid_amount <= 0) missing_fields.push(`${p.fund_code}:paid_amount`);
    if (!p.invested_at || p.invested_at === "1970-01-01") missing_fields.push(`${p.fund_code}:invested_at`);
  }

  return {
    ok: positions.length > 0,
    source: "vision",
    positions,
    missing_fields,
    image_count: urls.length,
    preview:
      positions.length > 0
        ? `从 ${urls.length} 张截图识别到 ${positions.length} 笔持仓。` +
          (missing_fields.length ? ` 待补全：${missing_fields.join("、")}` : "")
        : "未能从截图解析出有效持仓。",
    error: positions.length ? undefined : "未能从截图解析出有效持仓。请确认图片包含基金代码（6位数字），或直接文字描述您的持仓。",
  };
}
