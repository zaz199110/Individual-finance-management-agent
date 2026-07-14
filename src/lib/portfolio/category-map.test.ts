import { describe, expect, it } from "vitest";
import { aggregateCategories, classifyFund } from "./category-map";

describe("classifyFund", () => {
  it("classifies 货币型 funds", () => {
    const r = classifyFund({
      fund_type: "货币型",
      fund_name: "广发钱袋子",
    });
    expect(r.display).toBe("货币型");
  });

  it("classifies 混合型 with stock bias as 股票型", () => {
    const r = classifyFund({
      fund_type: "混合型 · 偏股",
    });
    expect(r.display).toBe("股票型");
  });

  it("classifies plain 混合型", () => {
    const r = classifyFund({ fund_type: "混合型" });
    expect(r.display).toBe("混合型");
  });
});

describe("aggregateCategories", () => {
  it("aggregates market_value by category", () => {
    const slices = aggregateCategories([
      { market_value: 30000, category: "债券型" },
      { market_value: 20000, category: "货币型" },
      { market_value: 38500, category: "指数型" },
    ]);
    const stock = slices.find((s) => s.category === "指数型");
    expect(stock?.market_value).toBe(38500);
    expect(stock?.pct).toBeCloseTo(43.5, 0);
  });
});
