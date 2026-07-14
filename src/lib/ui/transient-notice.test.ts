import { describe, expect, it } from "vitest";
import { TRANSIENT_NOTICE_MS } from "./transient-notice";

describe("transient-notice", () => {
  it("TRANSIENT_NOTICE_MS defaults to 4 seconds", () => {
    expect(TRANSIENT_NOTICE_MS).toBe(4000);
  });
});
