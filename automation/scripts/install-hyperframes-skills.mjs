#!/usr/bin/env node
/**
 * Install HyperFrames agent skills for Claude / Cursor / Harness.
 * Re-run after cloning or when skills are missing.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const coreSkills = [
  "hyperframes",
  "hyperframes-core",
  "hyperframes-animation",
  "hyperframes-cli",
  "hyperframes-creative",
  "hyperframes-media",
  "hyperframes-registry",
  "general-video",
];

function runSkillsAdd() {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(
    npx,
    [
      "--yes",
      "skills",
      "add",
      "heygen-com/hyperframes",
      "--agent",
      "cursor",
      "--agent",
      "claude",
      "--all",
      "-y",
    ],
    {
      cwd: root,
      stdio: "inherit",
      env: {
        ...process.env,
        CI: "true",
        GIT_CLONE_PROTECTION_ACTIVE: "0",
      },
    },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function linkCursorSkills() {
  const cursorDir = path.join(root, ".cursor", "skills");
  const agentsDir = path.join(root, ".agents", "skills");
  fs.mkdirSync(cursorDir, { recursive: true });

  for (const skill of coreSkills) {
    const target = path.join(agentsDir, skill);
    const link = path.join(cursorDir, skill);
    if (!fs.existsSync(target)) {
      console.warn(`[skip] missing .agents/skills/${skill}`);
      continue;
    }
    if (fs.existsSync(link)) {
      fs.rmSync(link, { recursive: true, force: true });
    }
    if (process.platform === "win32") {
      spawnSync("cmd.exe", ["/c", "mklink", "/J", link, target], {
        stdio: "inherit",
      });
    } else {
      fs.symlinkSync(target, link, "dir");
    }
    console.log(`[ok] .cursor/skills/${skill}`);
  }
}

runSkillsAdd();
linkCursorSkills();
console.log("[ok] HyperFrames skills ready for Claude, Cursor, and Harness (skills/)");
