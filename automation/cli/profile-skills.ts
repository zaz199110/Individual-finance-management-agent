#!/usr/bin/env npx tsx
/** Profile 模块 Skill 索引 CLI — 供 Harness / 研发核对，不调用 LLM */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const profileDir = path.join(root, "skills", "profile");

function main(): void {
  if (!fs.existsSync(profileDir)) {
    console.error("skills/profile 不存在");
    process.exit(1);
  }
  const files = fs
    .readdirSync(profileDir)
    .filter((f) => /\.(md|yaml|yml)$/.test(f))
    .sort();

  console.log("=== Profile Skills ===\n");
  for (const file of files) {
    const full = path.join(profileDir, file);
    const stat = fs.statSync(full);
    console.log(`- ${file} (${stat.size} bytes)`);
  }
  console.log(`\n共 ${files.length} 个文件。`);
}

main();
