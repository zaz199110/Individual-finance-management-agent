import { describe, expect, it } from "vitest";
import {
  needsWorkflowLock,
  isWriteWorkflowScene,
  sceneToLockKey,
  SH08_CODE,
  SH08_MESSAGE,
} from "./eligibility";
import type { ExecutionPlan } from "@/harness/types";

const sceneTaskPlan: ExecutionPlan = {
  intent: "scene_task",
  steps: [],
  requires_user_confirm: false,
};

const simpleQaPlan: ExecutionPlan = {
  intent: "simple_qa",
  steps: [],
  requires_user_confirm: false,
};

const crossScenePlan: ExecutionPlan = {
  intent: "cross_scene_handoff",
  steps: [],
  requires_user_confirm: true,
  target_scene: "portfolio",
};

describe("needsWorkflowLock", () => {
  it("locks profile scene_task", () => {
    expect(needsWorkflowLock("profile", sceneTaskPlan)).toBe(true);
  });

  it("locks plan scene_task", () => {
    expect(needsWorkflowLock("plan", sceneTaskPlan)).toBe(true);
  });

  it("locks portfolio scene_task", () => {
    expect(needsWorkflowLock("portfolio", sceneTaskPlan)).toBe(true);
  });

  it("skips chat scene", () => {
    expect(needsWorkflowLock("chat", sceneTaskPlan)).toBe(false);
  });

  it("skips fund scene", () => {
    expect(needsWorkflowLock("fund", sceneTaskPlan)).toBe(false);
  });

  it("skips simple_qa in portfolio", () => {
    expect(needsWorkflowLock("portfolio", simpleQaPlan)).toBe(false);
  });

  it("skips simple_qa in profile", () => {
    expect(needsWorkflowLock("profile", simpleQaPlan)).toBe(false);
  });

  it("skips cross_scene_handoff without trigger", () => {
    expect(needsWorkflowLock("portfolio", crossScenePlan)).toBe(false);
  });

  it("locks handoff autostart on plan", () => {
    expect(needsWorkflowLock("plan", simpleQaPlan, "handoff_autostart")).toBe(
      true,
    );
  });

  it("locks handoff autostart on profile", () => {
    expect(needsWorkflowLock("profile", simpleQaPlan, "handoff_autostart")).toBe(
      true,
    );
  });

  it("locks handoff autostart on portfolio", () => {
    expect(needsWorkflowLock("portfolio", simpleQaPlan, "handoff_autostart")).toBe(
      true,
    );
  });
});

describe("isWriteWorkflowScene", () => {
  it("returns true for profile, plan, portfolio", () => {
    expect(isWriteWorkflowScene("profile")).toBe(true);
    expect(isWriteWorkflowScene("plan")).toBe(true);
    expect(isWriteWorkflowScene("portfolio")).toBe(true);
  });

  it("returns false for chat, fund", () => {
    expect(isWriteWorkflowScene("chat")).toBe(false);
    expect(isWriteWorkflowScene("fund")).toBe(false);
  });
});

describe("sceneToLockKey", () => {
  it("returns the same scene string", () => {
    expect(sceneToLockKey("profile")).toBe("profile");
    expect(sceneToLockKey("plan")).toBe("plan");
    expect(sceneToLockKey("portfolio")).toBe("portfolio");
  });
});

describe("SH08 constants", () => {
  it("SH08_CODE is ERR-WRITE-LOCK", () => {
    expect(SH08_CODE).toBe("ERR-WRITE-LOCK");
  });

  it("SH08_MESSAGE mentions all three write scenes", () => {
    expect(SH08_MESSAGE).toContain("需求梳理");
    expect(SH08_MESSAGE).toContain("资产配置");
    expect(SH08_MESSAGE).toContain("持仓");
  });
});
