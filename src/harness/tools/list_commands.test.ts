import { describe, expect, it } from "vitest";
import { listCommands } from "@/harness/tools/list_commands";

describe("list_commands", () => {
  it("returns chat slash commands per registry", () => {
    const commands = listCommands({ scene: "chat", slashOnly: true });
    const ids = commands.map((c) => c.id);
    expect(ids).toContain("web_search");
    expect(ids).toContain("vision_parse");
    expect(ids).not.toContain("profile_propose");
  });

  it("includes harness_tool mapping", () => {
    const commands = listCommands({ scene: "chat" });
    const web = commands.find((c) => c.id === "web_search");
    expect(web?.harness_tool).toBe("web_search");
    expect(web?.description_zh).toBeTruthy();
  });
});
