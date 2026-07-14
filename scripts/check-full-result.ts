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
  // Get conversation from the run
  const { data: run } = await supabase.from('scheduled_job_runs')
    .select('conversation_id, report_index_id, report_name, as_of_trade_date')
    .eq('id', 'f7d6474d-b2fe-4a81-b417-e35a38971754').single();
  console.log('Run:', JSON.stringify(run, null, 2));

  // Get full report_row
  const { data: report } = await supabase.from('report_index')
    .select('*')
    .eq('id', '5552daf2-2bf9-46f2-9ba2-c2b1ef26d28b').single();
  console.log('\nReport row keys:', Object.keys(report));
  console.log('Report:', JSON.stringify(report, null, 2));

  // Messages
  if (run?.conversation_id) {
    const { data: msgs } = await supabase.from('messages')
      .select('role, content, metadata')
      .eq('conversation_id', run.conversation_id)
      .order('created_at', { ascending: true });
    console.log('\nMessages:');
    for (const m of (msgs ?? [])) {
      const content = (m.content ?? '').replace(/\n/g, '\\n');
      console.log(`  [${m.role}] ${content.slice(0, 300)}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
