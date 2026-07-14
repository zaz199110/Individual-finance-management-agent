/** HARNESS §6.3 — L4 触发与熔断默认值（可用 env 覆盖） */

export function getAutoCompactThresholdTokens(): number {
  const raw = process.env.HARNESS_AUTO_COMPACT_THRESHOLD;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 80_000;
}

export function getMinCompactSavingsTokens(): number {
  const raw = process.env.HARNESS_MIN_COMPACT_SAVINGS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 20_000;
}

export function getCompactFailureCircuitBreaker(): number {
  const raw = process.env.HARNESS_COMPACT_FAILURE_CB;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 3;
}

export function isL4Skipped(): boolean {
  return process.env.HARNESS_SKIP_L4 === "1";
}
