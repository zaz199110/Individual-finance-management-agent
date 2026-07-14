import { execSync, spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as postChatStream } from "@/app/api/chat/stream/route";
import { GET } from "@/app/api/commands/route";
import { runHarnessLoop } from "@/harness/loop";
import { runPlannerRules, CAPABILITY_REPLY } from "@/harness/planner/planner_rules";
import { listCommands } from "@/harness/tools/list_commands";
import { assemblePrompt } from "@/harness/prompt/assemble";
import { getReadiness } from "@/lib/settings/readiness";
import {
  probeModelSlot,
  probeOpenAICompatible,
  resolveProviderStack,
} from "@/lib/config/model-providers";
import { createClient } from "@supabase/supabase-js";
import { ACCEPTANCE_CASES } from "./manifest";
import { createSseCollector, hasAssistantDone, parseSseResponse } from "../helpers/sse";
import {
  cleanupConversation,
  ensureTestConversation,
  hasMimoEnv,
  hasSupabaseEnv,
  needsLiveModels,
} from "../helpers/supabase-test";
import { resolvePythonCommand } from "../../lib/resolve-python";

const c = (id: string) => {
  const found = ACCEPTANCE_CASES.find((x) => x.id === id);
  if (!found) throw new Error(`missing case ${id}`);
  return found;
};

