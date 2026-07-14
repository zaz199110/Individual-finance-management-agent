import { describe, expect, it } from "vitest";
import {
  isVaultFundDir,
  parseFundCodeFromVaultDir,
  parseFundCodeFromVaultRelPath,
  parseFundNameFromVaultDir,
  vaultDirName,
} from "@/lib/fund-knowledge/vault-dir";

describe("vault-dir parsing", () => {
  it("recognizes legacy hyphen dirs", () => {
    expect(isVaultFundDir("019305-Morgan-SnP500-QDII-C")).toBe(true);
    expect(parseFundCodeFromVaultDir("019305-Morgan-SnP500-QDII-C")).toBe("019305");
  });

  it("recognizes new space + Chinese name dirs", () => {
    expect(isVaultFundDir("005827 易方达蓝筹精选混合")).toBe(true);
    expect(parseFundCodeFromVaultDir("005827 易方达蓝筹精选混合")).toBe("005827");
    expect(parseFundNameFromVaultDir("005827 易方达蓝筹精选混合")).toBe(
      "易方达蓝筹精选混合",
    );
    expect(vaultDirName("005827", "易方达蓝筹精选混合")).toBe(
      "005827 易方达蓝筹精选混合",
    );
  });

  it("parses fund code from relative md path", () => {
    expect(
      parseFundCodeFromVaultRelPath("005827 易方达蓝筹精选混合/expert_opinion/a.md"),
    ).toBe("005827");
    expect(parseFundCodeFromVaultRelPath("019305-Morgan-SnP500-QDII-C/prospectus/a.md")).toBe(
      "019305",
    );
  });
});
