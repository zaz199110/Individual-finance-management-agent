export const GOAL_TYPE_LABELS: Record<string, string> = {
  marriage_child: "结婚生育",
  housing: "购房置业",
  education: "子女教育",
  retirement: "退休养老",
  wealth_growth: "财富增值",
};

export function goalDisplayName(
  goalType: string,
  _displayName?: string | null,
): string {
  return GOAL_TYPE_LABELS[goalType] ?? goalType;
}
