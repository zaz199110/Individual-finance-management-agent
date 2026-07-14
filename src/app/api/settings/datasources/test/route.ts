import { NextRequest, NextResponse } from "next/server";
import { testAkShareConnectivity } from "@/lib/l0/akshare-client";
import { testTushareToken } from "@/lib/l0/tushare-client";
import {
  getDataSourceSettings,
  resolveTushareToken,
  updateDataSourceCheck,
} from "@/lib/settings/datasources";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { provider?: string };
  const provider = body.provider;

  if (provider === "tushare") {
    const token = await resolveTushareToken();
    if (!token) {
      return NextResponse.json({
        ok: false,
        message: "请先填写并保存 Tushare Token。",
      });
    }
    try {
      await testTushareToken(token);
      await updateDataSourceCheck({ provider: "tushare", status: "passed" });
      return NextResponse.json({
        ok: true,
        message: "已通过检测，Tushare 可正常使用。",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Tushare 检测失败";
      await updateDataSourceCheck({
        provider: "tushare",
        status: "failed",
        error_message: msg,
      });
      return NextResponse.json({ ok: false, message: msg });
    }
  }

  if (provider === "akshare") {
    try {
      await testAkShareConnectivity();
      await updateDataSourceCheck({ provider: "akshare", status: "passed" });
      return NextResponse.json({
        ok: true,
        message: "AKShare 连通正常，可作为备用数据源。",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AKShare 暂不可用";
      await updateDataSourceCheck({
        provider: "akshare",
        status: "failed",
        error_message: msg,
      });
      return NextResponse.json({
        ok: false,
        message: "AKShare 暂不可用，请检查网络；基金行情将依赖联网搜索兜底。",
      });
    }
  }

  const settings = await getDataSourceSettings();
  return NextResponse.json(
    { ok: false, message: "未知 provider", datasources: settings },
    { status: 400 },
  );
}
