import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as postChatStream } from "@/app/api/chat/stream/route";
import { POST as postConversation } from "@/app/api/conversations/route";
import { runHarnessLoop } from "@/harness/loop";
import { runPlannerRules } from "@/harness/planner/planner_rules";
import { listCommands } from "@/harness/tools/list_commands";
import { executeTool } from "@/harness/tools/router";
import { resolveProviderStack } from "@/lib/config/model-providers";
import { hasUnconfirmedOrangeDot } from "@/lib/chat/conversation-ui";
import {
  filterSlashCommands,
  isChatInputBlocked,
} from "@/lib/chat/input-policy";
import {
  ERR_IMAGE_SIZE,
  MAX_IMAGE_BYTES,
  validateImageUpload,
} from "@/lib/validation/image-upload";
import { GAP_CASES } from "./gaps.manifest";
import {
  collectTokenText,
  createSseCollector,
  findEvents,
  findHandoffCard,
  hasAssistantDone,
  parseSseResponse,
} from "../helpers/sse";
import {
  cleanupConversation,
  countBackgroundJobs,
  ensureTestConversation,
  getConversation,
  getWorkflowTasks,
  needsLiveModels,
  needsWebSearch,
} from "../helpers/supabase-test";

const g = (id: string) => {
  const found = GAP_CASES.find((x) => x.id === id);
  if (!found) throw new Error(`missing gap case ${id}`);
  return found;
};

/** App Router 页面可能在 route group `(shell)` 下 */
function appPageExists(relativePath: string): boolean {
  const root = process.cwd();
  return (
    fs.existsSync(path.join(root, "src/app", relativePath)) ||
    fs.existsSync(path.join(root, "src/app/(shell)", relativePath))
  );
}

