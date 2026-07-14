import fs from "node:fs";
import { NextResponse } from "next/server";
import { readArtifactPayload, getProposeArtifact } from "@/lib/profile/artifacts";
import { formatBasicInfoCardBody } from "@/lib/profile/basic-info";
import { formatGoalConstraintCardBody } from "@/lib/profile/goal-constraint";
import { formatPlanAllocationCardBody, formatPlanDetailCardBody } from "@/lib/plan/validate";
import type {
  GoalConstraintProposePayload,
  ProfileBasicProposePayload,
} from "@/lib/profile/types";
import type { PlanAllocationPayload, PlanDetailPayload } from "@/lib/plan/types";
import { getSupabase } from "@/lib/supabase/server";
import type { PatchStrategy } from "@/lib/plan/patch-strategies";
import { PlanAllocationPatchStrategy } from "@/lib/plan/patch-strategies/plan-allocation";
import { PlanDetailPatchStrategy } from "@/lib/plan/patch-strategies/plan-detail";

const patchStrategies: Record<string, PatchStrategy> = {
  plan_allocation: PlanAllocationPatchStrategy,
  plan_detail: PlanDetailPatchStrategy,
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "数据库未连接。" }, { status: 503 });
  }

  const artifact = await getProposeArtifact(supabase, id);
  if (!artifact) {
    return NextResponse.json({ error: "确认卡不存在。" }, { status: 404 });
  }

  let body = "";
  let payload: unknown = undefined;
  try {
    payload = readArtifactPayload(artifact.payload_path);
    if (artifact.kind === "profile_basic") {
      const p = payload as unknown as ProfileBasicProposePayload;
      body = formatBasicInfoCardBody(p.basic_info, p.formula_hint);
    } else if (artifact.kind === "goal_constraint") {
      const p = payload as unknown as GoalConstraintProposePayload;
      body = formatGoalConstraintCardBody(p);
    } else if (artifact.kind === "plan_allocation") {
      const p = payload as unknown as PlanAllocationPayload;
      body = formatPlanAllocationCardBody(p);
    } else if (artifact.kind === "plan_detail") {
      const p = payload as unknown as PlanDetailPayload;
      body = formatPlanDetailCardBody(p);
    }
  } catch {
    body = artifact.summary_zh;
  }

  return NextResponse.json({
    id: artifact.id,
    kind: artifact.kind,
    status: artifact.status,
    summary_zh: artifact.summary_zh,
    body,
    payload: (artifact.kind === "plan_allocation" || artifact.kind === "plan_detail")
      ? payload
      : undefined,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // 查询 artifact
  const supabase = await getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "数据库未连接。" }, { status: 503 });
  }

  const artifact = await getProposeArtifact(supabase, id);
  if (!artifact) {
    return NextResponse.json({ error: "确认卡不存在。" }, { status: 404 });
  }

  // 验证状态
  if (artifact.status !== "pending") {
    return NextResponse.json(
      { error: "只能修改状态为 pending 的确认卡。" },
      { status: 400 },
    );
  }

  // 获取对应的 patch strategy
  const strategy = patchStrategies[artifact.kind];
  if (!strategy) {
    return NextResponse.json(
      { error: `此确认卡类型 "${artifact.kind}" 不支持编辑。` },
      { status: 400 },
    );
  }

  // 使用 strategy 验证请求体
  const validationErrors = strategy.validate(body, artifact);
  if (validationErrors.length > 0) {
    return NextResponse.json({ error: validationErrors.join("; ") }, { status: 400 });
  }

  // 读取现有 payload 并合并更新
  const payload = readArtifactPayload(artifact.payload_path);
  const updatedPayload = strategy.merge(payload as Record<string, unknown>, body, artifact);

  // 保存到磁盘
  fs.writeFileSync(artifact.payload_path, JSON.stringify(updatedPayload, null, 2), "utf8");

  // 生成警告（如果有）
  const warnings = strategy.warnings?.(payload as Record<string, unknown>, body, artifact) ?? [];

  return NextResponse.json({ ok: true, payload: updatedPayload, warnings });
}
