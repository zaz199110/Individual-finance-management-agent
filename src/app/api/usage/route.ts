import { NextResponse } from "next/server";
import { buildUsageGuide } from "@/lib/usage/build-usage-guide";

export async function GET() {
  return NextResponse.json(buildUsageGuide());
}
