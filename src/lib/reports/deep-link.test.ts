import { describe, expect, it } from "vitest";
import { buildReportDeepLink } from "./deep-link";

describe("buildReportDeepLink", () => {
  it("builds full URL with origin", () => {
    const url = buildReportDeepLink({
      tab: "plan",
      reportId: "abc-123",
      conversationId: "conv-1",
      origin: "http://localhost:3000",
    });
    expect(url).toBe(
      "http://localhost:3000/reports?tab=plan&id=abc-123&c=conv-1",
    );
  });

  it("omits c when no conversation", () => {
    const url = buildReportDeepLink({
      tab: "fund",
      reportId: "uuid",
      origin: "https://app.example.com",
    });
    expect(url).toBe("https://app.example.com/reports?tab=fund&id=uuid");
  });
});
