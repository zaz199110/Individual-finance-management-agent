import { describe, expect, it } from "vitest";
import {
  MSG_STOPPED_CODE,
  MSG_STOPPED_TEXT,
  StreamStoppedError,
  isStreamStoppedError,
  throwIfAborted,
} from "./stop-generation";

describe("stop-generation Q9", () => {
  it("defines MSG-STOPPED copy", () => {
    expect(MSG_STOPPED_CODE).toBe("MSG-STOPPED");
    expect(MSG_STOPPED_TEXT).toBe("已停止生成");
  });

  it("throwIfAborted throws when signal aborted", () => {
    const ac = new AbortController();
    ac.abort();
    expect(() => throwIfAborted(ac.signal)).toThrow(StreamStoppedError);
    expect(isStreamStoppedError(new StreamStoppedError())).toBe(true);
  });
});
