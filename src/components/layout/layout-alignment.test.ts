import { describe, expect, it } from "vitest";
import { PAGE_PAD_X, pageSectionClasses } from "@/components/layout/page-layout";
import { SIDEBAR_PAD_X, sidebarSectionClasses } from "@/components/layout/sidebar-layout";

describe("layout alignment tokens", () => {
  it("sidebar sections share the same horizontal padding", () => {
    for (const section of Object.values(sidebarSectionClasses)) {
      expect(section).toContain(SIDEBAR_PAD_X);
    }
  });

  it("page chrome sections share the same horizontal padding", () => {
    const sections = [
      pageSectionClasses.header,
      pageSectionClasses.subheader,
      pageSectionClasses.toolbar,
      pageSectionClasses.banner,
      pageSectionClasses.panelToolbar,
      pageSectionClasses.content,
    ];
    for (const section of sections) {
      expect(section).toContain(PAGE_PAD_X);
    }
  });
});
