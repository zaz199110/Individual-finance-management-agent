import { describe, expect, it } from "vitest";
import {
  isWebPortalJunk,
  pickBestDisclosureExcerpt,
  truncateAtPortalJunk,
} from "@/lib/kb/disclosure-parse";

describe("disclosure excerpt quality", () => {
  it("detects portal junk", () => {
    expect(
      isWebPortalJunk("017704基金财经纵横_新浪网：·基金一览·净值走势图 流水号 3767895"),
    ).toBe(true);
  });

  it("prefers prospectus over portal summary", () => {
    const l1 =
      "投资目标 跟踪同业存单AAA指数。投资范围 主要投资于标的指数成份券，不投资于股票。";
    const l3 =
      "017704 兴业同业存单 基金财经纵横_新浪网 ·基金一览·净值走势图 流水号 3767895";
    expect(pickBestDisclosureExcerpt([l3, l1])).toBe(l1);
  });

  it("truncateAtPortalJunk cuts sina tail", () => {
    const raw =
      "主要投资于同业存单与债券。兴业基金(017704)新浪网：·基金一览·流水号123";
    expect(truncateAtPortalJunk(raw)).not.toMatch(/新浪/);
    expect(truncateAtPortalJunk(raw)).toMatch(/同业存单/);
  });
});
