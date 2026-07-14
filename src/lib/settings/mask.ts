/** 密钥类字段的对客掩码展示 */
export function maskSecret(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const token = value.trim();
  if (token.length <= 8) return "••••••";
  return `${token.slice(0, 4)}••••${token.slice(-4)}`;
}

export function emptyLabel(masked: string | null | undefined): string {
  return masked ? masked : "未设置";
}
