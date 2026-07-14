import { ensureSeedFundsL0Synced } from "@/lib/l0/l0-sync";

export async function runSeedSync(
  _input: Record<string, unknown>,
): Promise<{
  ok: boolean;
  preview: string;
  data?: unknown;
  error?: string;
}> {
  try {
    const results = await ensureSeedFundsL0Synced({ force: true });
    const synced = results.filter((r) => r.status === "synced");
    const skipped = results.filter((r) => r.status === "skipped");
    const failed = results.filter((r) => r.status === "failed");

    const lines: string[] = [
      `种子基金 L0 批量同步完成：${synced.length} 只成功，${skipped.length} 只跳过，${failed.length} 只失败`,
    ];

    if (synced.length) {
      lines.push(
        "已同步：" +
          synced.map((r) => `${r.fund_code}（${r.fund_name ?? "—"}）`).join("、"),
      );
    }
    if (failed.length) {
      lines.push(
        "失败：" +
          failed.map((r) => `${r.fund_code}：${r.reason}`).join("；"),
      );
    }

    return {
      ok: failed.length === 0,
      preview: lines.join("\n"),
      data: results,
    };
  } catch (e) {
    return {
      ok: false,
      preview: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
