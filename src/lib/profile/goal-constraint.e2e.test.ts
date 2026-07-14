/**
 * End-to-end verification: goal_constraint_parse harness tool
 *
 * Tests the full harness-tool pipeline for all 5 goal types:
 *   1. Multi-choice text → runGoalConstraintParse() → structured payload
 *   2. Structured payload → validateGoalConstraint() → data
 *   3. Verify data shape matches GoalConstraintProposePayload requirements
 *
 * Simulates what the agent does: receives user's multi-choice answer,
 * calls goal_constraint_parse tool, receives payload for profile_propose.
 *
 * Question format (5 questions total):
 *   Q1-Q5: shared investment questions
 *     - risk_tolerance (A/B/C/D)
 *     - max_drawdown (number)
 *     - target_return (number)
 *     - principal_amount (number)
 *     - monthly_amount (number)
 */

import { describe, expect, it } from "vitest";
import { runGoalConstraintParse } from "@/harness/tools/goal_constraint_parse";
import { validateGoalConstraint } from "@/lib/profile/goal-constraint";
import { GOAL_TYPES } from "@/lib/profile/goal-constraint";
import type { GoalConstraintProposePayload } from "@/lib/profile/types";

// ── Shared question answers only (Q1-Q5) ──
// Q1: risk_tolerance (B=稳健), Q2: max_drawdown (10), Q3: target_return (6)
// Q4: principal_amount (500000), Q5: monthly_amount (5000)

const SHARED_REALISTIC = "1 B（稳健） 2 10 3 6 4 500000 5 5000";
const SHARED_MINIMAL = "1 B 2 10 3 6 4 500000 5 5000";

// ── Edge case: multiline answer ──

const MULTILINE_ANSWER =
  `1 B
2 10
3 8
4 1000000
5 10000`;

describe("End-to-end: goal_constraint_parse harness tool", () => {
  // ─── All 5 goal types: shared questions only ───

  it("marriage_child: realistic answer → structured payload", async () => {
    const result = await runGoalConstraintParse({
      text: SHARED_REALISTIC,
      goal_type: "marriage_child",
    });
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();

    const data = result.data as Record<string, unknown>;
    expect(data.goal_type).toBe("marriage_child");
    expect(data.investment_constraints).toBeDefined();
    expect(data.principal_amount).toBe(500000);
    expect(data.monthly_amount).toBe(5000);
  });

  it("housing: realistic answer → structured payload", async () => {
    const result = await runGoalConstraintParse({
      text: SHARED_REALISTIC,
      goal_type: "housing",
    });
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();

    const data = result.data as Record<string, unknown>;
    expect(data.goal_type).toBe("housing");
    expect(data.investment_constraints).toBeDefined();
    expect(data.principal_amount).toBe(500000);
    expect(data.monthly_amount).toBe(5000);
  });

  it("education: realistic answer → structured payload", async () => {
    const result = await runGoalConstraintParse({
      text: SHARED_REALISTIC,
      goal_type: "education",
    });
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();

    const data = result.data as Record<string, unknown>;
    expect(data.goal_type).toBe("education");
    expect(data.principal_amount).toBe(500000);
  });

  it("retirement: realistic answer → structured payload", async () => {
    const result = await runGoalConstraintParse({
      text: SHARED_REALISTIC,
      goal_type: "retirement",
    });
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();

    const data = result.data as Record<string, unknown>;
    expect(data.goal_type).toBe("retirement");
    expect(data.principal_amount).toBe(500000);
  });

  it("wealth_growth: realistic answer → structured payload", async () => {
    const result = await runGoalConstraintParse({
      text: SHARED_REALISTIC,
      goal_type: "wealth_growth",
    });
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();

    const data = result.data as Record<string, unknown>;
    expect(data.goal_type).toBe("wealth_growth");
    expect(data.principal_amount).toBe(500000);
  });

  // ─── Minimal format (no Chinese labels, just letters/numbers) ───

  it("all 5 goal types: minimal format (letters + numbers only)", async () => {
    const cases = [
      { type: "marriage_child", text: SHARED_MINIMAL },
      { type: "housing", text: SHARED_MINIMAL },
      { type: "education", text: SHARED_MINIMAL },
      { type: "retirement", text: SHARED_MINIMAL },
      { type: "wealth_growth", text: SHARED_MINIMAL },
    ] as const;

    for (const { type, text } of cases) {
      const result = await runGoalConstraintParse({ text, goal_type: type });
      expect(result.ok, `Failed for ${type}`).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.goal_type).toBe(type);
      expect(data.investment_constraints).toBeDefined();
    }
  });

  // ─── Error handling ───

  it("returns error for missing goal_type", async () => {
    const result = await runGoalConstraintParse({
      text: "1 B 2 10 3 6",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/goal_type/);
  });

  it("returns error for missing text", async () => {
    const result = await runGoalConstraintParse({
      goal_type: "marriage_child",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/text/);
  });

  it("returns error for empty text", async () => {
    const result = await runGoalConstraintParse({
      text: "   ",
      goal_type: "marriage_child",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/text/);
  });

  it("returns error for incomplete answer (too few answers)", async () => {
    const result = await runGoalConstraintParse({
      text: "1 B 2 10",
      goal_type: "marriage_child",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/不完整/);
  });

  // ─── Multiline whitespace tolerance ───

  it("handles multiline answer with newlines", async () => {
    const result = await runGoalConstraintParse({
      text: MULTILINE_ANSWER,
      goal_type: "marriage_child",
    });
    expect(result.ok).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.principal_amount).toBe(1000000);
    expect(data.monthly_amount).toBe(10000);
  });
});

describe("End-to-end: parsed output → validateGoalConstraint", () => {
  it("all 5 goal types pass validation after parse", async () => {
    const cases = [
      { type: "marriage_child" as const, text: SHARED_MINIMAL },
      { type: "housing" as const, text: SHARED_MINIMAL },
      { type: "education" as const, text: SHARED_MINIMAL },
      { type: "retirement" as const, text: SHARED_MINIMAL },
      { type: "wealth_growth" as const, text: SHARED_MINIMAL },
    ];

    for (const { type, text } of cases) {
      const parsed = await runGoalConstraintParse({ text, goal_type: type });
      expect(parsed.ok, `Parse failed for ${type}: ${parsed.error}`).toBe(true);

      // Construct the payload that would be passed to profile_propose
      const payload = {
        ...(parsed.data as Record<string, unknown>),
        goal_detail: {},
        profile_version_id: "00000000-0000-0000-0000-000000000001",
        goal_display_name: type,
        goal_constraint_id: "00000000-0000-0000-0000-000000000002",
      } as unknown as GoalConstraintProposePayload;

      const validation = validateGoalConstraint(payload);
      expect(validation.ok, `Validation failed for ${type}: ${validation.errors.join(" ")}`).toBe(true);
      expect(validation.data).toBeDefined();
      expect(validation.data!.goal_type).toBe(type);
    }
  });
});

describe("End-to-end: GOAL_TYPES coverage", () => {
  it("all 5 goal types are in GOAL_TYPES array", () => {
    expect(GOAL_TYPES).toContain("marriage_child");
    expect(GOAL_TYPES).toContain("housing");
    expect(GOAL_TYPES).toContain("education");
    expect(GOAL_TYPES).toContain("retirement");
    expect(GOAL_TYPES).toContain("wealth_growth");
    expect(GOAL_TYPES).toHaveLength(5);
  });
});
