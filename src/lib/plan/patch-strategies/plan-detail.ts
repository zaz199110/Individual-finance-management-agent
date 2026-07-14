import type { ProposeArtifactRow } from "@/lib/profile/artifacts";
import type { PatchStrategy } from "./index";

interface FundItem {
  fund_code: string;
  fund_name: string;
  weight_in_category?: number;
  allocation_pct_of_portfolio: number;
  recommendation_reason?: string;
  role_label?: string;
}

interface Category {
  category: string;
  allocation_pct: number;
  items: FundItem[];
  structure_note?: string;
}

interface DetailPatchBody {
  detailed_plan?: {
    categories?: Category[];
  };
}

export const PlanDetailPatchStrategy: PatchStrategy = {
  validate(body: unknown, _artifact: ProposeArtifactRow): string[] {
    const errors: string[] = [];
    const b = body as DetailPatchBody;

    if (!b.detailed_plan || !Array.isArray(b.detailed_plan.categories)) {
      errors.push("detailed_plan.categories 必填。");
      return errors;
    }

    const fundCodes = new Set<string>();

    for (const cat of b.detailed_plan.categories) {
      if (!cat.category) {
        errors.push("category 名称不能为空。");
      }

      const pct = Number(cat.allocation_pct);
      if (!Number.isFinite(pct) || pct < 0) {
        errors.push(`分类 "${cat.category}" 的 allocation_pct 无效。`);
      }

      if (!Array.isArray(cat.items)) {
        errors.push(`分类 "${cat.category}" 缺少 items 数组。`);
        continue;
      }

      for (const item of cat.items) {
        if (!item.fund_code) {
          errors.push(`分类 "${cat.category}" 中存在缺少 fund_code 的基金。`);
          continue;
        }

        // Check for duplicate fund codes
        if (fundCodes.has(item.fund_code)) {
          errors.push(`基金代码 "${item.fund_code}" 重复。`);
        }
        fundCodes.add(item.fund_code);

        const portfolioPct = Number(item.allocation_pct_of_portfolio);
        if (!Number.isFinite(portfolioPct) || portfolioPct < 0) {
          errors.push(
            `基金 "${item.fund_code}" 的 allocation_pct_of_portfolio 无效。`,
          );
        }
      }
    }

    return errors;
  },

  merge(
    existing: Record<string, unknown>,
    body: unknown,
    _artifact: ProposeArtifactRow,
  ): Record<string, unknown> {
    const b = body as DetailPatchBody;

    return {
      ...existing,
      detailed_plan: {
        ...(existing.detailed_plan && typeof existing.detailed_plan === "object"
          ? (existing.detailed_plan as Record<string, unknown>)
          : {}),
        categories: b.detailed_plan!.categories,
      },
    };
  },

  warnings(
    existing: Record<string, unknown>,
    body: unknown,
    _artifact: ProposeArtifactRow,
  ): string[] {
    const warnings: string[] = [];
    const b = body as DetailPatchBody;
    const existingPayload = existing as {
      target_allocation_summary?: Record<string, number>;
    };

    // Compare fund category weights with target allocation summary
    if (existingPayload.target_allocation_summary && b.detailed_plan?.categories) {
      for (const cat of b.detailed_plan.categories) {
        const targetPct =
          existingPayload.target_allocation_summary[cat.category];
        if (
          targetPct !== undefined &&
          Math.abs(cat.allocation_pct - targetPct) > 5
        ) {
          warnings.push(
            `${cat.category} 类别权重 ${cat.allocation_pct}% 与目标 ${targetPct}% 偏差较大`,
          );
        }
      }
    }

    return warnings;
  },
};
