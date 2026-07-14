import { describe, expect, it, vi } from "vitest";
import { createStreamContentBatcher } from "./stream-content-batcher";

type FrameCb = (time: number) => void;

function captureFrameScheduler() {
  const captured: { cb?: FrameCb } = {};
  const scheduleFrame = (cb: FrameCb) => {
    captured.cb = cb;
    return 1;
  };
  return { captured, scheduleFrame };
}

describe("createStreamContentBatcher", () => {
  it("flushes the latest update once per scheduled frame", () => {
    const onFlush = vi.fn();
    const { captured, scheduleFrame } = captureFrameScheduler();
    const batcher = createStreamContentBatcher(onFlush, scheduleFrame, () => {});

    batcher.push({
      assistantId: "a1",
      content: "hello",
      contentBlocks: [],
    });
    batcher.push({
      assistantId: "a1",
      content: "hello world",
      contentBlocks: [],
    });

    expect(onFlush).not.toHaveBeenCalled();
    captured.cb?.(0);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith({
      assistantId: "a1",
      content: "hello world",
      contentBlocks: [],
    });
  });

  it("flushNow bypasses pending frame and clears queue", () => {
    const onFlush = vi.fn();
    const { captured, scheduleFrame } = captureFrameScheduler();
    const cancelFrame = vi.fn();
    const batcher = createStreamContentBatcher(
      onFlush,
      (cb) => {
        captured.cb = cb;
        return 7;
      },
      cancelFrame,
    );

    batcher.push({
      assistantId: "a1",
      content: "partial",
      contentBlocks: [],
    });
    batcher.flushNow({
      assistantId: "a1",
      content: "final",
      contentBlocks: [],
    });

    expect(cancelFrame).toHaveBeenCalledWith(7);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith({
      assistantId: "a1",
      content: "final",
      contentBlocks: [],
    });

    captured.cb?.(0);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it("cancel drops pending updates", () => {
    const onFlush = vi.fn();
    const { captured, scheduleFrame } = captureFrameScheduler();
    const batcher = createStreamContentBatcher(onFlush, scheduleFrame, () => {});

    batcher.push({
      assistantId: "a1",
      content: "drop me",
      contentBlocks: [],
    });
    batcher.cancel();
    captured.cb?.(0);

    expect(onFlush).not.toHaveBeenCalled();
  });
});
