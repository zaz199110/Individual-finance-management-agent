import type { SceneId } from "@/harness/registry/load";
import { handleSceneChat } from "./scene_chat";
import { handleSceneFund } from "./scene_fund";
import { handleScenePortfolio } from "./scene_portfolio";
import { handleScenePlan } from "./scene_plan";
import { handleSceneProfile } from "./scene_profile";
import type {
  ContentBlock,
  ExecutionPlan,
  QueryState,
  SseWriter,
} from "@/harness/types";
import {
  handoffAutostartPlan,
  runPlannerRules,
} from "@/harness/planner/planner_rules";
import { runPlanner } from "@/harness/planner/planner";
import { syncWorkflowTasks } from "@/harness/tasks/sync";
import { emitPlanStepsToSse, writeStage } from "@/harness/tasks/stage";
import {
  needsWorkflowLock,
  sceneToLockKey,
  SH08_MESSAGE,
} from "@/harness/locks/eligibility";
import {
  tryAcquireWorkflowLock,
  WorkflowLockError,
} from "@/harness/locks/store";
import { injectReportReadIfPresent } from "./report-read-inject";

export async function dispatchSceneHandler(
  state: QueryState,
  userMessage: string,
  sse: SseWriter,
): Promise<{
  plan: ExecutionPlan;
  assistantContent: string;
  contentBlocks: ContentBlock[];
  citations?: Array<{ title: string; url: string }>;
}> {
  let plan: ExecutionPlan;

  const autostartPlan =
    state.trigger === "handoff_autostart"
      ? await handoffAutostartPlan(state.scene)
      : null;
  if (autostartPlan) {
    plan = autostartPlan;
  } else {
    plan = await runPlanner({
      scene: state.scene,
      userMessage,
      history: state.messages,
    });
    // LLM Planner 可能误判正式流程为 simple_qa，规则命中 scene_task 时以规则为准
    if (plan.intent === "simple_qa" && (state.scene === "fund" || state.scene === "profile" || state.scene === "plan" || state.scene === "portfolio")) {
      const rulesPlan = runPlannerRules({
        scene: state.scene,
        userMessage,
        history: state.messages,
      });
      if (rulesPlan.intent === "scene_task") {
        plan = rulesPlan;
      }
    }
  }

  void syncWorkflowTasks(state.conversationId, state.runId, plan, state.scene);

  await writeStage(sse, state, {
    task_key: "planner",
    label: "理解对话",
    status: "done",
  });
  await emitPlanStepsToSse(sse, state, plan);

  if (needsWorkflowLock(state.scene, plan, state.trigger)) {
    const acquired = await tryAcquireWorkflowLock(
      sceneToLockKey(state.scene as "profile" | "plan" | "portfolio"),
      state.conversationId,
    );
    if (!acquired) {
      throw new WorkflowLockError(SH08_MESSAGE);
    }
  }

  state.plan = plan;
  const reportInject = await injectReportReadIfPresent(state, userMessage, sse);
  if (reportInject.length) {
    state.promptReminders = [...(state.promptReminders ?? []), ...reportInject];
  }

  if (plan.intent === "scene_task" && state.scene === "profile") {
    const result = await handleSceneProfile(state, userMessage, sse, plan);
    return { plan, ...result };
  }

  if (plan.intent === "scene_task" && state.scene === "plan") {
    const result = await handleScenePlan(state, userMessage, sse, plan);
    return { plan, ...result };
  }

  if (plan.intent === "scene_task" && state.scene === "portfolio") {
    const result = await handleScenePortfolio(state, userMessage, sse, plan);
    return { plan, ...result };
  }

  if (plan.intent === "scene_task" && state.scene === "fund") {
    const result = await handleSceneFund(state, userMessage, sse, plan);
    return { plan, ...result };
  }

  const chatResult = await handleSceneChat(state, userMessage, sse, plan);
  return chatResult;
}

export function getSceneHandlerId(scene: SceneId): string {
  return `scene_${scene}`;
}
