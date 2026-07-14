import { describe, expect, it } from "vitest";
import { fundTsCode, resolvePrimaryIndexTsCode } from "@/lib/l0/tushare-client";

describe("L0 tushare client", () => {
  it("maps open-end fund code to ts_code", () => {
    expect(fundTsCode("019305")).toBe("019305.OF");
    expect(fundTsCode("110022")).toBe("110022.OF");
  });

  it("resolvePrimaryIndexTsCode maps benchmark text to index_daily ts_code", () => {
    expect(
      resolvePrimaryIndexTsCode("沪深300指数收益率×95%+银行一年定存×5%"),
    ).toBe("000300.SH");
    expect(resolvePrimaryIndexTsCode("中证同业存单AAA指数收益率×95%+…")).toBe(
      "931059.CSI",
    );
    expect(resolvePrimaryIndexTsCode("中证消费指数收益率×85%+…")).toBe("000932.SH");
    expect(resolvePrimaryIndexTsCode("未知复合基准")).toBeNull();
  });
});
