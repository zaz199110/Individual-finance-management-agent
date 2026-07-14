import { describe, expect, it } from "vitest";
import { buildCustomerUsageGuide } from "@/lib/usage/usage-guide-customer";

describe("buildCustomerUsageGuide", () => {
  it("includes all scene ids in stable order", () => {
    const guide = buildCustomerUsageGuide();
    expect(guide.scenes.map((s) => s.scene)).toEqual([
      "chat",
      "profile",
      "plan",
      "portfolio",
      "fund",
    ]);
  });

  it("each scene has intro and at least one section", () => {
    const guide = buildCustomerUsageGuide();
    for (const scene of guide.scenes) {
      expect(scene.intro.length).toBeGreaterThan(10);
      expect(scene.sections.length).toBeGreaterThan(0);
    }
  });
});
