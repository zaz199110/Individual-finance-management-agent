import { getSupabase } from "@/lib/supabase/server";
import { holdingsRead } from "@/lib/portfolio/read";

export async function runHoldingsRead(): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  const supabase = await getSupabase();
  const result = await holdingsRead(supabase);
  return {
    ok: true,
    preview: result.summary,
    data: result,
  };
}
