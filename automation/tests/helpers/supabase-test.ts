import { getSupabase } from "@/lib/supabase/server";

export async function ensureTestConversation(
  scene: "chat" | "profile" | "plan" | "portfolio" | "fund" = "chat",
): Promise<string | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      title: `acceptance-${Date.now()}`,
      conversation_type: scene,
      metadata: {
        type_locked: false,
        active_tab: scene,
        has_unconfirmed: false,
      },
    })
    .select("id")
    .single();

  if (error) return null;
  return data.id as string;
}

export async function cleanupConversation(id: string): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) return;
  await supabase.from("conversations").delete().eq("id", id);
}

export async function getConversation(id: string) {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function getLastAssistantMessage(conversationId: string) {
  const supabase = await getSupabase();
  if (!supabase) return null;
  const { data } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function getWorkflowTasks(conversationId: string, runId: string) {
  const supabase = await getSupabase();
  if (!supabase) return [];
  const { data } = await supabase
    .from("workflow_tasks")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("run_id", runId)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

export async function countBackgroundJobs(conversationId: string): Promise<number> {
  const supabase = await getSupabase();
  if (!supabase) return -1;
  const { count } = await supabase
    .from("background_jobs")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId);
  return count ?? 0;
}

export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY),
  );
}

export function hasMimoEnv(): boolean {
  return Boolean(process.env.MIMO_API_URL && process.env.MIMO_API_KEY);
}

export function hasKimiEnv(): boolean {
  return Boolean(process.env.KIMI_API_URL && process.env.KIMI_API_KEY);
}

export function hasZhipuWebEnv(): boolean {
  return Boolean(process.env.ZHIPU_API_KEY);
}

export function needsLiveModels(): boolean {
  return hasSupabaseEnv() && (hasMimoEnv() || Boolean(process.env.LLM_API_KEY));
}

export function needsWebSearch(): boolean {
  return needsLiveModels() && hasZhipuWebEnv();
}
