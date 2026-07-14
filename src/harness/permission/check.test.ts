import { describe, expect, it } from "vitest";
import { checkToolPermission } from "@/harness/permission/check";

describe("checkToolPermission", () => {
  it("denies propose in chat scene", () => {
    const r = checkToolPermission("profile_propose", "chat");
    expect(r.permission).toBe("deny");
  });

  it("requires confirm for write tools", () => {
    const r = checkToolPermission("profile_confirm", "profile");
    expect(r.permission).toBe("needs_confirm");
  });

  it("allows read tools", () => {
    const r = checkToolPermission("web_search", "chat");
    expect(r.permission).toBe("allow");
  });
});
