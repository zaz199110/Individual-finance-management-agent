import { NextResponse } from "next/server";
import { getReadiness } from "@/lib/settings/readiness";

export async function GET() {
  const readiness = await getReadiness();
  return NextResponse.json(readiness);
}
