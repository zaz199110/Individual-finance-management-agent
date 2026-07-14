import { getSupabase } from "@/lib/supabase/server";
import type {
  BackgroundJobRow,
  BackgroundJobStatus,
  BackgroundJobType,
} from "./types";

export async function createBackgroundJob(input: {
  conversationId: string;
  runId: string;
  jobType: BackgroundJobType;
}): Promise<BackgroundJobRow | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("background_jobs")
    .insert({
      conversation_id: input.conversationId,
      run_id: input.runId,
      job_type: input.jobType,
      status: "running",
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[createBackgroundJob]", error?.message);
    return null;
  }
  return data as BackgroundJobRow;
}

export async function finishBackgroundJob(
  jobId: string,
  status: Exclude<BackgroundJobStatus, "running">,
): Promise<void> {
  const supabase = await getSupabase();
  if (!supabase) return;

  await supabase
    .from("background_jobs")
    .update({
      status,
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "running");
}

export async function getBackgroundJob(
  jobId: string,
): Promise<BackgroundJobRow | null> {
  const supabase = await getSupabase();
  if (!supabase) return null;

  const { data } = await supabase
    .from("background_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();

  return (data as BackgroundJobRow | null) ?? null;
}

export async function isJobCancelled(jobId: string): Promise<boolean> {
  const job = await getBackgroundJob(jobId);
  return job?.status === "cancelled";
}

export async function cancelBackgroundJob(jobId: string): Promise<boolean> {
  const supabase = await getSupabase();
  if (!supabase) return false;

  const { data } = await supabase
    .from("background_jobs")
    .update({
      status: "cancelled",
      finished_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "running")
    .select("id")
    .maybeSingle();

  return Boolean(data?.id);
}

export async function cancelRunningJobsForConversation(
  conversationId: string,
): Promise<number> {
  const supabase = await getSupabase();
  if (!supabase) return 0;

  const { data } = await supabase
    .from("background_jobs")
    .update({
      status: "cancelled",
      finished_at: new Date().toISOString(),
    })
    .eq("conversation_id", conversationId)
    .eq("status", "running")
    .select("id");

  return data?.length ?? 0;
}

export async function listBackgroundJobs(
  conversationId: string,
  options?: { status?: BackgroundJobStatus | BackgroundJobStatus[] },
): Promise<BackgroundJobRow[]> {
  const supabase = await getSupabase();
  if (!supabase) return [];

  let q = supabase
    .from("background_jobs")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false });

  if (options?.status) {
    const statuses = Array.isArray(options.status)
      ? options.status
      : [options.status];
    q = q.in("status", statuses);
  }

  const { data } = await q;
  return (data ?? []) as BackgroundJobRow[];
}
