import { describe, expect, it } from "vitest";
import {
  COMPLIANCE_NOTICE_SHORT,
  stripTrailingComplianceNotice,
} from "./compliance";

describe("stripTrailingComplianceNotice", () => {
  it("removes plain trailing compliance line", () => {
    const input = `已为您整理资讯。

${COMPLIANCE_NOTICE_SHORT}`;
    expect(stripTrailingComplianceNotice(input)).toBe("已为您整理资讯。");
  });

  it("removes hr + compliance block", () => {
    const input = `正文。

---

${COMPLIANCE_NOTICE_SHORT}`;
    expect(stripTrailingComplianceNotice(input)).toBe("正文。");
  });

  it("removes blockquote compliance", () => {
    const input = `正文。

> ${COMPLIANCE_NOTICE_SHORT}`;
    expect(stripTrailingComplianceNotice(input)).toBe("正文。");
  });

  it("keeps unrelated trailing content", () => {
    const input = "基金有风险，投资需谨慎。";
    expect(stripTrailingComplianceNotice(input)).toBe(input);
  });
});
