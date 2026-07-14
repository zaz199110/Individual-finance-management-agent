import type { MessageContentBlock } from "@/components/chat/types";

export interface StreamContentUpdate {
  assistantId: string;
  content: string;
  contentBlocks: MessageContentBlock[];
}

export interface StreamContentBatcher {
  push(update: StreamContentUpdate): void;
  flushNow(update: StreamContentUpdate): void;
  cancel(): void;
}

/**
 * Coalesce high-frequency stream content updates to one paint per animation frame.
 */
export function createStreamContentBatcher(
  onFlush: (update: StreamContentUpdate) => void,
  scheduleFrame: (cb: FrameRequestCallback) => number = (cb) =>
    requestAnimationFrame(cb),
  cancelFrame: (id: number) => void = (id) => cancelAnimationFrame(id),
): StreamContentBatcher {
  let frameId: number | null = null;
  let pending: StreamContentUpdate | null = null;

  function flushPending() {
    frameId = null;
    if (!pending) return;
    const update = pending;
    pending = null;
    onFlush(update);
  }

  return {
    push(update) {
      pending = update;
      if (frameId !== null) return;
      frameId = scheduleFrame(flushPending);
    },
    flushNow(update) {
      if (frameId !== null) {
        cancelFrame(frameId);
        frameId = null;
      }
      pending = null;
      onFlush(update);
    },
    cancel() {
      if (frameId !== null) {
        cancelFrame(frameId);
        frameId = null;
      }
      pending = null;
    },
  };
}
