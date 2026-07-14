#!/usr/bin/env npx tsx
/** Plan 模块 CLI — 样例校验与 plan_read，不调用 LLM */
import {
  loadSamplePlanAllocation,
  loadSamplePlanDetail,
} from "@/lib/plan/samples";
import {
  validatePlanAllocation,
  validatePlanDetail,
} from "@/lib/plan/validate";

function parseArgs(argv: string[]): { cmd: string; rest: string[] } {
  const [, , cmd = "help", ...rest] = argv;
  return { cmd, rest };
}

function main(): void {
  const { cmd } = parseArgs(process.argv);

  switch (cmd) {
    case "allocation-validate": {
      const r = validatePlanAllocation(loadSamplePlanAllocation());
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.ok ? 0 : 1);
      break;
    }
    case "detail-validate": {
      const r = validatePlanDetail(loadSamplePlanDetail());
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.ok ? 0 : 1);
      break;
    }
    case "allocation-show": {
      console.log(JSON.stringify(loadSamplePlanAllocation(), null, 2));
      break;
    }
    case "detail-show": {
      console.log(JSON.stringify(loadSamplePlanDetail(), null, 2));
      break;
    }
    default:
      console.log(`用法:
  npm run plan:sample allocation-validate
  npm run plan:sample detail-validate
  npm run plan:sample allocation-show
  npm run plan:sample detail-show`);
  }
}

main();
