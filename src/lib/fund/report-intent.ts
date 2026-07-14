import { getSupabase } from "@/lib/supabase/server";
import { DEMO_FUND_CODE, resolveFundCode } from "./lookup";

/** 触发 fund_full_report 全流程（含模式 B 下重新生成） */
export function isFundFullReportIntent(text: string): boolean {
  return /解读|报告|完整|出具|深度解读|fund_full|重新生成|重新跑|重跑|再跑一遍|重新出具|重新发起/i.test(
    text.trim(),
  );
}

/** 模式 B 下「重新跑/重新生成」类表述（常不带基金代码） */
export function isFundRegenerateIntent(text: string): boolean {
  return /重新生成|重新跑|重跑|再跑一遍|重新出具|重新发起/i.test(text.trim());
}

/** 完整报告流程解析基金代码：消息 → 待确认草稿 → 样例 → 默认演示码 */
export async function resolveFundCodeForFullReport(
  text: string,
  conversationId?: string,
): Promise<string> {
  const fromText = resolveFundCode(text);
  if (fromText) return fromText;
  if (/样例/.test(text)) return DEMO_FUND_CODE;

  if (conversationId) {
    const supabase = await getSupabase();
    if (supabase) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("metadata")
        .eq("id", conversationId)
        .maybeSingle();
      const draft = (conv?.metadata as Record<string, unknown> | null)
        ?.pending_report_draft as { fund_code?: string } | undefined;
      if (draft?.fund_code && /^\d{6}$/.test(draft.fund_code)) {
        return draft.fund_code;
      }
    }
  }

  return DEMO_FUND_CODE;
}
