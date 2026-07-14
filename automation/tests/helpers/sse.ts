import type { SseWriter } from "@/harness/types";

export interface SseEvent {
  event: string;
  data: unknown;
}

export function createSseCollector(): {
  writer: SseWriter;
  events: SseEvent[];
  text: string;
} {
  const events: SseEvent[] = [];
  const writer: SseWriter = {
    write(event, data) {
      events.push({ event, data });
    },
    close() {
      /* noop */
    },
  };
  return {
    writer,
    events,
    get text() {
      return collectTokenText(events);
    },
  };
}

export function collectTokenText(events: SseEvent[]): string {
  return events
    .filter((e) => e.event === "token_delta" || e.event === "delta" || e.event === "content")
    .map((e) => {
      const d = e.data as { text?: string; content?: string };
      return d.text ?? d.content ?? "";
    })
    .join("");
}

export function hasAssistantDone(events: SseEvent[]): boolean {
  return events.some(
    (e) => e.event === "done" && !(e.data as { error?: boolean }).error,
  );
}

export function findEvents(events: SseEvent[], eventName: string): SseEvent[] {
  return events.filter((e) => e.event === eventName);
}

export function findHandoffCard(events: SseEvent[]): {
  target_scene?: string;
  status?: string;
} | null {
  for (const e of events) {
    if (e.event !== "content_block") continue;
    const d = e.data as { type?: string; target_scene?: string; status?: string };
    if (d.type === "handoff_card") return d;
  }
  return null;
}

/** Parse SSE from fetch Response (HTTP /api/chat/stream) */
export async function parseSseResponse(response: Response): Promise<SseEvent[]> {
  if (!response.body) return [];
  const events: SseEvent[] = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let dataLine = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) dataLine = line.slice(5).trim();
      }
      if (!dataLine) continue;
      try {
        events.push({ event, data: JSON.parse(dataLine) });
      } catch {
        // skip
      }
    }
  }
  return events;
}
