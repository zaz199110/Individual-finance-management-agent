import { parseReportDeepLink } from "@/lib/reports/parse-report-link";
import { executeTool } from "@/harness/tools/router";
import { writeStage } from "@/harness/tasks/stage";
import type { QueryState, SseWriter } from "@/harness/types";

/** RPT-LINK-01 · 五 Tab 通用：消息含报告深链时注入 report_read 上下文 */
export async function injectReportReadIfPresent(
  state: QueryState,
  userMessage: string,
  sse: SseWriter,
): Promise<string[]> {
  const link = parseReportDeepLink(userMessage);
  if (!link) return [];

  await writeStage(sse, state, {
    task_key: "report_read",
    status: "running",
  });

  const reportResult = await executeTool({
    tool: "report_read",
    input: {
      report_id: link.report_id,
      tab: link.tab,
    },
    scene: state.scene,
    conversationId: state.conversationId,
    runId: state.runId,
  });

  await writeStage(sse, state, {
    task_key: "report_read",
    status: "done",
  });

  if (reportResult.ok) {
    return [
      `已发布报告快照（report_read · 勿写入 system block）：\n${reportResult.preview}`,
    ];
  }
  if (reportResult.error) {
    return [`report_read 失败：${reportResult.error}`];
  }
  return [];
}
