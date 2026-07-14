import { textParseHoldings } from "@/lib/portfolio/text-parse";
import type { HoldingsPosition } from "@/lib/portfolio/types";

export interface TextParseResult {
  ok: boolean;
  source: "text";
  positions: HoldingsPosition[];
  missing_fields: string[];
  preview: string;
  error?: string;
}

export async function runHoldingsTextParse(input: {
  user_text: string;
}): Promise<TextParseResult> {
  return textParseHoldings({ user_text: input.user_text });
}
