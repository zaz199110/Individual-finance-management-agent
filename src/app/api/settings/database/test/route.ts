import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  resolveDatabaseCredentials,
  updateDatabaseCheck,
} from "@/lib/settings/database";

export async function POST() {
  const creds = await resolveDatabaseCredentials();
  if (!creds?.supabase_url || !creds.anon_key) {
    return NextResponse.json({
      ok: false,
      message: "请先填写并保存项目地址与访问密钥。",
    });
  }

  try {
    const client = createClient(creds.supabase_url, creds.anon_key, {
      auth: { persistSession: false },
    });
    const { error } = await client.from("conversations").select("id").limit(1);

    if (error && !error.message.includes("does not exist")) {
      await updateDatabaseCheck({ status: "failed", error_message: error.message });
      return NextResponse.json({
        ok: false,
        message: `连接失败：${error.message}`,
      });
    }

    await updateDatabaseCheck({ status: "passed", error_message: null });
    return NextResponse.json({ ok: true, message: "连接正常，可以保存投资数据。" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "连接失败";
    await updateDatabaseCheck({ status: "failed", error_message: message });
    return NextResponse.json({ ok: false, message });
  }
}
