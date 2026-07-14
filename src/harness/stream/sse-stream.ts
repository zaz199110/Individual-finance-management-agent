import type { SseWriter } from "@/harness/types";

/** 让 UI 有机会渲染 running 状态（约一帧）；仅在需要刻意错帧时使用 */
export async function yieldStageFrame(ms = 0): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** 推送已生成完毕的正文；短文本一次送达，长文本大块推送，避免人为逐字延迟 */
export async function streamTextViaSse(
  sse: SseWriter,
  text: string,
  chunkSize = 512,
): Promise<void> {
  if (!text) return;
  if (text.length <= chunkSize) {
    sse.write("token_delta", { text });
    return;
  }
  for (let i = 0; i < text.length; i += chunkSize) {
    sse.write("token_delta", { text: text.slice(i, i + chunkSize) });
  }
}
