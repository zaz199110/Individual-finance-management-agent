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

// Mock持仓数据
const mockPositions = [
  {
    fund_code: '000001',
    fund_name: '华夏成长混合',
    invested_at: '2024-01-15',
    paid_amount: 50000,
    shares: 25000.00,
    source: 'mock',
    status: 'active'
  },
  {
    fund_code: '000002',
    fund_name: '嘉实沪深300ETF联接',
    invested_at: '2024-02-20',
    paid_amount: 30000,
    shares: 15000.00,
    source: 'mock',
    status: 'active'
  },
  {
    fund_code: '000003',
    fund_name: '易方达蓝筹精选混合',
    invested_at: '2024-03-10',
    paid_amount: 40000,
    shares: 20000.00,
    source: 'mock',
    status: 'active'
  },
  {
    fund_code: '000004',
    fund_name: '招商中证白酒指数',
    invested_at: '2024-04-05',
    paid_amount: 25000,
    shares: 12500.00,
    source: 'mock',
    status: 'active'
  },
  {
    fund_code: '000005',
    fund_name: '中欧医疗健康混合',
    invested_at: '2024-05-12',
    paid_amount: 35000,
    shares: 17500.00,
    source: 'mock',
    status: 'active'
  }
];

async function insertMockHoldings() {
  console.log('插入mock持仓数据...');
  
  // 首先检查是否已有current持仓
  const { data: existing } = await supabase
    .from('holdings_versions')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();
  
  if (existing) {
    console.log('已存在current持仓，先取消current状态...');
    await supabase
      .from('holdings_versions')
      .update({ is_current: false })
      .eq('id', existing.id);
  }
  
  // 插入新的持仓版本
  const { data, error } = await supabase
    .from('holdings_versions')
    .insert({
      is_current: true,
      positions: mockPositions,
      change_summary: {
        kind: 'initial',
        narrative: 'Mock持仓数据用于面试演示'
      },
      confirmed_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (error) {
    console.error('插入持仓失败:', error);
    process.exit(1);
  }
  
  console.log('✅ Mock持仓数据插入成功!');
  console.log('持仓版本ID:', data.id);
  console.log('持仓数量:', mockPositions.length);
  console.log('总成本:', mockPositions.reduce((sum, p) => sum + p.paid_amount, 0).toLocaleString('zh-CN'), '元');
  
  return data.id;
}

async function triggerPortfolioAnalysis(holdingsVersionId: string) {
  console.log('\n触发持仓分析...');
  
  // 调用API触发定时任务tick
  const response = await fetch('http://localhost:3001/api/scheduled-jobs/tick', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('触发分析失败:', errorText);
    return;
  }
  
  const result = await response.json();
  console.log('✅ 持仓分析已触发!');
  console.log('结果:', JSON.stringify(result, null, 2));
}

async function main() {
  try {
    const holdingsVersionId = await insertMockHoldings();
    await triggerPortfolioAnalysis(holdingsVersionId);
    
    console.log('\n📋 执行步骤:');
    console.log('1. Mock持仓数据已插入数据库');
    console.log('2. 持仓分析已触发');
    console.log('3. 检查任务日志: GET /api/scheduled-jobs/runs');
    console.log('4. 查看持仓报告: GET /api/reports?tab=portfolio');
    
  } catch (error) {
    console.error('执行失败:', error);
    process.exit(1);
  }
}

main();