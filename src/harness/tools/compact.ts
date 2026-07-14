import { runCompactPipeline } from "@/harness/context/compact";
import type { CompactContext } from "@/harness/context/compact";

export async function compactCommand(
  messages: Parameters<typeof runCompactPipeline>[0],
  ctx: CompactContext,
) {
  return runCompactPipeline(messages, ctx);
}