/** PRD 验收 — 按 manifest id 逐条执行 */
describe.sequential("PRD acceptance (sequential)", () => {
  it(`${c("REG-01").id} ${c("REG-01").title}`, () => {
    const root = process.cwd();
    const py = resolvePythonCommand();
    const out = spawnSync(
      py[0],
      [...py.slice(1), "automation/scripts/validate_registry.py"],
      { cwd: root, encoding: "utf8" },
    );
    expect(out.status).toBe(0);
    expect(out.stdout).toMatch(/OK|passed|valid/i);
  });

  it(`${c("REG-02").id} ${c("REG-02").title}`, async () => {
    const req = new NextRequest(
      "http://localhost/api/commands?scene=chat&slash_only=true",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { commands?: unknown[] };
    expect(Array.isArray(body.commands)).toBe(true);

    const chatSlash = listCommands({ scene: "chat", slashOnly: true });
    expect(chatSlash.map((cmd) => cmd.id)).toContain("web_search");
  });

  it(`${c("SET-MIMO-01").id} ${c("SET-MIMO-01").title}`, async () => {
    if (!hasMimoEnv()) {
      console.warn("SKIP SET-MIMO-01: MIMO_* not in env");
      return;
    }
    const stack = resolveProviderStack();
    expect(stack.reasoning?.provider).toBe("mimo");
    const result = await probeOpenAICompatible(stack.reasoning!);
    expect(result.ok, result.message).toBe(true);
  }, 60_000);

  it(`${c("SET-MIMO-DEEP").id} ${c("SET-MIMO-DEEP").title}`, async () => {
    if (!hasMimoEnv()) {
      console.warn("SKIP SET-MIMO-DEEP: MIMO_* not in env");
      return;
    }
    const stack = resolveProviderStack();
    expect(stack.deep).toEqual(stack.reasoning);
    const result = await probeModelSlot("deep");
    expect(result.ok, result.message).toBe(true);
  }, 60_000);

  it(`${c("SET-ZHIPU-WEB").id} ${c("SET-ZHIPU-WEB").title}`, async () => {
    if (!process.env.ZHIPU_API_KEY) {
      console.warn("SKIP SET-ZHIPU-WEB: ZHIPU_API_KEY not in env");
      return;
    }
    const stack = resolveProviderStack();
    expect(stack.web?.provider).toBe("zhipu");
    expect(stack.web?.model_name).toBeTruthy();
    const result = await probeModelSlot("web");
    expect(result.ok, result.message).toBe(true);
  }, 60_000);

  it(`${c("SET-MIMO-VISION").id} ${c("SET-MIMO-VISION").title}`, async () => {
    if (!hasMimoEnv()) {
      console.warn("SKIP SET-MIMO-VISION: MIMO_* not in env");
      return;
    }
    const stack = resolveProviderStack();
    expect(stack.vision?.provider).toBe("mimo");
    expect(stack.vision?.model_name).toBeTruthy();
    const result = await probeModelSlot("vision");
    expect(result.ok, result.message).toBe(true);
  }, 60_000);

  it(`${c("SET-ZHIPU-EMB").id} ${c("SET-ZHIPU-EMB").title}`, async () => {
    if (!process.env.ZHIPU_API_KEY || !process.env.ZHIPU_EMBEDDING_MODEL) {
      console.warn("SKIP SET-ZHIPU-EMB: ZHIPU embedding not in env");
      return;
    }
    const stack = resolveProviderStack();
    expect(stack.embedding?.model_name).toBe("embedding-3");
    const result = await probeModelSlot("embedding");
    expect(result.ok, result.message).toBe(true);
  }, 60_000);

  it(`${c("SET-SUPA-01").id} ${c("SET-SUPA-01").title}`, async () => {
    if (!hasSupabaseEnv()) {
      console.warn("SKIP SET-SUPA-01: Supabase env missing");
      return;
    }
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_ANON_KEY!;
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await client.from("conversations").select("id").limit(1);
    if (error?.message.includes("does not exist")) {
      throw new Error(
        "conversations 表不存在，请先运行: python automation/scripts/apply_app_core.py",
      );
    }
    expect(error).toBeNull();
  }, 30_000);

  it(`${c("SET-READINESS").id} ${c("SET-READINESS").title}`, async () => {
    const readiness = await getReadiness();
    if (hasMimoEnv() && process.env.ZHIPU_API_KEY) {
      expect(readiness.models.reasoning).toBe(true);
      expect(readiness.models.web).toBe(true);
      expect(readiness.models.chat_ready).toBe(true);
    }
    if (hasSupabaseEnv()) {
      expect(readiness.database.ready).toBe(true);
    }
  });

  it(`${c("CLI-PROBE-01").id} ${c("CLI-PROBE-01").title}`, async () => {
    if (!hasMimoEnv() || !process.env.ZHIPU_API_KEY) {
      console.warn("SKIP CLI-PROBE-01: needs Mimo + Zhipu");
      return;
    }
    const reasoning = await probeModelSlot("reasoning");
    const web = await probeModelSlot("web");
    expect(reasoning.ok, reasoning.message).toBe(true);
    expect(web.ok, web.message).toBe(true);
  }, 90_000);

  it(`${c("PLAN-Q2").id} ${c("PLAN-Q2").title}`, () => {
    const plan = runPlannerRules({
      scene: "chat",
      userMessage: "什么是最大回撤？",
      history: [],
    });
    expect(plan.intent).toBe("simple_qa");
  });

  it(`${c("PLAN-Q6").id} ${c("PLAN-Q6").title}`, () => {
    const plan = runPlannerRules({
      scene: "chat",
      userMessage: "你能做什么",
      history: [],
    });
    expect(plan.intent).toBe("simple_qa");
    expect(plan.steps[0]?.key).toBe("capability");
  });

  it(`${c("PLAN-Q4").id} ${c("PLAN-Q4").title}`, () => {
    const plan = runPlannerRules({
      scene: "chat",
      userMessage: "帮我做理财规划",
      history: [],
    });
    expect(plan.intent).toBe("cross_scene_handoff");
    expect(plan.target_scene).toBe("profile");
  });

  it(`${c("PLAN-D2").id} ${c("PLAN-D2").title}`, () => {
    const plan = runPlannerRules({
      scene: "portfolio",
      userMessage: "最大回撤怎么算",
      history: [],
    });
    expect(plan.intent).toBe("simple_qa");
  });

  it(`${c("PLAN-PROFILE").id} ${c("PLAN-PROFILE").title}`, () => {
    const plan = runPlannerRules({
      scene: "profile",
      userMessage: "开始梳理投资需求",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps.some((s) => s.skill === "profile_intake")).toBe(true);
  });

  it(`${c("PROMPT-COMPLIANCE").id} ${c("PROMPT-COMPLIANCE").title}`, async () => {
    const convId = "00000000-0000-4000-8000-000000000001";
    const prompt = await assemblePrompt({
      runId: "test",
      conversationId: convId,
      conversationType: "chat",
      scene: "chat",
      messages: [],
      plan: null,
    });
    expect(prompt.system).toMatch(/合规|风险|适当性/i);
  });

  it(`${c("CHAT-STREAM-Q6").id} ${c("CHAT-STREAM-Q6").title}`, async () => {
    if (!hasSupabaseEnv()) {
      console.warn("SKIP CHAT-STREAM-Q6: needs Supabase");
      return;
    }
    const convId = await ensureTestConversation("chat");
    if (!convId) throw new Error("无法创建测试对话");

    try {
      const { writer, events } = createSseCollector();
      await runHarnessLoop(
        {
          conversation_id: convId,
          scene: "chat",
          content: "你能做什么",
        },
        writer,
      );
      expect(hasAssistantDone(events)).toBe(true);
      const err = events.find((e) => e.event === "error");
      expect(err).toBeUndefined();
    } finally {
      await cleanupConversation(convId);
    }
  }, 180_000);

  it(`${c("CHAT-STREAM-Q2").id} ${c("CHAT-STREAM-Q2").title}`, async () => {
    if (!needsLiveModels()) {
      console.warn("SKIP CHAT-STREAM-Q2: needs Supabase + reasoning model");
      return;
    }
    const convId = await ensureTestConversation("chat");
    if (!convId) throw new Error("无法创建测试对话");

    try {
      const res = await postChatStream(
        new NextRequest("http://localhost/api/chat/stream", {
          method: "POST",
          body: JSON.stringify({
            conversation_id: convId,
            scene: "chat",
            content: "什么是最大回撤？用一句话解释。",
          }),
        }),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toMatch(/text\/event-stream/);
      const events = await parseSseResponse(res);
      expect(hasAssistantDone(events)).toBe(true);
    } finally {
      await cleanupConversation(convId);
    }
  }, 240_000);
});

describe("capability static reply", () => {
  it("contains three report workflows", () => {
    expect(CAPABILITY_REPLY).toMatch(/投资规划/);
    expect(CAPABILITY_REPLY).toMatch(/持仓分析/);
    expect(CAPABILITY_REPLY).toMatch(/基金解读/);
  });
});
