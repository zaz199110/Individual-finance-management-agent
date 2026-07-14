import { describe, expect, it } from "vitest";
import { resolveVaultDocPublishDate } from "./vault-doc-date";

describe("resolveVaultDocPublishDate", () => {
  it("prefers 送出日期 over 编制日期 and uploaded_at", () => {
    const text = `---
uploaded_at: 2026-06-12T00:00:00Z
---

编制日期：2026 年6 月4 日
送出日期：2026 年6 月5 日
`;
    expect(resolveVaultDocPublishDate(text)).toBe("2026-06-05");
  });

  it("falls back to uploaded_at frontmatter", () => {
    const text = `---
uploaded_at: 2026-06-12T00:00:00Z
fund_code: "206007"
---

# 摘要
`;
    expect(resolveVaultDocPublishDate(text)).toBe("2026-06-12");
  });

  it("parses version suffix from filename when body has no dates", () => {
    expect(
      resolveVaultDocPublishDate("---\n---\n", "019305/prospectus/product-summary-202606.md"),
    ).toBe("2026-06-01");
  });
});
