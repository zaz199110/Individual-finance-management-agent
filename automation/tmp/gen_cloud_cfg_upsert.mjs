import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(__dirname, "cloud_cfg.sql"), "utf8");
const ms = [];
for (const line of sql.split("\n")) {
  if (
    !line ||
    line.startsWith("--") ||
    line.startsWith("COPY") ||
    line.startsWith("\\.") ||
    line.startsWith("SET") ||
    line.startsWith("SELECT") ||
    line.startsWith("\\restrict") ||
    line.startsWith("\\unrestrict")
  ) {
    continue;
  }
  const parts = line.split("\t");
  if (
    parts.length === 10 &&
    ["reasoning", "deep", "vision", "web", "embedding"].includes(parts[1])
  ) {
    ms.push({
      slot: parts[1],
      model_name: parts[2],
      api_base_url: parts[3],
      api_key: parts[4],
      use_same: parts[5] === "t",
      check_status: parts[6],
      last_checked: parts[7] === "\\N" ? null : parts[7],
      last_error: parts[8] === "\\N" ? null : parts[8],
      updated_at: parts[9],
    });
  }
}

let sj = null;
for (const line of sql.split("\n")) {
  const parts = line.split("\t");
  if (parts.length === 9 && parts[1] === "portfolio") {
    sj = {
      enabled: parts[2] === "t",
      schedule_kind: parts[3] === "\\N" ? null : parts[3],
      schedule_days: parts[4],
      run_at_time: parts[5],
      consecutive_failures: Number(parts[6]),
      updated_at: parts[7],
      last_run_at: parts[8] === "\\N" ? null : parts[8],
    };
  }
}

const esc = (v) => String(v ?? "").replace(/'/g, "''");
const stmts = [];
for (const r of ms) {
  stmts.push(
    `UPDATE model_settings SET model_name='${esc(r.model_name)}', api_base_url='${esc(r.api_base_url)}', api_key_encrypted='${esc(r.api_key)}', use_same_as_reasoning=${r.use_same}, check_status='${esc(r.check_status)}', last_checked_at=${r.last_checked ? `'${esc(r.last_checked)}'` : "NULL"}, last_error_message=${r.last_error ? `'${esc(r.last_error)}'` : "NULL"}, updated_at='${esc(r.updated_at)}' WHERE slot='${esc(r.slot)}';`,
  );
}
if (sj) {
  stmts.push(
    `UPDATE scheduled_jobs SET enabled=${sj.enabled}, schedule_kind=${sj.schedule_kind ? `'${esc(sj.schedule_kind)}'` : "NULL"}, schedule_days='${sj.schedule_days}', run_at_time='${esc(sj.run_at_time)}', consecutive_failures=${sj.consecutive_failures}, updated_at='${esc(sj.updated_at)}', last_run_at=${sj.last_run_at ? `'${esc(sj.last_run_at)}'` : "NULL"} WHERE job_type='portfolio';`,
  );
}

const out = path.join(__dirname, "cloud_cfg_upsert.sql");
fs.writeFileSync(out, stmts.join("\n"));
console.log(
  "model_slots",
  ms.map((r) => `${r.slot}:${r.check_status}`).join(", "),
);
console.log(
  "scheduled",
  sj
    ? `enabled=${sj.enabled}, kind=${sj.schedule_kind}, days=${sj.schedule_days}`
    : "none",
);
console.log("wrote", stmts.length, "statements ->", out);
