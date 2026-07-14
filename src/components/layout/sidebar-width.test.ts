import { describe, expect, it } from "vitest";
import {
  clampSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "@/components/layout/sidebar-width";

describe("sidebar-width", () => {
  it("clamps to 200-600", () => {
    expect(clampSidebarWidth(100)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(800)).toBe(SIDEBAR_MAX_WIDTH);
    expect(clampSidebarWidth(320)).toBe(320);
  });

  it("default width fits typical structured conversation title", () => {
    expect(SIDEBAR_DEFAULT_WIDTH).toBeGreaterThanOrEqual(320);
    expect(SIDEBAR_DEFAULT_WIDTH).toBeLessThanOrEqual(SIDEBAR_MAX_WIDTH);
  });
});
