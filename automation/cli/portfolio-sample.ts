#!/usr/bin/env npx tsx
/** Portfolio 持仓样例 CLI */
import { loadSampleHoldingsInitial } from "@/lib/portfolio/samples";
import { validateHoldings } from "@/lib/portfolio/validate";

function parseArgs(argv: string[]): { cmd: string } {
  const [, , cmd = "help"] = argv;
  return { cmd };
}

function main(): void {
  const { cmd } = parseArgs(process.argv);

  switch (cmd) {
    case "validate": {
      const r = validateHoldings(loadSampleHoldingsInitial());
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.ok ? 0 : 1);
      break;
    }
    case "show": {
      console.log(JSON.stringify(loadSampleHoldingsInitial(), null, 2));
      break;
    }
    default:
      console.log(`用法:
  npm run portfolio:sample validate
  npm run portfolio:sample show`);
  }
}

main();
