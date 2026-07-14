import { describe, expect, it } from "vitest";
import { holdingsConfirmArtifact } from "./confirm";

describe("holdingsConfirmArtifact", () => {
  it("exports a function with correct signature", () => {
    expect(typeof holdingsConfirmArtifact).toBe("function");
  });

  it("returns error when supabase is null", async () => {
    const result = await holdingsConfirmArtifact(null, "test-id");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("数据库未连接。");
  });
});
