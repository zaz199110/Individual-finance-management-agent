/**
 * FAQ expansion script: transforms 100 entries → 300 entries.
 *
 * Strategy:
 *   Group A (colloquial): casual, short, with particles (啊/吧/呢/吗/哦)
 *   Group B (paraphrase): same meaning, different words & sentence structure
 *
 * Alternates: entry 0→GroupA, entry 1→GroupB, entry 2→GroupA, ...
 *
 * Usage: node seed/scripts/expand_faq.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const srcPath = resolve(root, 'fund_semantic_entries.json');

// ─── Synonym table for financial terms ───
const SYNONYMS = {
  '管理费': ['运作费', '运营费', '年管理费'],
  '托管费': ['保管费', '存管费', '资金托管费'],
  '销售服务费': ['渠道服务费', '销售佣金', '平台服务费'],
  '费率': ['费用标准', '收费标准', '收费比例'],
  '费用': ['收费', '成本', '开销'],
  '赎回': ['卖出', '取回', '变现', '清仓'],
  '赎回费': ['卖出费', '取出成本', '变现费'],
  '申购': ['买入', '购买', '投资', '进场'],
  '申购费': ['买入费', '购买成本', '进场费'],
  '风险': ['不确定性', '亏损可能', '安全隐患'],
  '收益': ['回报', '盈利', '赚钱', '收入'],
  '分红': ['派息', '分配收益', '红利', '现金分红'],
  '经理': ['管理人', '操盘手', '投资负责人'],
  '基金经理': ['基金管理人', '投资经理', '操盘人'],
  '持仓': ['持有资产', '投资组合', '仓位', '标的'],
  '净值': ['价格', '单位净值', '份额价值'],
  '业绩': ['表现', '成绩', '业绩回报'],
  '流动性': ['变现能力', '资金灵活性', '取用方便程度'],
  '配置': ['布局', '投资安排', '组合构建'],
  '策略': ['方法', '方案', '投资思路'],
  '披露': ['公布', '公告', '公开信息'],
  '产品': ['基金产品', '理财产品', '投资标的'],
  '持有': ['持仓', '拿着', '投资'],
  '选择': ['挑选', '筛选', '抉择'],
};

// ─── Question pattern transformations ───
const COLLOQUIAL_FILLERS = ['啊', '呀', '呢', '哦', '吧', '哈'];
const COLLOQUIAL_QUESTION_ENDS = ['吗', '不', '没', '咋样', '怎么样', '啥'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Replace longest-matching synonym phrases in text
function applySynonym(text, synMap) {
  // Sort keys by length descending to avoid partial matches
  const keys = Object.keys(synMap).sort((a, b) => b.length - a.length);
  let result = text;
  for (const key of keys) {
    if (result.includes(key)) {
      const replacement = pick(synMap[key]);
      if (replacement !== key) {
        result = result.replace(key, replacement);
      }
    }
  }
  return result;
}

// ─── Group A: Colloquial ───
function makeColloquial(entry) {
  let title = entry.title;
  let body = entry.body;

  // --- Title transformations ---
  // 1. '什么' → '啥' (with probability)
  if (Math.random() < 0.5) title = title.replace(/什么/g, '啥');

  // 2. Remove formal markers
  title = title.replace(/请问/g, '');
  title = title.replace(/我想了解/g, '');
  title = title.replace(/想了解一下/g, '');

  // 3. '怎么...？' → '咋...？/怎么搞？'
  if (Math.random() < 0.4) title = title.replace(/怎么/g, '咋');

  // 4. '要不要' → '要吗' / '需要吗'
  title = title.replace(/要不要/g, () => pick(['要吗', '需要不', '用不用']));
  title = title.replace(/能不能/g, () => pick(['能吗', '可以吗', '行吗']));
  title = title.replace(/会不会/g, () => pick(['会吗', '会不', '可能吗']));
  title = title.replace(/有没有/g, () => pick(['有吗', '有不']));

  // 5. Add colloquial filler near end if not present
  if (!/[啊呀呢哦吧哈]/.test(title) && title.endsWith('？')) {
    title = title.slice(0, -1) + pick(COLLOQUIAL_FILLERS) + '？';
  }

  // 6. Colloquial question end: '吗？'→'不？/没？'
  if (Math.random() < 0.3 && title.endsWith('吗？')) {
    title = title.replace(/吗？$/, pick(['不？', '没？', '咩？']));
  }

  // --- Body transformations ---
  // 1. Add casual opening
  if (Math.random() < 0.3 && body.length > 10) {
    body = '其实啊，' + body.charAt(0).toLowerCase() + body.slice(1);
  }

  // 2. Shorten: remove excessive formal clauses
  body = body.replace(/须指出，/g, '');
  body = body.replace(/注意：/g, '');

  // 3. Make ending more casual
  if (body.endsWith('。') && body.length > 8) {
    body = body.slice(0, -1) + pick(['哈。', '哦。', '呢。', '哟。', '。']);
  }

  // --- Keywords ---
  const keywords = [...entry.metadata.keywords];
  // Add 1-2 colloquial keywords
  if (keywords.length > 0) {
    const kw = pick(keywords);
    if (kw.length > 1) keywords.push(kw + '咋算');
  }
  if (Math.random() < 0.4 && keywords.length > 1) {
    keywords.push(pick(['怎么搞', '划算不', '靠不靠谱', '麻不麻烦']));
  }

  return {
    entry_type: entry.entry_type,
    title,
    body,
    metadata: {
      keywords,
      suggested_doc_types: entry.metadata.suggested_doc_types,
      intent: entry.metadata.intent,
    },
  };
}

// ─── Group B: Paraphrase ───
function makeParaphrase(entry) {
  let title = entry.title;
  let body = entry.body;

  // --- Title transformations ---
  // 1. Apply synonym substitution
  title = applySynonym(title, SYNONYMS);

  // 2. Restructure question patterns
  // 'X是多少' → 'X一般多少'
  title = title.replace(/(\S{2,})是多少/g, '$1大概多少');
  // 'X有什么Y' → 'X的Y有哪些'
  title = title.replace(/(\S{2,})有什么(\S+)/g, '$1的$2有哪些');

  // 3. Change asking style
  if (title.includes('怎么') && !title.includes('如何')) {
    title = title.replace(/怎么/g, '如何');
  } else if (title.includes('如何') && !title.includes('怎么')) {
    title = title.replace(/如何/g, '怎么');
  }

  // 4. Alternate question particles
  if (title.endsWith('吗？')) {
    title = title.replace(/吗？$/, '是否？');
  }

  // --- Body transformations ---
  // 1. Apply synonym substitution
  body = applySynonym(body, SYNONYMS);

  // 2. Restructure: swap clauses
  const clauses = body.split(/[，,]/).filter(Boolean);
  if (clauses.length > 1 && Math.random() < 0.4) {
    // Swap last two clauses
    const tmp = clauses[clauses.length - 1];
    clauses[clauses.length - 1] = clauses[clauses.length - 2];
    clauses[clauses.length - 2] = tmp;
    body = clauses.join('，');
  }

  // 3. Add transitional phrases
  if (Math.random() < 0.3 && body.length > 15) {
    body = body.replace(/，/g, () => pick(['，此外，', '，同时，', '，另外，', '，']));
  }

  // --- Keywords ---
  const keywords = [];
  for (const kw of entry.metadata.keywords) {
    // Try to find a synonym for this keyword
    const synList = SYNONYMS[kw];
    if (synList && Math.random() < 0.6) {
      keywords.push(pick(synList));
    } else {
      keywords.push(kw);
    }
  }

  return {
    entry_type: entry.entry_type,
    title,
    body,
    metadata: {
      keywords,
      suggested_doc_types: entry.metadata.suggested_doc_types,
      intent: entry.metadata.intent,
    },
  };
}

// ─── Main ───
const data = JSON.parse(readFileSync(srcPath, 'utf8'));
const original = data.entries;
const originalCount = original.length;

const newEntries = [];

for (let i = 0; i < originalCount; i++) {
  const entry = original[i];
  // Generate BOTH variants for each entry (200 total)
  newEntries.push(makeColloquial(entry));
  newEntries.push(makeParaphrase(entry));
}

data.entries = [...original, ...newEntries];
data.description = data.description.replace(
  /100条基金/,
  `${originalCount + newEntries.length}条基金`,
);

writeFileSync(srcPath, JSON.stringify(data, null, 2), 'utf8');
console.log(`Done: ${originalCount} → ${data.entries.length} entries`);
console.log(`Group A (colloquial): ${newEntries.filter((_, i) => i % 2 === 0).length}`);
console.log(`Group B (paraphrase): ${newEntries.filter((_, i) => i % 2 === 1).length}`);

// Validate
const reRead = JSON.parse(readFileSync(srcPath, 'utf8'));
if (reRead.entries.length !== originalCount + newEntries.length) {
  console.error(`ERROR: expected ${originalCount + newEntries.length}, got ${reRead.entries.length}`);
  process.exit(1);
}
console.log('Validation OK');
