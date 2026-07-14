import { describe, expect, it } from "vitest";
import { loadSkillContent, loadSkillIndex } from "@/harness/skills/loader";

describe("skill loader", () => {
  it("loads profile_intake skill from disk", () => {
    const content = loadSkillContent("profile_intake");
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(100);
  });

  it("builds skill index for profile scene", () => {
    const index = loadSkillIndex("profile");
    expect(index).toContain("profile_intake");
  });
});
