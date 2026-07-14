import { profileParseBasicInfo } from "@/lib/profile/profile-parse";

export async function runProfileParse(input: Record<string, unknown>): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const result = await profileParseBasicInfo({
    text: typeof input.text === "string" ? input.text : undefined,
    basic_info: input.basic_info,
  });

  if (!result.ok || !result.basic_info) {
    return { ok: false, preview: "", error: result.error };
  }

  return {
    ok: true,
    preview: `已整理基本情况：${result.basic_info.name}，${result.basic_info.age} 岁`,
    data: { basic_info: result.basic_info, warnings: result.warnings },
  };
}
