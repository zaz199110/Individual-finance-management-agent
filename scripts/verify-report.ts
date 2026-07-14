import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const envPath = join(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length) envVars[k.trim()] = v.join('=').trim();
});
const supabase = createClient(envVars.SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Check the new scheduled report
  const { data: report } = await supabase.from('report_index').select('*').eq('id', '5552daf2-2bf9-46f2-9ba2-c2b1ef26d28b').single();
  console.log('=== NEW SCHEDULED REPORT ===');
  console.log('id:', report.id);
  console.log('report_type:', report.report_type);
  console.log('title:', report.title);
  console.log('metadata:', JSON.stringify(report.metadata, null, 2));
  console.log('generated_at:', report.generated_at);

  // Check current holdings
  const { data: hv } = await supabase.from('holdings_versions').select('id, is_current, positions').eq('is_current', true).single();
  console.log('\n=== CURRENT HOLDINGS ===');
  console.log('version_id:', hv.id);
  console.log('positions count:', hv.positions.length);
  hv.positions.forEach((p: any, i: number) => console.log(`  ${i+1}. ${p.fund_code} ${p.fund_name} ${p.paid_amount}元 ${p.shares}份`));

  // Check scheduled_job_runs
  const { data: runs } = await supabase.from('scheduled_job_runs').select('*').order('triggered_at', { ascending: false }).limit(3);
  console.log('\n=== RECENT SCHEDULED RUNS ===');
  runs.forEach(r => console.log(`  ${r.id.slice(0,8)}... status=${r.status} as_of=${r.as_of_trade_date} report_id=${r.report_index_id}`));
}
main().catch(e => { console.error(e); process.exit(1); });
