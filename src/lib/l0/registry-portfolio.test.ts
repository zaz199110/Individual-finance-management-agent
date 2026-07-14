import { describe, expect, it } from "vitest";
import { inferHoldingsKind } from "./registry-portfolio";

describe("registry-portfolio", () => {
  it("infers holdings_kind from archetype", () => {
    expect(inferHoldingsKind("A")).toBe("stock");
    expect(inferHoldingsKind("C")).toBe("stock");
    expect(inferHoldingsKind("B", "指数型 · 固收 · 同业存单")).toBe("cd");
    expect(inferHoldingsKind("E")).toBe("bond");
    expect(inferHoldingsKind("F")).toBe("fund");
  });
});
