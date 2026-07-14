#!/usr/bin/env node
/**
 * Fail fast if TS/TSX sources have broken string literals (common after ANSI mojibake).
 * Used by self_test.ps1 before unit tests.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const EXT = new Set([".ts", ".tsx"]);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXT.has(path.extname(name))) out.push(p);
  }
  return out;
}

function stripTemplatesAndComments(line) {
  let s = line;
  if (s.trimStart().startsWith("//")) return "";
  s = s.replace(/`(?:\\.|[^`\\])*`/g, "");
  s = s.replace(/\/\*.*?\*\//g, "");
  return s;
}

function oddQuotes(line) {
  const s = stripTemplatesAndComments(line);
  let n = 0;
  let esc = false;
  for (const c of s) {
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (c === '"') n++;
  }
  return n % 2 === 1;
}

let failed = false;
for (const file of walk(path.join(ROOT, "src"))) {
  const rel = path.relative(ROOT, file);
  const text = fs.readFileSync(file, "utf8");
  if (text.includes("\uFFFD")) {
    console.error(`[FAIL] ${rel}: contains Unicode replacement character (U+FFFD)`);
    failed = true;
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const stripped = stripTemplatesAndComments(line);
    if (!stripped.includes('"')) continue;
    if (oddQuotes(line)) {
      console.error(`[FAIL] ${rel}:${i + 1}: unclosed string literal`);
      console.error(`       ${line.slice(0, 120)}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error("\nSource encoding/syntax check failed. See automation/scripts/_encoding.ps1");
  process.exit(1);
}
console.log("[OK] Source encoding check — src/**/*.ts(x)");
