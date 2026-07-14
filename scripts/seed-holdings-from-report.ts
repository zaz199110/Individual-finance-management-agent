import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

// 读取环境变量
const envPath = join(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const [key, ...value] = line.split('=');
  if (key && value.length) {
    envVars[key.trim()] = value.join('=').trim();
  }
});

const supabaseUrl = envVars.SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 从报告 ee01e528-1782568746309.md 提取的持仓数据
const positionsFromReport = [
  {
    fund_code: '003547',
    fund_name: '鹏华丰享债券',
    invested_at: '2025-08-12',
    paid_amount: 30000,
    shares: 28412.35,
    source: 'report-seed',
    status: 'holding'
  },
  {
    fund_code: '000509',
    fund_name: '广发钱袋子货币A',
    invested_at: '2025-08-12',
    paid_amount: 20000,
    shares: 20000,
    source: 'report-seed',
    status: 'holding'
  },
  {
    fund_code: '161725',
    fund_name: '招商中证白酒指数(LOF)A',
    invested_at: '2026-01-08',
    paid_amount: 38500,
    shares: 32105.88,
    source: 'report-seed',
    status: 'holding'
  },
  {
    fund_code: '110017',
    fund_name: '易方达增强回报债券A',
    invested_at: '2026-02-20',
    paid_amount: 50000,
    shares: 38264.22,
    source: 'report-seed',
    status: 'holding'
  }
];

async function seedHoldings() {
  console.log('📋 从报告 ee01e528 提取到 4 只基金持仓:');
  console.log('='.repeat(60));
  const totalCost = positionsFromReport.reduce((sum, p) => sum + p.paid_amount, 0);
  positionsFromReport.forEach(p => {
    console.log(`  ${p.fund_code} ${p.fund_name} - 买入 ${p.paid_amount.toLocaleString('zh-CN')} 元, ${p.shares} 份`);
  });
  console.log(`  总成本: ${totalCost.toLocaleString('zh-CN')} 元`);
  console.log('='.repeat(60));
  
  // 先将所有 is_current=true 的记录设为 false，避免唯一约束冲突
  const { data: existingIds } = await supabase
    .from('holdings_versions')
    .select('id')
    .eq('is_current', true);
  
  const existing = existingIds ?? [];
  if (existing.length > 0) {
    console.log(`\n⚠️  已存在 ${existing.length} 条 current 持仓 (id: ${existing.map(r => r.id).join(', ')})，全部取消...`);
    await supabase
      .from('holdings_versions')
      .update({ is_current: false })
      .eq('is_current', true);
  }
  
  // 插入新的持仓版本
  const { data, error } = await supabase
    .from('holdings_versions')
    .insert({
      is_current: true,
      positions: positionsFromReport,
      change_summary: {
        kind: 'initial',
        narrative: '从报告 ee01e528-1782568746309 导入的持仓数据'
      },
      confirmed_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (error) {
    console.error('❌ 插入持仓失败:', error);
    process.exit(1);
  }
  
  console.log(`\n✅ 持仓数据已写入 holdings_versions`);
  console.log(`   版本 ID: ${data.id}`);
  console.log(`   持仓数量: ${positionsFromReport.length}`);
  
  return data.id;
}

async function main() {
  try {
    const holdingsVersionId = await seedHoldings();
    console.log(`\n💡 下一步: 启动 dev server 后执行`);
    console.log(`   curl -X POST http://localhost:3000/api/scheduled-jobs/tick`);
    console.log(`\n   或运行: npm run dev (等待启动后触发)`);
  } catch (error) {
    console.error('执行失败:', error);
    process.exit(1);
  }
}

main();
