import type { ProposeArtifactRow } from "@/lib/profile/artifacts";
import type { PatchStrategy } from "./index";

interface AllocationPatchBody {
  target_allocation?: {
    categories?: Array<{ category: string; allocation_pct: number }>;
  };
}

export const PlanAllocationPatchStrategy: PatchStrategy = {
  validate(body: unknown, _artifact: ProposeArtifactRow): string[] {
    const errors: string[] = [];
    const b = body as AllocationPatchBody;

    const ta = b.target_allocation;
    if (!ta || !Array.isArray(ta.categories) || ta.categories.length === 0) {
      errors.push("target_allocation.categories 必填且不能为空。");
      return errors;
    }

    let sum = 0;
    for (const c of ta.categories) {
      const pct = Number(c.allocation_pct);
      if (!Number.isFinite(pct) || pct < 0) {
        errors.push(`分类 "${c.category}" 的 allocation_pct 无效。`);
      } else {
        sum += pct;
      }
    }

    if (Math.abs(sum - 100) > 0.5) {
      errors.push(`大类比例之和须为 100%（当前 ${sum}）。`);
    }

    return errors;
  },

  merge(
    existing: Record<string, unknown>,
    body: unknown,
    _artifact: ProposeArtifactRow,
  ): Record<string, unknown> {
    const b = body as AllocationPatchBody;
    const existingTa = existing.target_allocation as Record<string, unknown> | undefined;

    return {
      ...existing,
      target_allocation: {
        ...(existingTa && typeof existingTa === "object" ? existingTa : {}),
        categories: b.target_allocation!.categories,
      },
    };
  },
};
