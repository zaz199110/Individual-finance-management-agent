import { describe, expect, it } from "vitest";
import {
  buildPlanBlockedBody,
  buildPlanPlaceholder,
  buildPlanPlaceholderHint,
} from "./placeholder";

const emptyProfile = {
  profile_version_id: null,
  has_basic_info: false,
  basic_info_summary: null,
  eligible_groups: [],
  incomplete_groups: [],
  active_constraint_count: 0,
};

describe("buildPlanPlaceholder", () => {
  it("N=0 explains blocked state and next step in customer-friendly tone", () => {
    const p = buildPlanPlaceholder(emptyProfile);
    expect(p.n).toBe(0);
    expect(p.title).toMatch(/资产配置/);
    expect(p.empty_body).toMatch(/暂时还不能/);
    expect(p.empty_body).toMatch(/需求梳理/);
    expect(p.empty_body).not.toMatch(/切换/);
    expect(p.empty_body).not.toMatch(/大类配置/);
  });

  it("N=0 with incomplete groups names the pending scene", () => {
    const read = {
      ...emptyProfile,
      has_basic_info: true,
      profile_version_id: "x",
      incomplete_groups: [
        {
          goal_constraint_id: "g1",
          goal_type: "retirement",
          display_name: "退休养老",
        },
      ],
      active_constraint_count: 1,
    };
    const p = buildPlanPlaceholder(read);
    expect(p.empty_body).toMatch(/退休养老/);
    expect(p.empty_body).toMatch(/还差一步/);
    expect(buildPlanPlaceholderHint(read)).toMatch(/退休养老/);
  });

  it("N=1 includes scene name", () => {
    const p = buildPlanPlaceholder({
      profile_version_id: "x",
      has_basic_info: true,
      basic_info_summary: "张先生",
      eligible_groups: [
        {
          goal_constraint_id: "g1",
          goal_type: "retirement",
          display_name: "退休养老",
        },
      ],
      incomplete_groups: [],
      active_constraint_count: 1,
    });
    expect(p.n).toBe(1);
    expect(p.title).toMatch(/退休养老/);
  });
});

describe("buildPlanBlockedBody", () => {
  it("fresh user gets start-from-scratch guidance", () => {
    const body = buildPlanBlockedBody(emptyProfile);
    expect(body).toMatch(/暂时还不能/);
    expect(body).toMatch(/需求梳理/);
    expect(body).not.toMatch(/大类配置/);
  });
});
