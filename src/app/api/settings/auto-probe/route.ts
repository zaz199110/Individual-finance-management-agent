import { NextRequest, NextResponse } from "next/server";
import { ensureEnvDefaultsProbed } from "@/lib/settings/auto-probe";

export async function POST(request: NextRequest) {
  let force = false;
  try {
    const body = (await request.json()) as { force?: boolean };
    if (body.force === false) force = false;
  } catch {
    /* empty body defaults to force */
  }
  const summary = await ensureEnvDefaultsProbed({ force });
  return NextResponse.json(summary);
}
