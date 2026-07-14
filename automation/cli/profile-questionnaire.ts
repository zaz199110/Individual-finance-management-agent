#!/usr/bin/env npx tsx
/** 客户信息问卷 CLI — 展示 / 校验 / 样例 propose（不调 LLM） */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateBasicInfo, formatBasicInfoCardBody } from "../../src/lib/profile/basic-info";
import {
  loadSampleGoalPayload,
  validateGoalConstraint,
  formatGoalConstraintCardBody,
} from "../../src/lib/profile/goal-constraint";
import { loadSampleBasicPayload, profileProposeBasic, profileProposeGoalConstraint } from "../../src/lib/profile/propose";
import { profileRead } from "../../src/lib/profile/read";
import { getSupabase } from "../../src/lib/supabase/server";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function usage(): void {
  console.log(`用法:
  npm run profile:questionnaire show
  npm run profile:questionnaire validate -- --file path/to/basic.json
  npm run profile:questionnaire sample
  npm run profile:questionnaire read
  npm run profile:questionnaire propose -- --conversation-id UUID [--file basic.json]
  npm run profile:questionnaire goal-pick
  npm run profile:questionnaire goal-sample
  npm run profile:questionnaire goal-validate -- --file goal.json
  npm run profile:questionnaire goal-propose -- --conversation-id UUID [--file goal.json]
`);
}

async function cmdShow(): Promise<void> {
  const qPath = path.join(root, "skills/profile/questionnaire.base.zh.md");
  console.log(fs.readFileSync(qPath, "utf8"));
}

async function cmdValidate(fileArg: string | undefined): Promise<void> {
  if (!fileArg) {
    console.error("请提供 --file");
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(fileArg, "utf8"));
  const info = raw.basic_info ?? raw;
  const result = validateBasicInfo(info);
  if (result.ok) {
    console.log("✅ 校验通过");
    if (result.warnings.length) {
      console.warn("警告:", result.warnings.join("; "));
    }
    console.log(formatBasicInfoCardBody(result.data!));
  } else {
    console.error("❌", result.errors.join("; "));
    process.exit(1);
  }
}

function cmdSample(): void {
  const sample = loadSampleBasicPayload();
  console.log(JSON.stringify(sample, null, 2));
}

async function cmdRead(): Promise<void> {
  const supabase = await getSupabase();
  const data = await profileRead(supabase);
  console.log(JSON.stringify(data, null, 2));
}

async function cmdPropose(
  conversationId: string | undefined,
  fileArg: string | undefined,
): Promise<void> {
  if (!conversationId) {
    console.error("请提供 --conversation-id");
    process.exit(1);
  }
  const supabase = await getSupabase();
  if (!supabase) {
    console.error("数据库未连接");
    process.exit(1);
  }

  let payload = loadSampleBasicPayload();
  if (fileArg) {
    const raw = JSON.parse(fs.readFileSync(fileArg, "utf8"));
    payload = raw.kind ? raw : { kind: "profile_basic", basic_info: raw };
  }

  const runId = "cli" + Date.now().toString(36);
  const result = await profileProposeBasic(supabase, {
    conversationId,
    runId,
    payload,
  });

  if (!result.ok) {
    console.error("❌", result.error);
    process.exit(1);
  }

  console.log("✅ propose_artifacts 已创建");
  console.log("artifact_id:", result.artifact_id);
  console.log("summary:", result.summary_zh);
}

function parseArgs(argv: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file") out.file = argv[++i];
    if (argv[i] === "--conversation-id") out.conversationId = argv[++i];
  }
  return out;
}

function cmdGoalPick(): void {
  const p = path.join(root, "skills/profile/questionnaire.goal.pick.zh.md");
  console.log(fs.readFileSync(p, "utf8"));
}

function cmdGoalSample(): void {
  console.log(JSON.stringify(loadSampleGoalPayload(), null, 2));
}

async function cmdGoalValidate(fileArg: string | undefined): Promise<void> {
  if (!fileArg) {
    console.error("请提供 --file");
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(fileArg, "utf8"));
  const result = validateGoalConstraint(raw.kind ? raw : { kind: "goal_constraint", ...raw });
  if (result.ok && result.data) {
    console.log("✅ 校验通过");
    console.log(formatGoalConstraintCardBody(result.data));
  } else {
    console.error("❌", result.errors.join("; "));
    process.exit(1);
  }
}

async function cmdGoalPropose(
  conversationId: string | undefined,
  fileArg: string | undefined,
): Promise<void> {
  if (!conversationId) {
    console.error("请提供 --conversation-id");
    process.exit(1);
  }
  const supabase = await getSupabase();
  if (!supabase) {
    console.error("数据库未连接");
    process.exit(1);
  }
  let payload = loadSampleGoalPayload();
  if (fileArg) {
    const raw = JSON.parse(fs.readFileSync(fileArg, "utf8"));
    payload = raw.kind ? raw : { kind: "goal_constraint", ...raw };
  }
  const runId = "cli" + Date.now().toString(36);
  const result = await profileProposeGoalConstraint(supabase, {
    conversationId,
    runId,
    payload,
  });
  if (!result.ok) {
    console.error("❌", result.error);
    process.exit(1);
  }
  console.log("✅ goal_constraint propose_artifacts 已创建");
  console.log("artifact_id:", result.artifact_id);
}

async function main(): Promise<void> {
  const sub = process.argv[2];
  const args = parseArgs(process.argv.slice(3));

  switch (sub) {
    case "show":
      await cmdShow();
      break;
    case "validate":
      await cmdValidate(args.file);
      break;
    case "sample":
      cmdSample();
      break;
    case "read":
      await cmdRead();
      break;
    case "propose":
      await cmdPropose(args.conversationId, args.file);
      break;
    case "goal-pick":
      cmdGoalPick();
      break;
    case "goal-sample":
      cmdGoalSample();
      break;
    case "goal-validate":
      await cmdGoalValidate(args.file);
      break;
    case "goal-propose":
      await cmdGoalPropose(args.conversationId, args.file);
      break;
    default:
      usage();
      process.exit(sub ? 1 : 0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
