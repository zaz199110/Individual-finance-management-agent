import { NextRequest, NextResponse } from "next/server";
import {
  getPublicDataSourceSettings,
  patchDataSourceSettings,
} from "@/lib/settings/datasources";

export async function GET() {
  const datasources = await getPublicDataSourceSettings();
  return NextResponse.json({ datasources });
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      tushare_token?: string | null;
      clear_tushare_token?: boolean;
    };
    if (
      body.tushare_token === undefined &&
      !body.clear_tushare_token
    ) {
      const datasources = await getPublicDataSourceSettings();
      return NextResponse.json({ datasources });
    }
    await patchDataSourceSettings(body);
    return NextResponse.json({ datasources: await getPublicDataSourceSettings() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "保存失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
