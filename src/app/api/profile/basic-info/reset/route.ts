import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "数据库未连接。" }, { status: 503 });
    }

    const { data: profile } = await supabase
      .from("profile_versions")
      .select("id")
      .eq("is_current", true)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json(
        { error: "未找到当前画像版本。" },
        { status: 404 },
      );
    }

    const { error } = await supabase
      .from("profile_versions")
      .update({ basic_info: {}, updated_at: new Date().toISOString() })
      .eq("id", profile.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "已清空个人信息。" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "重置个人信息失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
