import { describe, expect, it } from "vitest";
import { buildProfilePlaceholder } from "./placeholder";

const empty = {
  profile_version_id: null,
  has_basic_info: false,
  basic_info_summary: null,
  eligible_groups: [],
  incomplete_groups: [],
  active_constraint_count: 0,
};

describe("buildProfilePlaceholder", () => {
  it("welcomes new users with simple prompt", () => {
    const p = buildProfilePlaceholder(empty);
    expect(p.title).toMatch(/基本情况/);
    expect(p.empty_body).toMatch(/年龄、收入、家庭情况/);
  });

  it("shows ready message when has eligible groups", () => {
    const p = buildProfilePlaceholder({
      ...empty,
      has_basic_info: true,
      profile_version_id: "x",
      eligible_groups: [
        {
          goal_constraint_id: "g1",
          goal_type: "retirement",
          display_name: "退休养老",
        },
      ],
      active_constraint_count: 1,
    });
    expect(p.title).toBe("需求已整理好");
    expect(p.empty_body).toMatch(/回复「生成报告」/);
  });

  it("shows ready message when has incomplete groups", () => {
    const p = buildProfilePlaceholder({
      ...empty,
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
    });
    expect(p.title).toBe("需求已整理好");
    expect(p.empty_body).toMatch(/回复「生成报告」/);
  });

  it("shows copy hint when has basic info but no groups", () => {
    const p = buildProfilePlaceholder({
      ...empty,
      has_basic_info: true,
      profile_version_id: "x",
    });
    expect(p.title).toBe("基本情况已记录");
    expect(p.empty_body).toMatch(/当前画像/);
  });
});
