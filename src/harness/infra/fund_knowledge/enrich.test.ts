import { describe, expect, it } from "vitest";
import { ensureFundKnowledgeVault } from "./bootstrap";
import {
  enrichFundKnowledgeVault,
  shouldEnrichFundKnowledge,
  syncSeedFundToVault,
  vaultHasMinimumDisclosure,
} from "./enrich";
import { rebuildIndex } from "./index-db";
import { getFundKnowledgeRoot } from "./paths";

describe("fund knowledge enrich (FK-ENRICH-01)", () => {
  it("206007 seed satisfies minimum disclosure after sync", () => {
    ensureFundKnowledgeVault();
    syncSeedFundToVault("206007");
    const vaultRoot = getFundKnowledgeRoot();
    rebuildIndex({ vaultRoot, scope: "fund", fund_code: "206007" });
    expect(vaultHasMinimumDisclosure(vaultRoot, "206007")).toBe(true);
    expect(shouldEnrichFundKnowledge("206007", vaultRoot)).toBe(false);
  });

  it("enrichFundKnowledgeVault skips when vault already complete", async () => {
    ensureFundKnowledgeVault();
    syncSeedFundToVault("017704");
    const vaultRoot = getFundKnowledgeRoot();
    rebuildIndex({ vaultRoot, scope: "fund", fund_code: "017704" });

    const result = await enrichFundKnowledgeVault({
      fundCode: "017704",
      fundName: "兴业中证同业存单AAA指数7天持有期",
    });
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
  });
});
