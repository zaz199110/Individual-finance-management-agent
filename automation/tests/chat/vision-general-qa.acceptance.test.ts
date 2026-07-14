import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as postChatStream } from "@/app/api/chat/stream/route";
import {
  collectTokenText,
  findEvents,
  hasAssistantDone,
  parseSseResponse,
  type SseEvent,
} from "../helpers/sse";
import {
  cleanupConversation,
  ensureTestConversation,
  needsLiveModels,
} from "../helpers/supabase-test";

/** 1×1 红色 PNG */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function collectAssistantText(events: SseEvent[]): string {
  const fromTokens = collectTokenText(events);
  const fromBlocks = events
    .filter((e) => e.event === "content_block")
    .map((e) => (e.data as { type?: string; text?: string }).text ?? "")
    .join("");
  return (fromTokens + fromBlocks).trim();
}

describe("chat vision general QA (live)", () => {
  it("returns vision description or explicit error, not '没收到图片'", async () => {
    if (!needsLiveModels()) {
      console.warn("SKIP: needs Supabase + Mimo/LLM env");
      return;
    }

    const convId = await ensureTestConversation("chat");
    if (!convId) throw new Error("no conversation");

    try {
      const res = await postChatStream(
        new NextRequest("http://localhost/api/chat/stream", {
          method: "POST",
          body: JSON.stringify({
            conversation_id: convId,
            scene: "chat",
            content: "请用一句话描述这张图片的主色调。",
            attachments: [
              {
                type: "image",
                mime: "image/png",
                data: TINY_PNG_BASE64,
              },
            ],
          }),
        }),
      );

      expect(res.status).toBe(200);
      const events = await parseSseResponse(res);
      expect(hasAssistantDone(events)).toBe(true);

      const visionStages = findEvents(events, "stage").filter(
        (e) => (e.data as { task_key?: string }).task_key === "vision_parse",
      );
      expect(visionStages.length).toBeGreaterThan(0);

      const text = collectAssistantText(events);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/没收到|没有收到您发送的图片/);

      if (text.includes("图片识别未成功")) {
        expect(text).toMatch(/Vision API|Vision 模型|Vision 返回|识别失败/i);
      } else {
        expect(text.length).toBeGreaterThan(4);
      }
    } finally {
      await cleanupConversation(convId);
    }
  }, 180_000);
});
