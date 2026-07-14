/** 检查对话列表项是否有未确认的小红点（如未读系统通知） */
export function hasUnconfirmedOrangeDot(meta: {
  has_unconfirmed: boolean;
}): boolean {
  return meta.has_unconfirmed === true;
}