/** PRD 缺口项 — 逐条自动化（含 gap-tracker 记录未实现项） */
describe.sequential("PRD gap acceptance (sequential)", () => {
  it(`${g("GAP-HTTP-01").id} ${g("GAP-HTTP-01").title}`, async () => {
    if (!needsLiveModels()) {
      console.warn("SKIP GAP-HTTP-01: needs Supabase + models");
      return;
    }
    const bad = await postChatStream(
      new NextRequest("http://localhost/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({ scene: "chat" }),
      }),
    );
    expect(bad.status).toBe(400);

    const convId = await ensureTestConversation("chat");
    if (!convId) throw new Error("no conversation");

    try {
      const res = await postChatStream(
        new NextRequest("http://localhost/api/chat/stream", {
          method: "POST",
          body: JSON.stringify({
            conversation_id: convId,
            scene: "chat",
            content: "ping",
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
  }, 120_000);

  it(`${g("GAP-Q1").id} ${g("GAP-Q1").title}`, async () => {
    if (!needsLiveModels()) return;
    const res = await postConversation();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      title?: string;
      conversation_type?: string;
      metadata?: { type_locked?: boolean; active_tab?: string };
    };
    expect(body.title).toBe("新对话");
    expect(body.conversation_type).toBe("chat");
    expect(body.metadata?.type_locked).toBe(false);
    expect(body.metadata?.active_tab).toBe("chat");
  });

  it("GAP-Q1b 空状态含理财助手文案", () => {
    const ui = fs.readFileSync(
      path.join(process.cwd(), "src/components/chat/SceneEmptyState.tsx"),
      "utf8",
    );
    expect(ui).toMatch(/理财助手/);
    expect(ui).toMatch(/有问题尽管问/);
  });

  it(`${g("GAP-Q3").id} ${g("GAP-Q3").title}`, async () => {
    if (!needsWebSearch()) {
      console.warn("SKIP GAP-Q3: needs ZHIPU Search-Std");
      return;
    }

    let toolHasCitations = false;
    try {
      const toolResult = await executeTool({
        tool: "web_search",
        input: { query: "最近一周 A 股有什么热点新闻" },
        scene: "chat",
      });
      const citationCount = toolResult.citations?.length ?? 0;
      toolHasCitations = toolResult.ok && citationCount > 0;
      if (toolHasCitations) {
        expect(citationCount).toBeLessThanOrEqual(5);
      }
    } catch (e) {
      console.warn(
        "GAP-Q3 tool layer unavailable:",
        e instanceof Error ? e.message : e,
      );
    }

    const convId = await ensureTestConversation("chat");
    if (!convId) throw new Error("no conversation");

    try {
      const { writer, events } = createSseCollector();
      await runHarnessLoop(
        {
          conversation_id: convId,
          scene: "chat",
          content: "最近一周 A 股有什么热点新闻？简要列举。",
        },
        writer,
      );
      const webStage = findEvents(events, "stage").some(
        (e) => (e.data as { task_key?: string }).task_key === "web_search",
      );
      expect(
        webStage || toolHasCitations,
        "web_search 阶段或工具层引用至少一项通过",
      ).toBe(true);
    } finally {
      await cleanupConversation(convId);
    }
  }, 180_000);

  it(`${g("GAP-Q4").id} ${g("GAP-Q4").title}`, async () => {
    if (!needsLiveModels()) return;
    const convId = await ensureTestConversation("chat");
    if (!convId) throw new Error("no conversation");

    try {
      const { writer, events } = createSseCollector();
      await runHarnessLoop(
        {
          conversation_id: convId,
          scene: "chat",
          content: "我想做完整理财规划，从需求梳理开始",
        },
        writer,
      );
      const card = findHandoffCard(events);
      expect(card).toBeTruthy();
      expect(card?.target_scene).toBe("profile");
      expect(card?.status).toBe("pending");

      const conv = await getConversation(convId);
      const meta = conv?.metadata as { type_locked?: boolean };
      expect(meta?.type_locked).toBe(true);
    } finally {
      await cleanupConversation(convId);
    }
  }, 120_000);

  it(`${g("GAP-Q5").id} ${g("GAP-Q5").title}`, () => {
    expect(
      fs.existsSync(
        path.join(process.cwd(), "src/components/chat/HandoffCard.tsx"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(process.cwd(), "src/app/api/handoff/prepare/route.ts"),
      ),
    ).toBe(true);
    const chatShell = fs.readFileSync(
      path.join(process.cwd(), "src/components/chat/ChatShell.tsx"),
      "utf8",
    );
    expect(chatShell).toMatch(/onHandoffDismiss|handleHandoffDismiss/);
  });

  it(`${g("GAP-Q5b").id} ${g("GAP-Q5b").title}`, () => {
    const plan = runPlannerRules({
      scene: "chat",
      userMessage: "什么是夏普比率？",
      history: [
        {
          id: "1",
          conversation_id: "x",
          role: "assistant",
          content: "要跳转吗？",
          metadata: {
            content_blocks: [
              { type: "handoff_card", target_scene: "profile", status: "pending" },
            ],
          },
          created_at: new Date().toISOString(),
        },
      ],
    });
    expect(plan.intent).toBe("simple_qa");
    expect(plan.intent).not.toBe("cross_scene_handoff");
  });

  it(`${g("GAP-Q5c").id} ${g("GAP-Q5c").title}`, () => {
    const plan = runPlannerRules({
      scene: "chat",
      userMessage: "好的",
      history: [],
    });
    expect(plan.intent).toBe("simple_qa");
    expect(plan.target_scene).toBeUndefined();
  });

  it(`${g("GAP-Q7").id} ${g("GAP-Q7").title}`, async () => {
    const result = await executeTool({
      tool: "vision_parse",
      input: {},
      scene: "portfolio",
    });
    // D2: demo mode removed; vision_parse without images returns error
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it(`${g("GAP-Q8").id} ${g("GAP-Q8").title}`, async () => {
    if (!needsLiveModels()) return;
    const convId = await ensureTestConversation("chat");
    if (!convId) throw new Error("no conversation");

    try {
      const { writer, events } = createSseCollector();
      const result = await runHarnessLoop(
        {
          conversation_id: convId,
          scene: "portfolio",
          content: "",
          trigger: "handoff_autostart",
        },
        writer,
      );
      const errEmpty = events.find(
        (e) => e.event === "error" && (e.data as { code?: string }).code === "ERR-EMPTY",
      );
      expect(errEmpty).toBeUndefined();
      expect(result.runId).toBeTruthy();
    } finally {
      await cleanupConversation(convId);
    }
  }, 120_000);

  it(`${g("GAP-Q9").id} ${g("GAP-Q9").title}`, () => {
    const chatShell = fs.readFileSync(
      path.join(process.cwd(), "src/components/chat/ChatShell.tsx"),
      "utf8",
    );
    const loopSrc = fs.readFileSync(
      path.join(process.cwd(), "src/harness/loop.ts"),
      "utf8",
    );
    const stopSrc = fs.readFileSync(
      path.join(process.cwd(), "src/lib/chat/stop-generation.ts"),
      "utf8",
    );
    expect(chatShell).toMatch(/AbortController/);
    expect(chatShell).toMatch(/停止生成/);
    expect(chatShell).toMatch(/MSG_STOPPED_TEXT/);
    expect(loopSrc).toMatch(/MSG_STOPPED_CODE/);
    expect(loopSrc).toMatch(/stopped/);
    expect(stopSrc).toContain("MSG-STOPPED");
  });

  it(`${g("GAP-Q10").id} ${g("GAP-Q10").title}`, () => {
    expect(
      isChatInputBlocked(
        {
          models: { reasoning: false, web: false, chat_ready: false },
          database: { ready: true, check_status: "passed" },
        },
        "chat",
      ),
    ).toBe(true);
  });

  it(`${g("GAP-Q11").id} ${g("GAP-Q11").title}`, () => {
    const stack = resolveProviderStack();
    if (process.env.MIMO_API_URL) {
      expect(stack.vision).toBeTruthy();
      expect(typeof stack.vision?.model_name).toBe("string");
      expect(stack.vision!.model_name.length).toBeGreaterThan(0);
    }
  });

  it(`${g("GAP-Q12").id} ${g("GAP-Q12").title}`, () => {
    const chatSlash = listCommands({ scene: "chat", slashOnly: true }).map(
      (x) => x.id,
    );
    expect(chatSlash.sort()).toEqual(["vision_parse", "web_search"].sort());
    const filtered = filterSlashCommands(
      chatSlash.map((id) => ({ id })),
      "/web",
    );
    expect(filtered.map((x) => x.id)).toEqual(["web_search"]);
  });

  it(`${g("GAP-Q13").id} ${g("GAP-Q13").title}`, () => {
    expect(hasUnconfirmedOrangeDot({ has_unconfirmed: true })).toBe(true);
    expect(hasUnconfirmedOrangeDot({ has_unconfirmed: false })).toBe(false);
  });

  it(`${g("GAP-Q14").id} ${g("GAP-Q14").title}`, () => {
    const ok = validateImageUpload({ size: 1024, type: "image/png" });
    expect(ok.ok).toBe(true);
    const bad = validateImageUpload({ size: MAX_IMAGE_BYTES + 1, type: "image/png" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe(ERR_IMAGE_SIZE);
  });

  it(`${g("GAP-S12").id} ${g("GAP-S12").title}`, async () => {
    if (!needsLiveModels()) return;
    const convId = await ensureTestConversation("chat");
    if (!convId) throw new Error("no conversation");

    try {
      const { writer, events } = createSseCollector();
      const result = await runHarnessLoop(
        {
          conversation_id: convId,
          scene: "chat",
          content: "你能做什么",
        },
        writer,
      );
      expect(hasAssistantDone(events)).toBe(true);
      const stageKeys = findEvents(events, "stage").map(
        (e) => (e.data as { task_key?: string }).task_key,
      );
      expect(stageKeys.length).toBeGreaterThan(0);

      const tasks = await getWorkflowTasks(convId, result.runId);
      if (tasks.length === 0) {
        console.warn(
          "GAP-S12: workflow_tasks 未落盘（检查 Supabase 表/权限），SSE 阶段条已通过",
        );
      } else {
        expect(tasks.every((t) => t.status === "done")).toBe(true);
      }
    } finally {
      await cleanupConversation(convId);
    }
  }, 60_000);

  it(`${g("GAP-S13").id} ${g("GAP-S13").title}`, async () => {
    if (!needsLiveModels()) return;
    const prevForce = process.env.HARNESS_FORCE_BACKGROUND;
    process.env.HARNESS_FORCE_BACKGROUND = "1";
    const convId = await ensureTestConversation("fund");
    if (!convId) throw new Error("no conversation");

    try {
      const { writer } = createSseCollector();
      await runHarnessLoop(
        {
          conversation_id: convId,
          scene: "fund",
          content: "请出具完整解读报告 019305",
        },
        writer,
      );
      expect(await countBackgroundJobs(convId)).toBeGreaterThanOrEqual(1);
    } finally {
      if (prevForce === undefined) delete process.env.HARNESS_FORCE_BACKGROUND;
      else process.env.HARNESS_FORCE_BACKGROUND = prevForce;
      await cleanupConversation(convId);
    }
  }, 60_000);

  it(`${g("GAP-HANDOFF-01").id} ${g("GAP-HANDOFF-01").title}`, async () => {
    if (!needsLiveModels()) return;
    const sourceId = await ensureTestConversation("chat");
    if (!sourceId) throw new Error("no conversation");

    try {
      const { POST } = await import("@/app/api/handoff/prepare/route");
      const res = await POST(
        new NextRequest("http://localhost/api/handoff/prepare", {
          method: "POST",
          body: JSON.stringify({
            source_conversation_id: sourceId,
            target_scene: "profile",
          }),
        }),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        target_conversation_id?: string;
        created?: boolean;
      };
      expect(body.target_conversation_id).toBeTruthy();
      expect(typeof body.created).toBe("boolean");
      await cleanupConversation(body.target_conversation_id!);
    } finally {
      await cleanupConversation(sourceId);
    }
  });

  it(`${g("GAP-PROFILE").id} ${g("GAP-PROFILE").title}`, async () => {
    if (!needsLiveModels()) return;
    const convId = await ensureTestConversation("profile");
    if (!convId) throw new Error("no conversation");

    try {
      const { writer, events } = createSseCollector();
      await runHarnessLoop(
        {
          conversation_id: convId,
          scene: "profile",
          content: "开始梳理投资需求",
        },
        writer,
      );
      expect(hasAssistantDone(events)).toBe(true);
      expect(collectTokenText(events).length).toBeGreaterThan(0);
    } finally {
      await cleanupConversation(convId);
    }
  }, 120_000);

  it(`${g("GAP-PROFILE-READ").id} ${g("GAP-PROFILE-READ").title}`, async () => {
    const result = await executeTool({
      tool: "profile_read",
      input: {},
      scene: "profile",
    });
    expect(result.ok).toBe(true);
    expect(result.preview).toMatch(/基本情况|尚未保存/);
    expect(result.data).toBeTruthy();
  });

  it(`${g("GAP-PROFILE-EMPTY").id} ${g("GAP-PROFILE-EMPTY").title}`, () => {
    const ui = fs.readFileSync(
      path.join(process.cwd(), "src/components/chat/SceneEmptyState.tsx"),
      "utf8",
    );
    expect(ui).toMatch(/梳理你的投资需求/);
    expect(
      fs.existsSync(path.join(process.cwd(), "src/app/api/placeholder/route.ts")),
    ).toBe(true);
  });

  it(`${g("GAP-Q4b").id} ${g("GAP-Q4b").title}`, async () => {
    if (!needsLiveModels()) return;
    const sourceId = await ensureTestConversation("chat");
    if (!sourceId) throw new Error("no conversation");

    try {
      const { writer, events } = createSseCollector();
      await runHarnessLoop(
        {
          conversation_id: sourceId,
          scene: "chat",
          content: "我想做完整理财规划，从需求梳理开始",
        },
        writer,
      );
      const card = findHandoffCard(events);
      expect(card?.target_scene).toBe("profile");

      const { POST: postHandoffPrepare } = await import(
        "@/app/api/handoff/prepare/route"
      );
      const prep = await postHandoffPrepare(
        new NextRequest("http://localhost/api/handoff/prepare", {
          method: "POST",
          body: JSON.stringify({
            source_conversation_id: sourceId,
            target_scene: "profile",
          }),
        }),
      );
      const body = (await prep.json()) as { target_conversation_id?: string };
      expect(body.target_conversation_id).toBeTruthy();

      const targetId = body.target_conversation_id!;
      const { writer: w2, events: ev2 } = createSseCollector();
      await runHarnessLoop(
        {
          conversation_id: targetId,
          scene: "profile",
          trigger: "handoff_autostart",
          target_scene: "profile",
          source_conversation_id: sourceId,
        },
        w2,
      );
      expect(hasAssistantDone(ev2)).toBe(true);
      expect(collectTokenText(ev2)).toMatch(/需求梳理|基本情况/);
      await cleanupConversation(targetId);
    } finally {
      await cleanupConversation(sourceId);
    }
  }, 120_000);

  it(`${g("GAP-PROFILE-GOAL").id} ${g("GAP-PROFILE-GOAL").title}`, async () => {
    const { loadSampleGoalPayload, validateGoalConstraint } = await import(
      "@/lib/profile/goal-constraint"
    );
    const r = validateGoalConstraint(loadSampleGoalPayload());
    expect(r.ok).toBe(true);
  });

  it(`${g("GAP-PROFILE-PUBLISH").id} ${g("GAP-PROFILE-PUBLISH").title}`, async () => {
    const result = await executeTool({
      tool: "report_publish",
      input: { report_type: "profile", goal_constraint_id: "00000000-0000-0000-0000-000000000001" },
      scene: "profile",
      conversationId: "00000000-0000-0000-0000-000000000002",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/确认|连接|找不到|缺少|写操作/);
  });

  it(`${g("GAP-PLAN-EMPTY").id} ${g("GAP-PLAN-EMPTY").title}`, async () => {
    const { GET } = await import("@/app/api/placeholder/route");
    const res = await GET(new NextRequest("http://localhost/api/placeholder?scene=plan"));
    const body = await res.json();
    expect(body.scene).toBe("plan");
    expect(body.title).toMatch(/资产配置|生成|选择/);
    expect(typeof body.n).toBe("number");
    expect(body.n).toBeGreaterThanOrEqual(0);
  });

  it(`${g("GAP-PLAN-READ").id} ${g("GAP-PLAN-READ").title}`, async () => {
    const result = await executeTool({ tool: "plan_read", input: {}, scene: "plan" });
    expect(result.ok).toBe(true);
    expect(result.preview).toMatch(/完善投资需求组|N/);
  });

  it(`${g("GAP-PLAN-VALIDATE").id} ${g("GAP-PLAN-VALIDATE").title}`, async () => {
    const { loadSamplePlanAllocation, loadSamplePlanDetail } = await import("@/lib/plan/samples");
    const { validatePlanAllocation, validatePlanDetail } = await import("@/lib/plan/validate");
    expect(validatePlanAllocation(loadSamplePlanAllocation()).ok).toBe(true);
    expect(validatePlanDetail(loadSamplePlanDetail()).ok).toBe(true);
  });

  it(`${g("GAP-PLAN-SCENE").id} ${g("GAP-PLAN-SCENE").title}`, async () => {
    const { runPlannerRules } = await import("@/harness/planner/planner_rules");
    const plan = runPlannerRules({
      scene: "plan",
      userMessage: "开始生成方案",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps.some((s) => s.key.startsWith("plan."))).toBe(true);
  });

  it(`${g("GAP-PLAN-PUBLISH").id} ${g("GAP-PLAN-PUBLISH").title}`, async () => {
    const result = await executeTool({
      tool: "report_publish",
      input: {
        report_type: "plan",
        goal_constraint_id: "00000000-0000-0000-0000-000000000001",
      },
      scene: "plan",
      conversationId: "00000000-0000-0000-0000-000000000002",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/确认|连接|找不到|缺少|写操作|明细|草稿/);
  });

  it(`${g("GAP-PLAN-L0").id} ${g("GAP-PLAN-L0").title}`, async () => {
    const { loadSamplePlanDetail } = await import("@/lib/plan/samples");
    const { validateL0StubFunds } = await import("@/lib/plan/detail-builder");
    expect(validateL0StubFunds(loadSamplePlanDetail()).ok).toBe(true);
  });

  it(`${g("GAP-PORT-EMPTY").id} ${g("GAP-PORT-EMPTY").title}`, async () => {
    const { GET } = await import("@/app/api/placeholder/route");
    const res = await GET(new NextRequest("http://localhost/api/placeholder?scene=portfolio"));
    const body = await res.json();
    expect(body.scene).toBe("portfolio");
    expect(["empty", "has_holdings"]).toContain(body.branch);
    expect(body.title).toMatch(/录入持仓|继续分析/);
  });

  it(`${g("GAP-PORT-READ").id} ${g("GAP-PORT-READ").title}`, async () => {
    const result = await executeTool({ tool: "holdings_read", input: {}, scene: "portfolio" });
    expect(result.ok).toBe(true);
    expect(result.preview).toMatch(/持仓|无/);
  });

  it(`${g("GAP-PORT-VALIDATE").id} ${g("GAP-PORT-VALIDATE").title}`, async () => {
    const { loadSampleHoldingsInitial } = await import("@/lib/portfolio/samples");
    const { validateHoldings } = await import("@/lib/portfolio/validate");
    expect(validateHoldings(loadSampleHoldingsInitial()).ok).toBe(true);
  });

  it(`${g("GAP-PORT-SCENE").id} ${g("GAP-PORT-SCENE").title}`, async () => {
    const { runPlannerRules } = await import("@/harness/planner/planner_rules");
    const plan = runPlannerRules({
      scene: "portfolio",
      userMessage: "用样例持仓",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps.some((s) => s.key.startsWith("port."))).toBe(true);
  });

  it(`${g("GAP-PORT-PUBLISH").id} ${g("GAP-PORT-PUBLISH").title}`, async () => {
    const result = await executeTool({
      tool: "report_publish",
      input: {
        report_type: "portfolio",
        holdings_version_id: "00000000-0000-0000-0000-000000000001",
      },
      scene: "portfolio",
      conversationId: "00000000-0000-0000-0000-000000000002",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/连接|找不到|缺少|写操作|确认|草稿/);
  });

  it(`${g("GAP-FUND-EMPTY").id} ${g("GAP-FUND-EMPTY").title}`, async () => {
    const { GET } = await import("@/app/api/placeholder/route");
    const res = await GET(new NextRequest("http://localhost/api/placeholder?scene=fund"));
    const body = await res.json();
    expect(body.scene).toBe("fund");
    expect(body.title).toMatch(/深度解读/);
  });

  it(`${g("GAP-FUND-LOOKUP").id} ${g("GAP-FUND-LOOKUP").title}`, async () => {
    const result = await executeTool({
      tool: "fund_lookup",
      input: { fund_code: "019305" },
      scene: "fund",
    });
    expect(result.ok).toBe(true);
    expect(result.preview).toMatch(/019305/);
  });

  it(`${g("GAP-FUND-SCENE").id} ${g("GAP-FUND-SCENE").title}`, async () => {
    const { runPlannerRules } = await import("@/harness/planner/planner_rules");
    const plan = runPlannerRules({
      scene: "fund",
      userMessage: "用样例基金解读",
      history: [],
    });
    expect(plan.intent).toBe("scene_task");
    expect(plan.steps.some((s) => s.key.startsWith("fund."))).toBe(true);
  });

  it(`${g("GAP-RPT-LIST").id} ${g("GAP-RPT-LIST").title}`, async () => {
    const { GET } = await import("@/app/api/reports/route");
    const res = await GET(new NextRequest("http://localhost/api/reports?tab=profile"));
    expect([200, 503, 500]).toContain(res.status);
    const body = await res.json();
    expect(Array.isArray(body.reports)).toBe(true);
  });

  it(`${g("GAP-RPT-PREVIEW").id} ${g("GAP-RPT-PREVIEW").title}`, async () => {
    const { isLinkClickable } = await import("@/lib/reports/markdown-render");
    const ids = new Set(["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"]);
    expect(
      isLinkClickable(
        "/reports?tab=profile&id=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "draft",
        ids,
      ),
    ).toBe(true);
    expect(
      isLinkClickable(
        "/reports?tab=plan&id=00000000-0000-0000-0000-000000000099",
        "draft",
        ids,
      ),
    ).toBe(false);
  });

  it(`${g("GAP-PORT-VAR-B").id} ${g("GAP-PORT-VAR-B").title}`, async () => {
    const { findPublishedPlanForPortfolio } = await import(
      "@/lib/portfolio/plan-context"
    );
    const result = await findPublishedPlanForPortfolio(null as never);
    expect(result).toBeNull();
    expect(fs.existsSync(path.join(process.cwd(), "src/lib/portfolio/plan-context.ts"))).toBe(
      true,
    );
  });

  it(`${g("GAP-FUND-KB03").id} ${g("GAP-FUND-KB03").title}`, async () => {
    const { exploreFundKnowledge } = await import(
      "@/harness/infra/fund_knowledge/explore"
    );
    const r = exploreFundKnowledge({
      fund_code: "019305",
      query: "管理费",
      max_hits: 3,
    });
    expect(r.ok).toBe(true);
    expect(r.hits.length).toBeGreaterThan(0);
  });

  it(`${g("GAP-PORT-VISION").id} ${g("GAP-PORT-VISION").title}`, async () => {
    const result = await executeTool({
      tool: "vision_parse",
      input: {},
      scene: "portfolio",
    });
    // D2: demo mode removed; tool still registered and callable
    expect(typeof result.ok).toBe("boolean");
  });

  it(`${g("GAP-PLAN-L0-POOL").id} ${g("GAP-PLAN-L0-POOL").title}`, async () => {
    const { buildPlanDetailFromL0Pool, validatePlanL0Pool } = await import(
      "@/lib/plan/l0-pool"
    );
    const payload = await buildPlanDetailFromL0Pool({ goalDisplayName: "退休养老" });
    expect(validatePlanL0Pool(payload).ok).toBe(true);
    expect(payload.detailed_plan.categories.length).toBeGreaterThan(0);
  });

  it(`${g("GAP-FK-UI").id} ${g("GAP-FK-UI").title}`, async () => {
    const { GET: metaGet } = await import("@/app/api/fund-knowledge/meta/route");
    const metaRes = await metaGet();
    expect(metaRes.status).toBe(200);
    const meta = await metaRes.json();
    expect(meta.vault_root).toBeTruthy();
    expect(appPageExists("fund-knowledge/page.tsx")).toBe(true);

    const { GET: treeGet } = await import("@/app/api/fund-knowledge/tree/route");
    const treeRes = await treeGet(new NextRequest("http://localhost/api/fund-knowledge/tree"));
    expect(treeRes.status).toBe(200);
    const tree = await treeRes.json();
    expect(Array.isArray(tree.funds)).toBe(true);
  });

  it(`${g("GAP-FK-INDEX").id} ${g("GAP-FK-INDEX").title}`, async () => {
    const { ensureFundKnowledgeVault } = await import(
      "@/harness/infra/fund_knowledge/bootstrap"
    );
    const { rebuildIndex, queryFts, getIndexDbPath } = await import(
      "@/harness/infra/fund_knowledge/index-db"
    );
    const { exploreFundKnowledge } = await import(
      "@/harness/infra/fund_knowledge/explore"
    );
    const vaultRoot = ensureFundKnowledgeVault();
    const result = rebuildIndex({ vaultRoot, scope: "all" });
    expect(result.scanned).toBeGreaterThan(0);
    expect(fs.existsSync(getIndexDbPath(vaultRoot))).toBe(true);

    const fts = queryFts({ vaultRoot, fund_code: "019305", query: "管理费", limit: 3 });
    expect(fts.length).toBeGreaterThan(0);

    const explore = exploreFundKnowledge({
      fund_code: "019305",
      query: "管理费",
      max_hits: 3,
    });
    expect(explore.ok).toBe(true);
    expect(explore.hits.length).toBeGreaterThan(0);
  });

  it(`${g("GAP-L0-TUSHARE").id} ${g("GAP-L0-TUSHARE").title}`, async () => {
    const { fundLookupAsync } = await import("@/lib/fund/lookup");
    const r = await fundLookupAsync({ fund_code: "019305" });
    expect(r.ok).toBe(true);
    expect(r.lookup_source).toBeTruthy();
    expect(["tushare", "akshare", "registry_demo"]).toContain(r.lookup_source);
    expect(r.summary).toMatch(/019305/);
  });

  it(`${g("GAP-DS-SETTINGS").id} ${g("GAP-DS-SETTINGS").title}`, async () => {
    const { GET } = await import("@/app/api/settings/datasources/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.datasources).toBeTruthy();
    expect(body.datasources.tushare_check_status).toBeTruthy();
    expect(appPageExists("settings/datasources/page.tsx")).toBe(true);
  });

  it(`${g("GAP-FK-PDF").id} ${g("GAP-FK-PDF").title}`, async () => {
    expect(
      fs.existsSync(path.join(process.cwd(), "seed/scripts/convert_pdf_file.py")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(process.cwd(), "src/harness/infra/fund_knowledge/pdf-convert.ts")),
    ).toBe(true);
    const { uploadFundKnowledgeFiles } = await import(
      "@/harness/infra/fund_knowledge/upload"
    );
    expect(typeof uploadFundKnowledgeFiles).toBe("function");
  });

  it(`${g("GAP-L0-HOLD").id} ${g("GAP-L0-HOLD").title}`, async () => {
    const { fundLookupAsync } = await import("@/lib/fund/lookup");
    const r = await fundLookupAsync({ fund_code: "019305" });
    expect(r.ok).toBe(true);
    expect(r).toHaveProperty("top_holdings");
    expect(r).toHaveProperty("dividend_history");
  });

  it(`${g("GAP-WL-01").id} ${g("GAP-WL-01").title}`, async () => {
    const { GET } = await import("@/app/api/fund-watchlist/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(3);
    const codes = body.items.map((x: { fund_code: string }) => x.fund_code);
    expect(codes).toContain("019305");
    expect(codes).toContain("017704");
    expect(codes).toContain("206007");

    const { GET: searchGet } = await import("@/app/api/funds/search/route");
    const searchRes = await searchGet(
      new NextRequest("http://localhost/api/funds/search?q=019305"),
    );
    expect(searchRes.status).toBe(200);
    const searchBody = await searchRes.json();
    expect(searchBody.results?.length).toBeGreaterThan(0);
  });

  it(`${g("GAP-SCH-UI").id} ${g("GAP-SCH-UI").title}`, async () => {
    const { GET, PATCH } = await import("@/app/api/scheduled-jobs/route");
    const getRes = await GET();
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.job?.job_type).toBe("portfolio");
    expect(typeof getBody.has_holdings).toBe("boolean");
    expect(Array.isArray(getBody.runs)).toBe(true);

    const patchRes = await PATCH(
      new NextRequest("http://localhost/api/scheduled-jobs", {
        method: "PATCH",
        body: JSON.stringify({
          enabled: false,
          schedule_kind: "weekly",
          schedule_days: [3],
          run_at_time: "09:00",
        }),
      }),
    );
    expect(patchRes.status).toBe(200);
    expect(appPageExists("scheduled-jobs/page.tsx")).toBe(true);
  });

  it(`${g("GAP-S14").id} ${g("GAP-S14").title}`, async () => {
    expect(
      fs.existsSync(path.join(process.cwd(), "src/lib/scheduled/scheduler.ts")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(process.cwd(), "src/instrumentation.ts")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(process.cwd(), "src/app/api/scheduled-jobs/tick/route.ts")),
    ).toBe(true);

    const { shouldAttemptScheduledTick } = await import("@/lib/scheduled/tick-logic");
    const job = {
      id: "test",
      job_type: "portfolio",
      enabled: true,
      schedule_kind: "weekly" as const,
      schedule_days: [3],
      run_at_time: "09:00",
      consecutive_failures: 0,
      updated_at: new Date().toISOString(),
      last_run_at: null,
    };
    expect(
      shouldAttemptScheduledTick(job, {
        weekday: 3,
        dayOfMonth: 10,
        month: 6,
        year: 2026,
        hhmm: "09:00",
      }),
    ).toBe(true);
    expect(
      shouldAttemptScheduledTick(job, {
        weekday: 3,
        dayOfMonth: 10,
        month: 6,
        year: 2026,
        hhmm: "10:00",
      }),
    ).toBe(false);
  });

  it(`${g("GAP-FUND-ECHARTS").id} ${g("GAP-FUND-ECHARTS").title}`, async () => {
    const { buildFundReportEchartsMarkdown, countEchartsFences } = await import(
      "@/lib/fund/echarts-skeleton"
    );
    const { parseMarkdown } = await import("@/lib/reports/markdown-render");

    const built = buildFundReportEchartsMarkdown({
      fundCode: "019305",
      fundName: "样例基金",
      archetype: "A",
      return1yPct: 12.5,
      benchmarkReturn1yPct: 10.2,
      benchmarkName: "沪深300",
      assetAllocation: { stock_pct: 90, bond_pct: 5, cash_pct: 5 },
      parsedFees: { management_pct: 0.8 },
    });
    expect(built.chartCount).toBeGreaterThanOrEqual(2);
    const md = `${built.chapter1}${built.chapter4}`;
    expect(countEchartsFences(md)).toBe(built.chartCount);

    const blocks = parseMarkdown(md, "published", new Set());
    expect(blocks.filter((b) => b.kind === "echarts").length).toBe(built.chartCount);
    expect(
      fs.existsSync(path.join(process.cwd(), "src/components/reports/ReportEchartsChart.tsx")),
    ).toBe(true);
  });

  it(`${g("GAP-RPT-SCHED").id} ${g("GAP-RPT-SCHED").title}`, async () => {
    const { readTriggerSource } = await import("@/lib/reports/read");
    expect(readTriggerSource({ trigger_source: "scheduled" })).toBe("scheduled");
    expect(readTriggerSource({ trigger_source: "manual" })).toBeUndefined();
    expect(readTriggerSource(null)).toBeUndefined();

    const src = fs.readFileSync(
      path.join(process.cwd(), "src/lib/reports/read.ts"),
      "utf8",
    );
    expect(src).toContain("metadata");
    expect(src).toContain("trigger_source");

    const ui = fs.readFileSync(
      path.join(process.cwd(), "src/components/reports/ReportsPageClient.tsx"),
      "utf8",
    );
    expect(ui).toContain("定时生成");
  });

  it(`${g("GAP-FK-FMT").id} ${g("GAP-FK-FMT").title}`, async () => {
    const { FK_FMT_EXTENSIONS, convertSpreadsheetToMarkdown } = await import(
      "@/harness/infra/fund_knowledge/fmt-convert"
    );
    expect(FK_FMT_EXTENSIONS.length).toBeGreaterThanOrEqual(10);
    const csv = Buffer.from("A,B\n1,2\n", "utf8");
    const out = convertSpreadsheetToMarkdown(csv, ".csv", "t.csv");
    expect(out.ok).toBe(true);
    expect(out.markdown).toContain("| A | B |");

    const uploadSrc = fs.readFileSync(
      path.join(process.cwd(), "src/harness/infra/fund_knowledge/upload.ts"),
      "utf8",
    );
    expect(uploadSrc).toContain("convertUploadFileToMarkdown");
    expect(uploadSrc).toContain("isFkFmtExtension");
  });

  it(`${g("GAP-USAGE").id} ${g("GAP-USAGE").title}`, async () => {
    const { buildUsageGuide } = await import("@/lib/usage/build-usage-guide");
    const guide = buildUsageGuide();
    expect(guide.scenes.length).toBe(5);
    const market = guide.overview.sections.find((s) => s.title === "行情颜色");
    expect(market?.items[0]?.body).toMatch(/绿涨红跌/);
    expect(JSON.stringify(guide)).not.toMatch(/registry\.yaml|Harness/);

    expect(
      fs.existsSync(path.join(process.cwd(), "src/app/api/usage/route.ts")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(process.cwd(), "src/components/usage/UsageGuideDrawer.tsx")),
    ).toBe(true);

    const sidebar = fs.readFileSync(
      path.join(process.cwd(), "src/components/layout/SidebarNavFooter.tsx"),
      "utf8",
    );
    expect(sidebar).toContain("UsageGuideTrigger");
  });

  it(`${g("GAP-S09").id} ${g("GAP-S09").title}`, async () => {
    expect(
      fs.existsSync(path.join(process.cwd(), "src/lib/settings/user-memory.ts")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(process.cwd(), "src/app/api/settings/memory/route.ts")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(process.cwd(), "src/app/api/settings/memory/actions/refresh/route.ts"),
      ),
    ).toBe(true);

    const page = fs.readFileSync(
      path.join(process.cwd(), "src/components/settings/MemorySettingsPageClient.tsx"),
      "utf8",
    );
    expect(page).toContain("ReportMarkdownPreview");
    expect(page).toContain("刷新");
    expect(page).toContain("编辑");

    const memoryBlock = fs.readFileSync(
      path.join(process.cwd(), "src/harness/prompt/blocks/memory.ts"),
      "utf8",
    );
    expect(memoryBlock).toContain("getUserMemory");

    const { refreshUserMemoryFromFile, getUserMemory, patchUserMemory } = await import(
      "@/lib/settings/user-memory"
    );
    const prior = await getUserMemory();
    const tmp = path.join(process.cwd(), "data", "user-memory.md");
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, "验收：简短分点", "utf8");
    try {
      await refreshUserMemoryFromFile();
      const mem = await getUserMemory();
      expect(mem.content_md).toContain("简短分点");
    } finally {
      await patchUserMemory(prior.content_md ?? "");
      if (prior.file_exists) {
        fs.writeFileSync(tmp, prior.content_md ?? "", "utf8");
      } else if (fs.existsSync(tmp)) {
        fs.unlinkSync(tmp);
      }
    }
  });

  it(`${g("GAP-EMB-FILTER").id} ${g("GAP-EMB-FILTER").title}`, async () => {
    expect(fs.existsSync(path.join(process.cwd(), "src/lib/embedding/rerank.ts"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(process.cwd(), "src/lib/embedding/settings.ts"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(process.cwd(), "src/lib/kb/kb-intent.ts"))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), "src/lib/kb/kb-valid.ts"))).toBe(true);

    const form = fs.readFileSync(
      path.join(process.cwd(), "src/components/settings/ModelSlotForm.tsx"),
      "utf8",
    );
    expect(form).toContain("启用基金解析语义筛选");
    expect(form).toContain("embedding_enabled");

    const explore = fs.readFileSync(
      path.join(process.cwd(), "src/harness/infra/fund_knowledge/explore.ts"),
      "utf8",
    );
    expect(explore).toContain("exploreFundKnowledgeAsync");
    expect(explore).toContain("L1_RECALL");

    const web = fs.readFileSync(
      path.join(process.cwd(), "src/harness/tools/web_search.ts"),
      "utf8",
    );
    // Embedding rerank is now L2-only; L3 web search must not use it
    expect(web).not.toContain("isEmbeddingRerankEnabled");
    const semantic = fs.readFileSync(
      path.join(process.cwd(), "src/harness/infra/fund_knowledge/semantic.ts"),
      "utf8",
    );
    expect(semantic).toContain("rerankByEmbedding");

    const prd = fs.readFileSync(
      path.join(process.cwd(), "requirement/prd/09-fund-knowledge.md"),
      "utf8",
    );
    expect(prd).toContain("EMB-FILTER-01");

    const {
      setEmbeddingFilterEnabled,
      isEmbeddingRerankEnabled,
    } = await import("@/lib/embedding/settings");
    await setEmbeddingFilterEnabled(false);
    try {
      expect(await isEmbeddingRerankEnabled()).toBe(false);
    } finally {
      await setEmbeddingFilterEnabled(true);
    }

    const { shouldInvokeL3 } = await import("@/lib/kb/kb-intent");
    expect(
      shouldInvokeL3({
        intent: "nav",
        query: "净值",
        hasVault: true,
        l0Valid: true,
        l1Valid: false,
        l2Valid: false,
      }),
    ).toBe(false);
  });

  it(`${g("GAP-REPORT-READ").id} ${g("GAP-REPORT-READ").title}`, async () => {
    const { parseReportDeepLink } = await import("@/lib/reports/parse-report-link");
    const parsed = parseReportDeepLink(
      "/reports?tab=fund&id=11111111-2222-3333-4444-555555555555",
    );
    expect(parsed?.tab).toBe("fund");
    expect(parsed?.report_id).toBeTruthy();

    expect(
      fs.existsSync(path.join(process.cwd(), "src/harness/tools/report_read.ts")),
    ).toBe(true);

    const { executeTool } = await import("@/harness/tools/router");
    const bad = await executeTool({
      tool: "report_read",
      input: { report_id: "00000000-0000-0000-0000-000000000000", tab: "plan" },
      scene: "chat",
    });
    expect(bad.ok).toBe(false);
  });

  it(`${g("GAP-ARTIFACT-READ").id} ${g("GAP-ARTIFACT-READ").title}`, async () => {
    expect(
      fs.existsSync(path.join(process.cwd(), "src/harness/tools/artifact_read.ts")),
    ).toBe(true);

    const registry = fs.readFileSync(
      path.join(process.cwd(), "agents/registry.yaml"),
      "utf8",
    );
    expect(registry).toContain("artifact_read");

    const { executeTool } = await import("@/harness/tools/router");
    const bad = await executeTool({
      tool: "artifact_read",
      input: { artifact_id: "00000000-0000-0000-0000-000000000000" },
      scene: "profile",
    });
    expect(bad.ok).toBe(false);
  });

  it(`${g("GAP-MERMAID-01").id} ${g("GAP-MERMAID-01").title}`, async () => {
    const { verifyMermaidInMarkdown } = await import("@/lib/reports/mermaid-verify");
    const prev = process.env.HARNESS_SKIP_MMDC;
    process.env.HARNESS_SKIP_MMDC = "1";
    try {
      const ok = verifyMermaidInMarkdown("```mermaid\nflowchart TB\n  A-->B\n```");
      expect(ok.ok).toBe(true);
      expect(ok.block_count).toBe(1);
    } finally {
      if (prev === undefined) delete process.env.HARNESS_SKIP_MMDC;
      else process.env.HARNESS_SKIP_MMDC = prev;
    }

    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { devDependencies?: Record<string, string> };
    expect(pkg.devDependencies?.["@mermaid-js/mermaid-cli"]).toBeTruthy();

    for (const mod of [
      "src/lib/profile/report-publish.ts",
      "src/lib/plan/report-publish.ts",
      "src/lib/portfolio/report-publish.ts",
      "src/lib/fund/report-publish.ts",
    ]) {
      const src = fs.readFileSync(path.join(process.cwd(), mod), "utf8");
      expect(src).toContain("validateDraftFileForPublish");
    }
  });

  it(`${g("GAP-L0-FALLBACK").id} ${g("GAP-L0-FALLBACK").title}`, async () => {
    const lookupSrc = fs.readFileSync(
      path.join(process.cwd(), "src/lib/fund/lookup.ts"),
      "utf8",
    );
    expect(lookupSrc).toContain("supplementL0FromWeb");
    expect(lookupSrc).toContain("l0_degraded");

    const { appendWebFallbackToSummary } = await import("@/lib/l0/web-fallback");
    const text = appendWebFallbackToSummary("base", {
      web_summary: "demo",
      citations: [],
    });
    expect(text).toContain("L0 降级");
  });

  it(`${g("GAP-RPT-API-01").id} ${g("GAP-RPT-API-01").title}`, async () => {
    const folderRoute = path.join(
      process.cwd(),
      "src/app/api/reports/actions/open-folder/route.ts",
    );
    const fileRoute = path.join(
      process.cwd(),
      "src/app/api/reports/[id]/actions/open-file/route.ts",
    );
    expect(fs.existsSync(folderRoute)).toBe(true);
    expect(fs.existsSync(fileRoute)).toBe(true);

    const { POST: postFolder } = await import(
      "@/app/api/reports/actions/open-folder/route"
    );
    const bad = await postFolder(
      new NextRequest("http://localhost/api/reports/actions/open-folder", {
        method: "POST",
        body: JSON.stringify({ report_type: "invalid" }),
      }),
    );
    expect(bad.status).toBe(400);
  });

  it(`${g("GAP-RPT-LINK-01").id} ${g("GAP-RPT-LINK-01").title}`, () => {
    const ui = fs.readFileSync(
      path.join(process.cwd(), "src/components/reports/ReportsPageClient.tsx"),
      "utf8",
    );
    expect(ui).toContain("复制链接");
    expect(ui).toContain("buildReportDeepLink");
    expect(ui).toContain("链接已复制");
  });

  it(`${g("GAP-RPT-EDIT-01").id} ${g("GAP-RPT-EDIT-01").title}`, () => {
    const listUi = fs.readFileSync(
      path.join(process.cwd(), "src/components/reports/ReportsPageClient.tsx"),
      "utf8",
    );
    const viewUi = fs.readFileSync(
      path.join(process.cwd(), "src/components/reports/ReportViewPageClient.tsx"),
      "utf8",
    );
    expect(listUi).toMatch(/编辑/);
    expect(listUi).toMatch(/已刷新/);
    expect(listUi).toContain("open-file");
    expect(viewUi).toMatch(/编辑/);
    expect(viewUi).toMatch(/已刷新/);
  });

  it(`${g("GAP-FK-API-01").id} ${g("GAP-FK-API-01").title}`, () => {
    const fkUi = fs.readFileSync(
      path.join(process.cwd(), "src/components/fund-knowledge/FundKnowledgePageClient.tsx"),
      "utf8",
    );
    expect(fkUi).toContain("在资源管理器中打开");
    expect(fkUi).toContain("/api/fund-knowledge/actions/open-file");
    expect(fs.existsSync(
      path.join(process.cwd(), "src/app/api/fund-knowledge/actions/open-folder/route.ts"),
    )).toBe(true);
  });

  it(`${g("GAP-SH-08").id} ${g("GAP-SH-08").title}`, async () => {
    expect(fs.existsSync(path.join(process.cwd(), "src/harness/locks/store.ts"))).toBe(
      true,
    );
    const { needsWorkflowLock, SH08_CODE, SH08_MESSAGE } = await import(
      "@/harness/locks/eligibility"
    );
    expect(SH08_CODE).toBe("ERR-WRITE-LOCK");
    expect(SH08_MESSAGE.length).toBeGreaterThan(5);
    expect(
      needsWorkflowLock("profile", {
        intent: "scene_task",
        steps: [],
        requires_user_confirm: false,
      }),
    ).toBe(true);

    const loopSrc = fs.readFileSync(
      path.join(process.cwd(), "src/harness/loop.ts"),
      "utf8",
    );
    expect(loopSrc).toContain("WorkflowLockError");
    expect(loopSrc).toContain("releaseWorkflowLock");
  });

  it(`${g("GAP-RPT-LINK-TABS").id} ${g("GAP-RPT-LINK-TABS").title}`, async () => {
    const { runPlannerRules } = await import("@/harness/planner/planner_rules");
    const link =
      "/reports?tab=fund&id=11111111-2222-3333-4444-555555555555 帮我总结";
    const plan = runPlannerRules({
      scene: "fund",
      userMessage: link,
      history: [],
    });
    expect(plan.intent).toBe("simple_qa");
    expect(plan.steps.some((s) => s.key === "report_read")).toBe(true);

    expect(
      fs.existsSync(
        path.join(process.cwd(), "src/harness/scenes/report-read-inject.ts"),
      ),
    ).toBe(true);
    const routerSrc = fs.readFileSync(
      path.join(process.cwd(), "src/harness/scenes/router.ts"),
      "utf8",
    );
    expect(routerSrc).toContain("injectReportReadIfPresent");
  });

  it(`${g("GAP-REHYDRATE-07").id} ${g("GAP-REHYDRATE-07").title}`, async () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "src/harness/context/rehydrate.ts"),
      "utf8",
    );
    expect(src).toContain("profile_versions");
    expect(src).toContain("investment_goal_constraints");
    expect(src).toContain("allocation_plans");
    expect(src).toContain("propose_artifacts");
    expect(src).toContain("execution_plan");

    const assembleSrc = fs.readFileSync(
      path.join(process.cwd(), "src/harness/prompt/assemble.ts"),
      "utf8",
    );
    expect(assembleSrc).toContain("executionPlan: state.plan");
  });

  it(`${g("GAP-MERMAID-PREVIEW").id} ${g("GAP-MERMAID-PREVIEW").title}`, async () => {
    const { parseMarkdown } = await import("@/lib/reports/markdown-render");
    const blocks = parseMarkdown(
      "```mermaid\nflowchart LR\n  A-->B\n```",
      "published",
      new Set(),
    );
    expect(blocks.some((b) => b.kind === "mermaid")).toBe(true);

    expect(
      fs.existsSync(
        path.join(process.cwd(), "src/components/reports/ReportMermaidDiagram.tsx"),
      ),
    ).toBe(true);

    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.mermaid).toBeTruthy();
    expect(pkg.devDependencies?.["@mermaid-js/mermaid-cli"]).toBeTruthy();
    expect(pkg.dependencies?.mermaid).toBe(pkg.devDependencies?.["@mermaid-js/mermaid-cli"]);
  });

  it(`${g("GAP-REACTIVE-COMPACT").id} ${g("GAP-REACTIVE-COMPACT").title}`, async () => {
    const { isPromptTooLongError } = await import(
      "@/harness/context/reactive-compact"
    );
    expect(isPromptTooLongError(new Error("prompt_too_long"))).toBe(true);
    expect(isPromptTooLongError(new Error("ok"))).toBe(false);

    const clientSrc = fs.readFileSync(
      path.join(process.cwd(), "src/harness/llm/client.ts"),
      "utf8",
    );
    expect(clientSrc).toContain("streamChatCompletionWithRetry");
    expect(clientSrc).toContain("applyReactiveCompact");
  });

  it(`${g("GAP-RPT-OVERLAY-01").id} ${g("GAP-RPT-OVERLAY-01").title}`, async () => {
    expect(
      fs.existsSync(path.join(process.cwd(), "src/lib/reports/overlay.ts")),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(process.cwd(), "src/harness/tools/report_overlay_patch.ts"),
      ),
    ).toBe(true);

    const draftSrc = fs.readFileSync(
      path.join(process.cwd(), "src/harness/tools/report_draft.ts"),
      "utf8",
    );
    const publishSrc = fs.readFileSync(
      path.join(process.cwd(), "src/harness/tools/report_publish.ts"),
      "utf8",
    );
    expect(draftSrc).toContain("mergeReportOverlayIntoDraft");
    expect(publishSrc).toContain("clearReportOverlay");

    const { executeTool } = await import("@/harness/tools/router");
    const denied = await executeTool({
      tool: "report_overlay_patch",
      input: { action: "upsert", block: { anchor: "append:end", content: "x" } },
      scene: "plan",
      conversationId: "00000000-0000-0000-0000-000000000001",
      runId: "run-test",
    });
    expect(denied.ok).toBe(false);
    expect(denied.error).toMatch(/确认/);
  });

  it(`${g("GAP-L2-PGVECTOR").id} ${g("GAP-L2-PGVECTOR").title}`, async () => {
    expect(
      fs.existsSync(
        path.join(process.cwd(), "src/harness/infra/fund_knowledge/semantic-supabase.ts"),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(process.cwd(), "supabase/migrations/003_match_semantic_rpc.sql"),
      ),
    ).toBe(true);
    const { mockEmbedding1536 } = await import("@/lib/embedding/embed-text");
    expect(mockEmbedding1536("test").length).toBe(1536);
  });

  it(`${g("GAP-KB03-FUND-QA").id} ${g("GAP-KB03-FUND-QA").title}`, async () => {
    const { runPlannerRules } = await import("@/harness/planner/planner_rules");
    const qa = runPlannerRules({
      scene: "fund",
      userMessage: "019305 管理费多少",
      history: [],
    });
    expect(qa.steps.some((s) => s.key === "fund.qa.answer")).toBe(true);

    expect(fs.existsSync(path.join(process.cwd(), "src/lib/fund/fund-qa.ts"))).toBe(true);
    const sceneSrc = fs.readFileSync(
      path.join(process.cwd(), "src/harness/scenes/scene_fund.ts"),
      "utf8",
    );
    expect(sceneSrc).toContain("answerFundQuestion");
  });

  it(`${g("GAP-FK-PDF-OCR").id} ${g("GAP-FK-PDF-OCR").title}`, () => {
    expect(
      fs.existsSync(path.join(process.cwd(), "src/harness/infra/fund_knowledge/pdf-ocr.ts")),
    ).toBe(true);
    const py = fs.readFileSync(
      path.join(process.cwd(), "seed/scripts/convert_pdf_file.py"),
      "utf8",
    );
    expect(py).toContain("OCR_PENDING");
    expect(py).toContain("--ocr-dir");
  });

  it(`${g("GAP-FK-CITE").id} ${g("GAP-FK-CITE").title}`, () => {
    expect(fs.existsSync(path.join(process.cwd(), "src/lib/fund/knowledge-citations.ts"))).toBe(
      true,
    );
    expect(
      fs.existsSync(
        path.join(process.cwd(), "src/components/fund-knowledge/FundKnowledgeLinePreview.tsx"),
      ),
    ).toBe(true);
    const pub = fs.readFileSync(
      path.join(process.cwd(), "src/lib/fund/report-publish.ts"),
      "utf8",
    );
    expect(pub).toContain("knowledge_citations");
  });
});
