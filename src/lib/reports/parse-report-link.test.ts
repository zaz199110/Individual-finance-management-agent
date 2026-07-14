import { describe, expect, it } from "vitest";
import { parseReportDeepLink } from "./parse-report-link";

describe("parseReportDeepLink", () => {
  it("parses markdown link path", () => {
    const r = parseReportDeepLink(
      "请看 [/reports?tab=plan&id=00000000-0000-0000-0000-000000000001](/reports?tab=plan&id=00000000-0000-0000-0000-000000000001)",
    );
    expect(r?.tab).toBe("plan");
    expect(r?.report_id).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("parses bare query in message", () => {
    const r = parseReportDeepLink(
      "/reports?tab=profile&id=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );
    expect(r?.tab).toBe("profile");
    expect(r?.report_id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  it("returns null for unrelated text", () => {
    expect(parseReportDeepLink("019305 净值多少")).toBeNull();
  });
});
