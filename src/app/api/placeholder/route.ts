import { NextRequest, NextResponse } from "next/server";
import { buildFundPlaceholder } from "@/lib/fund/placeholder";
import { buildPlanPlaceholder } from "@/lib/plan/placeholder";
import { buildPortfolioPlaceholder } from "@/lib/portfolio/placeholder";
import { portfolioRead } from "@/lib/portfolio/read";
import { buildProfilePlaceholder } from "@/lib/profile/placeholder";
import { profileRead } from "@/lib/profile/read";
import type { SceneId } from "@/harness/registry/load";
import { getSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const scene = (req.nextUrl.searchParams.get("scene") ?? "chat") as SceneId;
  const supabase = await getSupabase();
  const read = await profileRead(supabase);

  if (scene === "plan") {
    const plan = buildPlanPlaceholder(read);
    return NextResponse.json(plan);
  }

  if (scene === "portfolio") {
    const port = await portfolioRead(supabase);
    const placeholder = buildPortfolioPlaceholder(port);
    return NextResponse.json(placeholder);
  }

  if (scene === "fund") {
    return NextResponse.json(buildFundPlaceholder());
  }

  if (scene === "profile") {
    const profile = buildProfilePlaceholder(read);
    return NextResponse.json({ ...profile, profile: read });
  }

  return NextResponse.json({ scene, title: null, hint: null });
}
