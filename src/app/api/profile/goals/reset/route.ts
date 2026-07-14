import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { resetGoalConstraints } from "@/lib/profile/reset-goals";

export async function POST(req: Request) {
  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "数据库未连接。" }, { status: 503 });
    }

    const body = (await req.json().catch(() => ({}))) as { goal_type?: string };

    const result = await resetGoalConstraints(supabase, {
      goal_type: body.goal_type,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "重置投资需求失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
