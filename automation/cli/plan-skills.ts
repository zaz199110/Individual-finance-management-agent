#!/usr/bin/env npx tsx
/** Plan 模块 Skill 索引 CLI */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const planDir = path.join(root, "skills", "plan");

function main(): void {
  if (!fs.existsSync(planDir)) {
    console.error("skills/plan 不存在");
    process.exit(1);
  }
  const files = fs
    .readdirSync(planDir)
    .filter((f) => /\.(md|yaml|yml)$/.test(f))
    .sort();

  console.log("=== Plan Skills ===\n");
  for (const file of files) {
    const full = path.join(planDir, file);
    const stat = fs.statSync(full);
    console.log(`- ${file} (${stat.size} bytes)`);
  }
  console.log(`\n共 ${files.length} 个文件。`);
}

main();
