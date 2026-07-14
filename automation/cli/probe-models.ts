#!/usr/bin/env npx tsx
/**
 * 模型槽位检测 CLI — 与设置页「检测可用性」同源逻辑
 *
 * 用法:
 *   npm run probe:models              # 全部五槽位
 *   npm run probe:models -- reasoning # 单槽位
 *   npm run probe:models -- web embedding
 *   npm run probe:models -- --json
 */
import { loadTestEnv } from "../tests/helpers/load-env";
import {
  CHAT_REQUIRED_SLOTS,
  MODEL_SLOT_LABELS,
  probeAllModelSlots,
  probeModelSlot,
  resolveProviderStack,
} from "@/lib/config/model-providers";
import type { ModelSlot } from "@/lib/supabase/server";

const ALL_SLOTS: ModelSlot[] = [
  "reasoning",
  "deep",
  "vision",
  "web",
  "embedding",
];

function parseArgs(argv: string[]): { slots: ModelSlot[]; json: boolean } {
  const flags = argv.filter((a) => a.startsWith("--"));
  const positional = argv.filter((a) => !a.startsWith("--"));
  const json = flags.includes("--json");
  if (positional.length === 0 || positional.includes("all")) {
    return { slots: ALL_SLOTS, json };
  }
  const invalid = positional.filter(
    (s) => !ALL_SLOTS.includes(s as ModelSlot),
  );
  if (invalid.length) {
    console.error(`未知槽位: ${invalid.join(", ")}`);
    console.error(`可选: ${ALL_SLOTS.join(", ")}`);
    process.exit(2);
  }
  return { slots: positional as ModelSlot[], json };
}

async function main(): Promise<number> {
  loadTestEnv(true);
  const { slots, json } = parseArgs(process.argv.slice(2));

  const stack = resolveProviderStack();
  const results =
    slots.length === 1
      ? [await probeModelSlot(slots[0]!)]
      : await probeAllModelSlots({ slots });

  if (json) {
    console.log(
      JSON.stringify(
        {
          chat_required: CHAT_REQUIRED_SLOTS,
          stack: Object.fromEntries(
            ALL_SLOTS.map((s) => [
              s,
              stack[s]
                ? {
                    provider: stack[s]!.provider,
                    model_name: stack[s]!.model_name,
                    api_base_url: stack[s]!.api_base_url,
                  }
                : null,
            ]),
          ),
          results,
        },
        null,
        2,
      ),
    );
  } else {
    console.log("=== 模型槽位检测 ===\n");
    for (const r of results) {
      const label = MODEL_SLOT_LABELS[r.slot];
      const req = CHAT_REQUIRED_SLOTS.includes(r.slot) ? " [聊天必填]" : "";
      const icon = r.skipped ? "○" : r.ok ? "✓" : "✗";
      console.log(`${icon} ${label}${req}`);
      console.log(`  ${r.message}`);
      if (stack[r.slot]) {
        console.log(
          `  → ${stack[r.slot]!.provider} / ${stack[r.slot]!.model_name}`,
        );
      }
      console.log("");
    }
    const requiredFailed = results.filter(
      (r) => CHAT_REQUIRED_SLOTS.includes(r.slot) && !r.ok,
    );
    const optionalFailed = results.filter(
      (r) => !CHAT_REQUIRED_SLOTS.includes(r.slot) && !r.ok && !r.skipped,
    );
    if (requiredFailed.length === 0) {
      console.log("聊天就绪：推理 + 联网均已通过。");
    } else {
      console.log(
        `聊天未就绪：${requiredFailed.map((r) => MODEL_SLOT_LABELS[r.slot]).join("、")} 未通过。`,
      );
    }
    if (optionalFailed.length) {
      console.log(
        `可选槽位未通过：${optionalFailed.map((r) => MODEL_SLOT_LABELS[r.slot]).join("、")}`,
      );
    }
  }

  const exitFail = results.some(
    (r) =>
      (CHAT_REQUIRED_SLOTS.includes(r.slot) && !r.ok) ||
      (!CHAT_REQUIRED_SLOTS.includes(r.slot) && !r.ok && !r.skipped),
  );
  return exitFail ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
