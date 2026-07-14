import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractFundNameFromText,
  resolveFundChineseName,
} from "./fund-name-resolve";
import { vaultDirName } from "./vault-slug";

describe("extractFundNameFromText", () => {
  it("reads Chinese name after fund code in expert opinion md", () => {
    const samplePath = path.join(
      process.cwd(),
      "seed/test-upload/005827-Yifangda-Blue-Chip-Selected/expert_opinion/active-equity-outlook-2026.md",
    );
    const text = readFileSync(samplePath, "utf8");
    expect(extractFundNameFromText(text, "005827")).toBe("易方达蓝筹精选混合");
  });

  it("reads fund_name from frontmatter", () => {
    const text = '---\nfund_name: "兴业中证同业存单AAA指数7天持有期"\nfund_code: "017704"\n---\n';
    expect(extractFundNameFromText(text, "017704")).toBe(
      "兴业中证同业存单AAA指数7天持有期",
    );
  });
});

describe("vaultDirName", () => {
  it("uses fund code plus Chinese name with space", () => {
    expect(vaultDirName("005827", "易方达蓝筹精选混合")).toBe(
      "005827 易方达蓝筹精选混合",
    );
  });
});

describe("resolveFundChineseName", () => {
  it("prefers document content over fallback", async () => {
    const samplePath = path.join(
      process.cwd(),
      "seed/test-upload/005827-Yifangda-Blue-Chip-Selected/expert_opinion/active-equity-outlook-2026.md",
    );
    const buffer = readFileSync(samplePath);
    const result = await resolveFundChineseName({
      fundCode: "005827",
      files: [{ filename: "active-equity-outlook-2026.md", buffer }],
    });
    expect(result.source).toBe("document");
    expect(result.name).toBe("易方达蓝筹精选混合");
  });
});
