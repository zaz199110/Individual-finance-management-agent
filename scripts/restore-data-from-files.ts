/**
 * 从本地文件恢复数据库数据
 * 
 * 运行方式: npx tsx scripts/restore-data-from-files.ts
 * 
 * 恢复内容:
 * 1. fund_watchlist - 自选基金列表
 * 2. holdings_versions - 持仓数据
 * 3. profile_versions - 用户画像
 * 4. investment_goal_constraints - 投资目标
 * 5. report_index - 报告索引
 * 6. user_memory - 用户记忆
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// 读取环境变量
const envPath = join(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  if (line.startsWith('#') || !line.trim()) return;
  const [key, ...value] = line.split('=');
  if (key && value.length) {
    envVars[key.trim()] = value.join('=').trim();
  }
});

const supabaseUrl = envVars.SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('❌ 缺少 SUPABASE_SERVICE_ROLE_KEY 或 SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================
// 1. 恢复自选基金
// ============================================================
async function restoreWatchlist() {
  console.log('\n📋 恢复自选基金...');
  
  const watchlistPath = join(process.cwd(), 'data', 'fund_watchlist.json');
  if (!existsSync(watchlistPath)) {
    console.log('  ⚠️  data/fund_watchlist.json 不存在，跳过');
    return;
  }
  
  const watchlist = JSON.parse(readFileSync(watchlistPath, 'utf8'));
  let restored = 0;
  
  for (const item of watchlist) {
    // 检查是否已存在
    const { data: existing } = await supabase
      .from('fund_watchlist')
      .select('id')
      .eq('fund_code', item.fund_code)
      .is('deleted_at', null)
      .single();
    
    if (existing) {
      console.log(`  ⏭️  ${item.fund_code} ${item.fund_name} 已存在`);
      continue;
    }
    
    const { error } = await supabase
      .from('fund_watchlist')
      .insert({
        fund_code: item.fund_code,
        fund_name: item.fund_name,
        added_at: item.added_at,
        last_analysis_at: item.last_analysis_at,
      });
    
    if (error) {
      console.error(`  ❌ ${item.fund_code} 恢复失败:`, error.message);
    } else {
      console.log(`  ✅ ${item.fund_code} ${item.fund_name}`);
      restored++;
    }
  }
  
  console.log(`  📊 自选基金: 恢复 ${restored}/${watchlist.length}`);
}

// ============================================================
// 2. 恢复持仓数据
// ============================================================
async function restoreHoldings() {
  console.log('\n💰 恢复持仓数据...');
  
  const positions = [
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
  
  // 检查是否已有持仓
  const { data: existing } = await supabase
    .from('holdings_versions')
    .select('id')
    .eq('is_current', true)
    .limit(1);
  
  if (existing && existing.length > 0) {
    console.log('  ⏭️  已有持仓数据，跳过');
    return;
  }
  
  const { data, error } = await supabase
    .from('holdings_versions')
    .insert({
      is_current: true,
      positions: positions,
      change_summary: {
        kind: 'initial',
        narrative: '从本地文件恢复的持仓数据'
      },
      confirmed_at: new Date().toISOString()
    })
    .select()
    .single();
  
  if (error) {
    console.error('  ❌ 持仓恢复失败:', error.message);
  } else {
    console.log(`  ✅ 持仓数据已恢复 (版本 ID: ${data.id})`);
    console.log(`     - 鹏华丰享债券: 30,000元`);
    console.log(`     - 广发钱袋子货币A: 20,000元`);
    console.log(`     - 招商中证白酒指数(LOF)A: 38,500元`);
    console.log(`     - 易方达增强回报债券A: 50,000元`);
  }
}

// ============================================================
// 3. 恢复用户画像
// ============================================================
async function restoreProfile() {
  console.log('\n👤 恢复用户画像...');
  
  // 检查是否已有画像
  const { data: existing } = await supabase
    .from('profile_versions')
    .select('id')
    .eq('is_current', true)
    .limit(1);
  
  if (existing && existing.length > 0) {
    console.log('  ⏭️  已有用户画像，跳过');
    return;
  }
  
  const basicInfo = {
    name: '张先生',
    age: 35,
    gender: '男',
    marital_status: '已婚',
    children: '一孩',
    occupation: '国企职员，收入较稳定',
    investment_experience: '3年',
    annual_income: 280000,
    monthly_income: 18000,
    monthly_expense: 8000,
    monthly_investable: 3500,
    financial_assets: 500000,
    total_debt: 1200000,
    monthly_debt_payment: 6500,
  };
  
  const { data, error } = await supabase
    .from('profile_versions')
    .insert({
      is_current: true,
      basic_info: basicInfo,
      confirmed_at: new Date().toISOString(),
    })
    .select()
    .single();
  
  if (error) {
    console.error('  ❌ 画像恢复失败:', error.message);
  } else {
    console.log(`  ✅ 用户画像已恢复 (版本 ID: ${data.id})`);
    console.log(`     - 张先生, 35岁, 已婚, 国企职员`);
  }
  
  return data?.id;
}

// ============================================================
// 4. 恢复投资目标
// ============================================================
async function restoreInvestmentGoals(profileVersionId: string | undefined) {
  console.log('\n🎯 恢复投资目标...');
  
  if (!profileVersionId) {
    console.log('  ⚠️  无 profile_version_id，跳过');
    return;
  }
  
  // 检查是否已有目标
  const { data: existing } = await supabase
    .from('investment_goal_constraints')
    .select('id')
    .eq('is_active', true)
    .limit(1);
  
  if (existing && existing.length > 0) {
    console.log('  ⏭️  已有投资目标，跳过');
    return;
  }
  
  const goals = [
    {
      goal_type: 'retirement',
      display_name: '养老储备',
      goal_detail: { risk_preference: '稳健型', max_drawdown: 15, target_annual_return: 6 },
      investment_constraints: { risk_preference: '稳健型', max_drawdown: 15, target_annual_return: 6 },
      principal_amount: 100000,
      monthly_amount: 5000,
    },
    {
      goal_type: 'education',
      display_name: '子女教育金',
      goal_detail: { risk_preference: '平衡型', max_drawdown: 10, target_annual_return: 7 },
      investment_constraints: { risk_preference: '平衡型', max_drawdown: 10, target_annual_return: 7 },
      principal_amount: 50000,
      monthly_amount: 3000,
    },
    {
      goal_type: 'housing',
      display_name: '买房首付',
      goal_detail: { risk_preference: '保守型', max_drawdown: 5, target_annual_return: 5 },
      investment_constraints: { risk_preference: '保守型', max_drawdown: 5, target_annual_return: 5 },
      principal_amount: 200000,
      monthly_amount: 8000,
    },
    {
      goal_type: 'marriage_child',
      display_name: '婚育准备',
      goal_detail: { risk_preference: '平衡型', max_drawdown: 10, target_annual_return: 6, target_amount: 600000 },
      investment_constraints: { risk_preference: '平衡型', max_drawdown: 10, target_annual_return: 6, target_amount: 600000 },
      principal_amount: 80000,
      monthly_amount: 3000,
    },
    {
      goal_type: 'wealth_growth',
      display_name: '闲钱增值',
      goal_detail: { risk_preference: '进取型', max_drawdown: 20, target_annual_return: 10 },
      investment_constraints: { risk_preference: '进取型', max_drawdown: 20, target_annual_return: 10 },
      principal_amount: 300000,
      monthly_amount: 10000,
    },
  ];
  
  let restored = 0;
  for (const goal of goals) {
    const { error } = await supabase
      .from('investment_goal_constraints')
      .insert({
        profile_version_id: profileVersionId,
        ...goal,
        is_active: true,
        confirmed_at: new Date().toISOString(),
      });
    
    if (error) {
      console.error(`  ❌ ${goal.display_name} 恢复失败:`, error.message);
    } else {
      console.log(`  ✅ ${goal.display_name}`);
      restored++;
    }
  }
  
  console.log(`  📊 投资目标: 恢复 ${restored}/${goals.length}`);
}

// ============================================================
// 5. 恢复报告索引
// ============================================================
async function restoreReportIndex() {
  console.log('\n📄 恢复报告索引...');
  
  const reportsDir = join(process.cwd(), 'data', 'reports');
  const reports: Array<{ type: string; slug: string; name: string; path: string }> = [];
  
  // 扫描已发布的报告
  const types = ['fund', 'portfolio', 'profile', 'plan'];
  for (const type of types) {
    const publishedDir = join(reportsDir, type, 'published');
    if (!existsSync(publishedDir)) continue;
    
    const { readdirSync } = await import('fs');
    const files = readdirSync(publishedDir).filter(f => f.endsWith('.md'));
    
    for (const file of files) {
      const slug = file.replace('.md', '');
      reports.push({
        type,
        slug,
        name: `${type} report ${slug}`,
        path: `data/reports/${type}/published/${file}`,
      });
    }
  }
  
  if (reports.length === 0) {
    console.log('  ⚠️  未找到本地报告文件');
    return;
  }
  
  let restored = 0;
  for (const report of reports) {
    // 检查是否已存在
    const { data: existing } = await supabase
      .from('report_index')
      .select('id')
      .eq('report_slug', report.slug)
      .limit(1);
    
    if (existing && existing.length > 0) {
      continue;
    }
    
    const { error } = await supabase
      .from('report_index')
      .insert({
        report_type: report.type,
        report_slug: report.slug,
        report_name: report.name,
        file_path: report.path,
        generated_at: new Date().toISOString(),
      });
    
    if (error) {
      console.error(`  ❌ ${report.slug} 恢复失败:`, error.message);
    } else {
      restored++;
    }
  }
  
  console.log(`  📊 报告索引: 恢复 ${restored}/${reports.length}`);
}

// ============================================================
// 6. 恢复用户记忆
// ============================================================
async function restoreUserMemory() {
  console.log('\n🧠 恢复用户记忆...');
  
  const memoryPath = join(process.cwd(), 'data', 'user-memory.md');
  if (!existsSync(memoryPath)) {
    console.log('  ⚠️  data/user-memory.md 不存在，跳过');
    return;
  }
  
  const content = readFileSync(memoryPath, 'utf8').trim();
  if (!content) {
    console.log('  ⚠️  用户记忆为空，跳过');
    return;
  }
  
  // 检查是否已有记忆
  const { data: existing } = await supabase
    .from('user_memory')
    .select('id')
    .limit(1);
  
  if (existing && existing.length > 0) {
    console.log('  ⏭️  已有用户记忆，跳过');
    return;
  }
  
  const { error } = await supabase
    .from('user_memory')
    .insert({
      content_md: content,
    });
  
  if (error) {
    console.error('  ❌ 用户记忆恢复失败:', error.message);
  } else {
    console.log(`  ✅ 用户记忆已恢复`);
  }
}

// ============================================================
// 主函数
// ============================================================
async function main() {
  console.log('🔧 数据恢复脚本');
  console.log('='.repeat(50));
  console.log(`📡 Supabase: ${supabaseUrl}`);
  
  try {
    await restoreWatchlist();
    await restoreHoldings();
    const profileId = await restoreProfile();
    await restoreInvestmentGoals(profileId);
    await restoreReportIndex();
    await restoreUserMemory();
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ 数据恢复完成！');
    console.log('\n💡 提示:');
    console.log('   - 刷新页面查看恢复的数据');
    console.log('   - 部分数据可能需要在应用中重新确认');
  } catch (error) {
    console.error('\n❌ 恢复过程中出错:', error);
    process.exit(1);
  }
}

main();
