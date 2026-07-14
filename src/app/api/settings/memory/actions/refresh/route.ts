import { NextResponse } from "next/server";
import { refreshUserMemoryFromFile } from "@/lib/settings/user-memory";

export async function POST() {
  try {
    const result = await refreshUserMemoryFromFile();
    return NextResponse.json(result);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ERR-MEM-FILE-MISSING") {
      return NextResponse.json({ code }, { status: 404 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "刷新失败" },
      { status: 500 },
    );
  }
}
