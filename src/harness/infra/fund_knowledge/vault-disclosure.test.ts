import { describe, expect, it } from "vitest";
import { ensureFundKnowledgeVault } from "./bootstrap";
import { syncSeedFundToVault } from "./enrich";
import { getFundKnowledgeRoot } from "./paths";
import { resolveVaultRiskLevel } from "./vault-disclosure";

describe("resolveVaultRiskLevel", () => {
  it("reads R level from product-summary", () => {
    ensureFundKnowledgeVault();
    syncSeedFundToVault("206007");
    const risk = resolveVaultRiskLevel(getFundKnowledgeRoot(), "206007");
    expect(risk).toMatch(/^R4/);
  });
});
