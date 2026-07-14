import { describe, expect, it } from "vitest";
import {
  appendConversationQuery,
  resolveSidebarActive,
} from "@/lib/layout/shell-route";

describe("shell-route", () => {
  it("resolves active nav from pathname", () => {
    expect(resolveSidebarActive("/chat")).toBe("chat");
    expect(resolveSidebarActive("/reports")).toBe("reports");
    expect(resolveSidebarActive("/reports/view")).toBe("reports");
    expect(resolveSidebarActive("/settings/models")).toBe("settings");
  });

  it("appends c= to global nav hrefs", () => {
    expect(appendConversationQuery("/reports", "abc")).toBe("/reports?c=abc");
    expect(appendConversationQuery("/reports?tab=fund", "abc")).toBe(
      "/reports?tab=fund&c=abc",
    );
    expect(appendConversationQuery("/reports", null)).toBe("/reports");
  });
});
