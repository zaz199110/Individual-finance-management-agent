import { NextResponse } from "next/server";
import { planConfirmArtifact } from "@/lib/plan/confirm";
import { holdingsConfirmArtifact } from "@/lib/portfolio/confirm";
import {
  profileConfirmArtifact,
  syncConversationAfterConfirm,
} from "@/lib/profile/confirm";
import { getProposeArtifact } from "@/lib/profile/artifacts";
import { getSupabase } from "@/lib/supabase/server";

async function confirmArtifactByKind(
  supabase: Awaited<ReturnType<typeof getSupabase>>,
  id: string,
) {
  const artifact = await getProposeArtifact(supabase!, id);
  if (!artifact) {
    return { ok: false as const, error: "确认卡不存在。" };
  }
  if (artifact.kind === "holdings") {
    const result = await holdingsConfirmArtifact(supabase, id);
    return {
      ok: result.ok,
      error: result.error,
      holdings: result,
      plan: null,
      profile: null,
    };
  }
  if (artifact.kind === "plan_allocation" || artifact.kind === "plan_detail") {
    const result = await planConfirmArtifact(supabase, id);
    return { ok: result.ok, error: result.error, plan: result, profile: null, holdings: null };
  }
  const result = await profileConfirmArtifact(supabase, id);
  return { ok: result.ok, error: result.error, plan: null, profile: result, holdings: null };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    conversation_id?: string;
    action?: "confirm" | "dismiss";
  };

  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "数据库未连接。" }, { status: 503 });
  }

  const artifact = await getProposeArtifact(supabase, id);
  if (!artifact) {
    return NextResponse.json({ error: "确认卡不存在。" }, { status: 404 });
  }

  if (body.action === "dismiss") {
    await supabase
      .from("propose_artifacts")
      .update({ status: "abandoned", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (body.conversation_id) {
      await syncConversationAfterConfirm(supabase, body.conversation_id, id);
    }
    return NextResponse.json({ ok: true, status: "dismissed" });
  }

  const result = await confirmArtifactByKind(supabase, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (body.conversation_id) {
    await syncConversationAfterConfirm(supabase, body.conversation_id, id);
    // 投资需求报告不再走逐组队列，统一走 combine 合体版管线（draftAllGoalsProfileReport）
  }

  return NextResponse.json({
    ok: true,
    profile_version_id: result.profile?.profile_version_id,
    goal_constraint_id: result.profile?.goal_constraint_id ?? result.plan?.goal_constraint_id,
    goal_constraint_revision_id: result.profile?.goal_constraint_revision_id,
    allocation_plan_id: result.plan?.allocation_plan_id,
    plan_step: result.plan?.plan_step,
    holdings_version_id: result.holdings?.holdings_version_id,
    validation: result.profile?.validation ?? null,
    status: "confirmed",
  });
}
