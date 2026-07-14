import { describe, expect, it } from "vitest";
import {
  isLinkClickable,
  parseMarkdown,
} from "@/lib/reports/markdown-render";

describe("report markdown render", () => {
  const validIds = new Set(["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"]);

  it("allows external links in draft policy", () => {
    expect(
      isLinkClickable("https://example.com/doc", "draft", validIds),
    ).toBe(true);
  });

  it("blocks unknown report deep links in draft policy", () => {
    expect(
      isLinkClickable(
        "/reports?tab=plan&id=00000000-0000-0000-0000-000000000099",
        "draft",
        validIds,
      ),
    ).toBe(false);
  });

  it("allows indexed report deep links in draft policy", () => {
    expect(
      isLinkClickable(
        "/reports?tab=profile&id=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        "draft",
        validIds,
      ),
    ).toBe(true);
  });

  it("allows fund-knowledge deep links in draft policy", () => {
    expect(
      isLinkClickable(
        "/fund-knowledge?fund=017704&path=foo%2Fbar.md&line=10",
        "draft",
        validIds,
      ),
    ).toBe(true);
  });

  it("parses markdown links inside table cells", () => {
    const md = `| 操作 |
|---|
| [查看原文](/fund-knowledge?fund=017704&path=a.md&line=1) |
`;
    const blocks = parseMarkdown(md, "published", validIds);
    const table = blocks.find((b) => b.kind === "table");
    expect(table?.rows?.[0]?.[0]).toContain("[查看原文]");
  });

  it("parses echarts fenced blocks", () => {
    const md = `# Chart

\`\`\`echarts
{"series":[{"type":"bar","data":[1,2]}]}
\`\`\`
`;
    const blocks = parseMarkdown(md, "published", validIds);
    expect(blocks.filter((b) => b.kind === "echarts")).toHaveLength(1);
  });
});
