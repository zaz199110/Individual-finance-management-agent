import { NextRequest, NextResponse } from "next/server";
import { listCommands } from "@/harness/tools/list_commands";
import type { SceneId } from "@/harness/registry/load";

export async function GET(request: NextRequest) {
  const scene = request.nextUrl.searchParams.get("scene") as SceneId | null;
  const slashOnly = request.nextUrl.searchParams.get("slash_only") === "true";

  const commands = listCommands({
    scene: scene ?? undefined,
    slashOnly,
  });

  return NextResponse.json({ commands });
}
