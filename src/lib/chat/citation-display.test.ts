import { describe, expect, it } from "vitest";
import {
  citationHostname,
  formatCitationTitle,
  shouldShowMessageCitations,
  stripTrailingCitationSection,
} from "./citation-display";

describe("formatCitationTitle", () => {
  it("replaces underscores and truncates long titles", () => {
    const long = "Weather_Weather Forecast Query, 24 hours, today, tomorrow, weekly";
    expect(formatCitationTitle(long, 30)).toBe("Weather Weather Forecast Quer…");
  });

  it("falls back when title is empty", () => {
    expect(formatCitationTitle("   ")).toBe("参考链接");
  });
});

describe("citationHostname", () => {
  it("extracts hostname without www", () => {
    expect(citationHostname("https://www.example.com/path")).toBe("example.com");
  });
});

describe("shouldShowMessageCitations", () => {
  it("shows citations for all tabs including free Q&A", () => {
    expect(shouldShowMessageCitations("chat")).toBe(true);
    expect(shouldShowMessageCitations("fund")).toBe(true);
    expect(shouldShowMessageCitations("profile")).toBe(true);
  });
});

describe("stripTrailingCitationSection", () => {
  it("removes trailing 参考来源 block", () => {
    const input = `您好，今天有雨。

**参考来源**：
- [来源A](https://a.test)
- [来源B](https://b.test)`;
    expect(stripTrailingCitationSection(input)).toBe("您好，今天有雨。");
  });

  it("keeps content when no citation section", () => {
    const input = "正文不含参考来源段落。";
    expect(stripTrailingCitationSection(input)).toBe(input);
  });
});
