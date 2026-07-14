import { getSupabase } from "@/lib/supabase/server";
import { formatProfileStatusSummary, profileRead } from "@/lib/profile/read";

export async function runProfileRead(): Promise<{
  ok: boolean;
  preview: string;
  data?: Awaited<ReturnType<typeof profileRead>>;
  error?: string;
}> {
  const supabase = await getSupabase();
  const data = await profileRead(supabase);
  const lines = [
    data.has_basic_info
      ? `基本情况：${data.basic_info_summary ?? "已保存"}`
      : "尚未保存基本情况。",
  ];
  if (data.has_basic_info) {
    lines.push(formatProfileStatusSummary(data));
  }
  return { ok: true, preview: lines.join("\n"), data };
}
