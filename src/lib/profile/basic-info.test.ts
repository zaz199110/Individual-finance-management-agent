import { describe, expect, it } from "vitest";
import { validateBasicInfo } from "./basic-info";
import { loadSampleBasicPayload } from "./propose";

describe("validateBasicInfo", () => {
  it("accepts sample payload", () => {
    const sample = loadSampleBasicPayload().basic_info;
    const r = validateBasicInfo(sample);
    expect(r.ok).toBe(true);
    expect(r.data?.name).toBe("张先生");
  });

  it("rejects missing age", () => {
    const sample = { ...loadSampleBasicPayload().basic_info, age: undefined };
    const r = validateBasicInfo(sample);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("age"))).toBe(true);
  });

  it("warns on monthly investable mismatch", () => {
    const sample = {
      ...loadSampleBasicPayload().basic_info,
      monthly_investable: 9999,
    };
    const r = validateBasicInfo(sample);
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});
