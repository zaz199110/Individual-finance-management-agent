import type { SseEventType, SseWriter } from "@/harness/types";

export function createSseStream(options?: {
  onCancel?: () => void;
}): {
  stream: ReadableStream<Uint8Array>;
  writer: SseWriter;
} {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      options?.onCancel?.();
      controller = null;
    },
  });

  const writer: SseWriter = {
    write(event: SseEventType, data: unknown) {
      if (!controller) return;
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(encoder.encode(payload));
    },
    close() {
      controller?.close();
      controller = null;
    },
  };

  return { stream, writer };
}

export function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
