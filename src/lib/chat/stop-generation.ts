/** PRD §5.3.15 · CH-16 · Q9 */
export const MSG_STOPPED_CODE = "MSG-STOPPED";
export const MSG_STOPPED_TEXT = "已停止生成";

export class StreamStoppedError extends Error {
  constructor() {
    super(MSG_STOPPED_CODE);
    this.name = "StreamStoppedError";
  }
}

export function isStreamStoppedError(err: unknown): boolean {
  return (
    err instanceof StreamStoppedError ||
    (err instanceof Error && err.message === MSG_STOPPED_CODE)
  );
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new StreamStoppedError();
  }
}
