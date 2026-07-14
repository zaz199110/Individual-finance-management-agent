import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/server";
import { formatBasicInfoSummary } from "@/lib/profile/basic-info";
import { goalDisplayName } from "@/lib/profile/goal-labels";
import type { ExecutionPlan } from "@/harness/types";

/** §7 Post-compact rehydration — DB snapshot, not guessed history. */
export async function rehydrateBusinessAnchors(
  conversationId: string,
  options?: { executionPlan?: ExecutionPlan | null },
): Promise<string[]> {
  const supabase = await getSupabase();
  if (!supabase) return [];

  const lines: string[] = [];

  const { data: conv } = await supabase
    .from("conversations")
    .select("conversation_type, metadata, title")
    .eq("id", conversationId)
    .maybeSingle();

  if (conv) {
    lines.push(`<scene>${conv.conversation_type}</scene>`);
    lines.push(`对话标题：${conv.title}`);
    const meta = conv.metadata as Record<string, unknown>;
    if (meta?.has_unconfirmed) {
      lines.push("有待确认内容（确认卡或报告草稿）。");
    }
    if (meta?.pending_report_draft) {
      lines.push("存在待确认报告草稿（run 目录）。");
    }
    const overlay = meta?.report_overlay as { blocks?: unknown[] } | undefined;
    if (overlay?.blocks?.length) {
      lines.push(`report_overlay：${overlay.blocks.length} 个增量块待合并。`);
    }
  }

  const { data: lockRows } = await supabase
    .from("workflow_locks")
    .select("lock_key, holder_conversation_id");
  const held = (lockRows ?? []).find((r) => r.holder_conversation_id);
  if (held?.holder_conversation_id) {
    if (held.holder_conversation_id === conversationId) {
      lines.push(`workflow_lock：本对话正持有 ${held.lock_key as string} 写锁。`);
    } else {
      lines.push("workflow_lock：其他对话正占用写流程互斥锁。");
    }
  }

  await appendProfileSnapshot(supabase, lines);
  await appendGoalConstraints(supabase, lines);
  await appendCurrentPlans(supabase, lines);
  await appendPendingArtifacts(supabase, conversationId, lines);

  if (options?.executionPlan) {
    lines.push(
      `<execution_plan>${JSON.stringify({
        intent: options.executionPlan.intent,
        steps: options.executionPlan.steps.map((s) => ({
          key: s.key,
          label: s.label,
          status: s.status,
        })),
      })}</execution_plan>`,
    );
  }

  return lines;
}

async function appendProfileSnapshot(
  supabase: SupabaseClient,
  lines: string[],
): Promise<void> {
  const { data: profile } = await supabase
    .from("profile_versions")
    .select("id, basic_info")
    .eq("is_current", true)
    .maybeSingle();

  if (!profile) return;

  lines.push(`profile_version_id：${profile.id}`);
  const basic = (profile.basic_info ?? {}) as Parameters<
    typeof formatBasicInfoSummary
  >[0];
  lines.push(`客户信息摘要：${formatBasicInfoSummary(basic)}`);
}

async function appendGoalConstraints(
  supabase: SupabaseClient,
  lines: string[],
): Promise<void> {
  const { data: goals } = await supabase
    .from("investment_goal_constraints")
    .select("id, goal_type, display_name, is_active")
    .eq("is_active", true)
    .order("confirmed_at", { ascending: false })
    .limit(8);

  if (!goals?.length) return;

  lines.push("<goal_constraints>");
  for (const g of goals) {
    const name = goalDisplayName(g.goal_type, g.display_name);
    lines.push(`- id=${g.id} · ${name}`);
  }
  lines.push("</goal_constraints>");
}

async function appendCurrentPlans(
  supabase: SupabaseClient,
  lines: string[],
): Promise<void> {
  const { data: plans } = await supabase
    .from("allocation_plans")
    .select("id, goal_constraint_id, plan_step, is_current, allocation_rationale")
    .eq("is_current", true)
    .eq("plan_step", 2)
    .limit(8);

  if (!plans?.length) return;

  lines.push("<current_plans>");
  for (const p of plans) {
    const rationale = String(p.allocation_rationale ?? "").slice(0, 120);
    lines.push(
      `- plan_id=${p.id} · goal=${p.goal_constraint_id} · step=2 · ${rationale || "（无摘要）"}`,
    );
  }
  lines.push("</current_plans>");
}

async function appendPendingArtifacts(
  supabase: SupabaseClient,
  conversationId: string,
  lines: string[],
): Promise<void> {
  const { data: pendingArtifacts } = await supabase
    .from("propose_artifacts")
    .select("id, kind, summary_zh, status")
    .eq("conversation_id", conversationId)
    .eq("status", "pending")
    .limit(5);

  if (!pendingArtifacts?.length) return;

  lines.push("<pending_artifacts>");
  for (const a of pendingArtifacts) {
    lines.push(`- ${a.id} · ${a.kind} · ${a.summary_zh}`);
  }
  lines.push("</pending_artifacts>");
}
