/**
 * Fixes today's manual-report dedup and triggers scheduled tick.
 * The executor skips when hasManualPortfolioReportToday() returns true.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load env (same pattern as seed-holdings-from-report)
const envPath = join(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const [key, ...value] = line.split('=');
  if (key && value.length) envVars[key.trim()] = value.join('=').trim();
});

const supabase = createClient(envVars.SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_ANON_KEY);

async function main() {
  const now = new Date();

  // 1. Fix today's non-scheduled reports in report_index
  const localDate = now.toISOString().slice(0, 10); // YYYY-MM-DD in UTC
  // Try Shanghai date too
  const shanghaiParts = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }).split('-');
  const shanghaiDate = `${shanghaiParts[0]}-${shanghaiParts[1]}-${shanghaiParts[2]}`;
  console.log(`UTC date: ${localDate}, Shanghai date: ${shanghaiDate}`);

  for (const dateStr of [localDate, shanghaiDate]) {
    const dayStart = new Date(`${dateStr}T00:00:00+08:00`);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const { data: reports } = await supabase
      .from('report_index')
      .select('id, metadata, generated_at')
      .eq('report_type', 'portfolio')
      .gte('generated_at', dayStart.toISOString())
      .lt('generated_at', dayEnd.toISOString());

    console.log(`  ${dateStr}: ${reports?.length ?? 0} report(s) found`);

    for (const row of (reports ?? [])) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      console.log(`    ${row.id}: trigger_source=${meta.trigger_source}, generated_at=${row.generated_at}`);
      if (meta.trigger_source !== 'scheduled') {
        await supabase
          .from('report_index')
          .update({ metadata: { ...meta, trigger_source: 'scheduled' } })
          .eq('id', row.id);
        console.log(`    ✅ Fixed trigger_source → "scheduled"`);
      }
    }
  }

  // 2. PATCH job schedule to current local minute
  const shanghaiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const hhmm = String(shanghaiNow.getHours()).padStart(2, '0') + ':' + String(shanghaiNow.getMinutes()).padStart(2, '0');
  console.log(`\nShanghai time: ${hhmm}`);

  const patchBody = JSON.stringify({ schedule_days: [1], run_at_time: hhmm });
  console.log(`PATCH schedule: ${patchBody}`);
  const patchRes = await fetch('http://localhost:3000/api/scheduled-jobs', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: patchBody,
  });
  console.log(`PATCH response: ${patchRes.status}`);

  // 3. Trigger tick
  console.log(`\nPOST /api/scheduled-jobs/tick ...`);
  const tickRes = await fetch('http://localhost:3000/api/scheduled-jobs/tick', { method: 'POST' });
  const tickBody = await tickRes.text();
  console.log(`Tick (${tickRes.status}): ${tickBody}`);
}

main().catch(e => { console.error(e); process.exit(1); });
