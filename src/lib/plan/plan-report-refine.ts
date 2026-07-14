import fs from "node:fs";
import { completeText } from "@/lib/llm/invoke";
import { polishReportMarkdown } from "@/lib/reports/report-polish";
import { ensureModelSlot } from "@/lib/supabase/server";

const SECTION3_SYSTEM = `根据公开资讯写 §三 配置思路与市场背景（markdown）。
须含「为什么这样配大类」与「近期市场背景」两小节；禁止承诺收益；可含 https。
不要重复数字表；不要 fund_code。`;

export interface PlanDraftRefineResult {
  ok: boolean;
  refined: boolean;
  skipped?: boolean;
  skip_reason?: string;
  error?: string;
}

function replaceSectionBody(
  md: string,
  heading: string,
  newBody: string,
  nextHeading: string,
): string {
  const startRe = new RegExp(`(## ${heading}\\s*\\n\\n)`);
  const endRe = new RegExp(`\\n## ${nextHeading}`);
  const startMatch = startRe.exec(md);
  if (!startMatch) return md;
  const startIdx = startMatch.index + startMatch[0].length;
  const rest = md.slice(startIdx);
  const endMatch = endRe.exec(rest);
  const endIdx = endMatch ? startIdx + endMatch.index : md.length;
  return md.slice(0, startIdx) + newBody.trim() + "\n\n" + md.slice(endIdx);
}

export async function refinePlanDraftReport(input: {
  draftPath: string;
  section3Draft: string;
  webCitationsSummary?: string;
  allocationRationale?: string;
}): Promise<PlanDraftRefineResult> {
  if (!fs.existsSync(input.draftPath)) {
    return { ok: false, refined: false, error: "草稿不存在。" };
  }

  let md = fs.readFileSync(input.draftPath, "utf8");

  try {
    const reasoning = await ensureModelSlot("reasoning");
    if (!reasoning) {
      return { ok: true, refined: false, skipped: true, skip_reason: "reasoning_unavailable" };
    }

    const cfg = {
      api_base_url: reasoning.api_base_url,
      api_key: reasoning.api_key_encrypted,
      model_name: reasoning.model_name ?? "mimo-v2.5",
      provider: "mimo" as const,
    };

    const s3 = await completeText(cfg, {
      system: SECTION3_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            `【citations】${input.webCitationsSummary ?? ""}`,
            `【rationale】${input.allocationRationale ?? ""}`,
            `【草稿】\n${input.section3Draft}`,
          ].join("\n"),
        },
      ],
      max_tokens: 800,
    });
    if (s3.trim()) {
      md = replaceSectionBody(
        md,
        "配置思路与市场背景",
        s3.trim(),
        "公募基金明细推荐",
      );
    }

    fs.writeFileSync(input.draftPath, md, "utf8");
    polishReportMarkdown(input.draftPath);
    return { ok: true, refined: true };
  } catch (e) {
    return {
      ok: true,
      refined: false,
      error: e instanceof Error ? e.message : "润色失败，已保留规则草稿。",
    };
  }
}
