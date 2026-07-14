/**
 * L2 语义检索效果评估脚本
 * 对比 embedding vs 关键词在 100 条 L2 FAQ 上的检索效果
 * 运行：node seed/scripts/eval_embedding.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const FAQ_PATH = path.join(ROOT, "seed", "fund_semantic_entries.json");
const CACHE_PATH = path.join(ROOT, "seed", "fund_semantic_embeddings.json");
const RAW_OUT = path.join(ROOT, "seed", "eval_raw_data.json");

// ══════════════════════════════════════
// 0. 环境变量解析（自包含，不依赖 dotenv）
// ══════════════════════════════════════
function loadEnv(filePath) {
  const map = {};
  if (!fs.existsSync(filePath)) return map;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    map[key] = val;
  }
  return map;
}

const env = loadEnv(path.join(ROOT, ".env.local"));
const ZHIPU_API_KEY = env.ZHIPU_API_KEY;
const EMBED_MODEL = env.ZHIPU_EMBEDDING_MODEL || "embedding-3";
const EMBED_BASE_URL = env.ZHIPU_EMBEDDING_API_URL || "https://open.bigmodel.cn/api/paas/v4";
const DIMENSIONS = 256;

// ══════════════════════════════════════
// 1. 工具函数（复用 semantic.ts / rerank.ts 的核心算法）
// ══════════════════════════════════════

/** 余弦相似度（精确复刻 rerank.ts:5-17） */
function cosineSimilarity(a, b) {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

/** Tokenize CJK text — mirrors semantic.ts tokenizeCJK */
function tokenizeCJK(text) {
  const spaceTokens = text.split(/[\s，。、？！]+/).filter((t) => t.length >= 2);
  if (spaceTokens.length > 1 || (spaceTokens.length === 1 && spaceTokens[0] !== text)) {
    return spaceTokens;
  }
  const result = [];
  if (text.length < 2) return result;
  for (let i = 0; i < text.length - 1; i++) result.push(text.slice(i, i + 2));
  for (let i = 0; i < text.length - 2; i++) result.push(text.slice(i, i + 3));
  return [...new Set(result)];
}

/** 关键词评分（精确复刻 semantic.ts scoreEntry） */
function scoreEntry(entry, query) {
  const q = query.toLowerCase();
  const title = (entry.title || "").toLowerCase();
  const body = (entry.body || "").toLowerCase();
  let score = 0;
  if (title.includes(q)) score += 5;
  for (const kw of entry.metadata?.keywords ?? []) {
    const kwLower = kw.toLowerCase();
    if (q.includes(kwLower) || kwLower.includes(q)) score += 3;
  }
  for (const token of tokenizeCJK(q)) {
    if (title.includes(token)) score += 2;
    if (body.includes(token)) score += 1;
  }
  return score;
}

/** 构建索引文本（与 rerank.ts:182 一致：title + body） */
function entryText(entry) {
  return `${entry.title}\n${entry.body}`;
}

// ══════════════════════════════════════
// 2. Zhipu Embedding API
// ══════════════════════════════════════
async function zhipuEmbed(apiKey, text, model, baseUrl) {
  const url = `${baseUrl.replace(/\/$/, "")}/embeddings`;
  const body = { model, input: text.trim(), dimensions: DIMENSIONS };
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Zhipu API ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const json = await resp.json();
  const vec = json.data?.[0]?.embedding;
  if (!vec?.length) throw new Error("Zhipu API 未返回向量");
  return vec;
}

/** 带重试的 batch embedding */
async function embedBatch(apiKey, texts, model, baseUrl, label) {
  const results = [];
  const total = texts.length;
  for (let i = 0; i < total; i++) {
    const text = texts[i];
    if (!text.trim()) { results.push(null); continue; }
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const vec = await zhipuEmbed(apiKey, text, model, baseUrl);
        results.push(vec);
        break;
      } catch (e) {
        if (attempt === 2) {
          console.error(`  ✗ [${i + 1}/${total}] ${label} 失败: ${e.message}`);
          results.push(null);
        } else {
          await sleep(1000 * (attempt + 1));
        }
      }
    }
    if ((i + 1) % 10 === 0 || i === total - 1) {
      process.stdout.write(`\r  ${label}: ${i + 1}/${total}`);
    }
  }
  console.log("");
  return results;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ══════════════════════════════════════
// 3. 加载 FAQ 语料
// ══════════════════════════════════════
function loadFAQEntries() {
  const raw = JSON.parse(fs.readFileSync(FAQ_PATH, "utf8"));
  const entries = raw.entries ?? [];
  console.log(`Loaded ${entries.length} FAQ entries from seed/fund_semantic_entries.json`);
  return entries;
}

// ══════════════════════════════════════
// 4. 25 个测试 query（5 类 × 5 题）
// ══════════════════════════════════════
const TEST_QUERIES = [
  // ── 费率 (id: 1-5) ──
  { id: 1, category: "费率", type: "直接问法", text: "管理费多少" },
  { id: 2, category: "费率", type: "直接问法", text: "申购费怎么收" },
  { id: 3, category: "费率", type: "同义改写", text: "持有基金每年要交什么钱" },
  { id: 4, category: "费率", type: "同义改写", text: "买卖基金手续费贵不贵" },
  { id: 5, category: "费率", type: "口语化", text: "这基金扣钱厉害吗" },
  // ── 风险 (id: 6-10) ──
  { id: 6, category: "风险", type: "直接问法", text: "风险等级R几" },
  { id: 7, category: "风险", type: "直接问法", text: "会不会亏本" },
  { id: 8, category: "风险", type: "同义改写", text: "这个基金安全吗波动大不大" },
  { id: 9, category: "风险", type: "同义改写", text: "最坏情况会跌多少" },
  { id: 10, category: "风险", type: "口语化", text: "买这个会不会血亏" },
  // ── 交易/流动性 (id: 11-15) ──
  { id: 11, category: "交易/流动性", type: "直接问法", text: "赎回什么时候到账" },
  { id: 12, category: "交易/流动性", type: "直接问法", text: "有没有封闭期" },
  { id: 13, category: "交易/流动性", type: "同义改写", text: "卖了钱几天能到" },
  { id: 14, category: "交易/流动性", type: "同义改写", text: "有没有规定必须持有多久" },
  { id: 15, category: "交易/流动性", type: "口语化", text: "急用钱能马上取出来吗" },
  // ── 持仓 (id: 16-20) ──
  { id: 16, category: "持仓", type: "直接问法", text: "前十大重仓股是什么" },
  { id: 17, category: "持仓", type: "直接问法", text: "行业配置集中吗" },
  { id: 18, category: "持仓", type: "同义改写", text: "主要买了哪些股票" },
  { id: 19, category: "持仓", type: "同义改写", text: "单一行业占比多少" },
  { id: 20, category: "持仓", type: "口语化", text: "这基金现在押注哪个方向" },
  // ── 配置/对比 (id: 21-25) ──
  { id: 21, category: "配置/对比", type: "直接问法", text: "适合定投吗" },
  { id: 22, category: "配置/对比", type: "直接问法", text: "能替代银行存款吗" },
  { id: 23, category: "配置/对比", type: "同义改写", text: "每月定投这个好不好" },
  { id: 24, category: "配置/对比", type: "同义改写", text: "买这个比存定期强吗" },
  { id: 25, category: "配置/对比", type: "口语化", text: "小白拿工资买它行不行" },
];

// ══════════════════════════════════════
// 5. 词条类别映射（10 类 → 简称，用于输出）
// ══════════════════════════════════════
const CATEGORY_MAP = {
  "管理费、托管费、销售服务费分别是多少？": "费率",
  "申购费和赎回费怎么收？": "费率",
  "持有满一年赎回还要钱吗？": "费率",
  "基金费用会不会很高？": "费率",
  "C 类份额和 A 类份额费率差在哪？": "费率",
  "从净值里扣费是什么意思？": "费率",
  "销售平台打折后费率怎么算？": "费率",
  "有没有隐性费用？": "费率",
  "FOF 会不会双重收费？": "费率",
  "持有成本大概多少？": "费率",
  // 风险
  "这只基金稳不稳？适合什么人？": "风险",
  "主要风险有哪些？": "风险",
  "会不会亏光本金？": "风险",
  "风险等级 R 几代表什么？": "风险",
  "QDII 有哪些额外风险？": "风险",
  "行业主题基金会更危险吗？": "风险",
  "债券基金会血亏吗？": "风险",
  "迷你基金有什么风险？": "风险",
  "杠杆或分级产品风险？": "风险",
  "政策变化会影响吗？": "风险",
  // 投资范围与策略 → 策略
  "投资范围是什么？": "策略",
  "投资策略怎么运作？": "策略",
  "投资目标是什么？": "策略",
  "能买港股/美股吗？": "策略",
  "能买可转债吗？": "策略",
  "股票仓位上下限是多少？": "策略",
  "是否投资 ST 股票？": "策略",
  "业绩比较基准是什么？": "策略",
  "指数增强和完全复制有何不同？": "策略",
  "FOF 怎么选子基金？": "策略",
  // 业绩
  "近一年收益怎么样？": "业绩",
  "最大回撤有多大？": "业绩",
  "和业绩基准比如何？": "业绩",
  "为什么跑输/跑赢基准？": "业绩",
  "成立以来表现如何？": "业绩",
  "波动大不大？": "业绩",
  "同类排名怎么看？": "业绩",
  "净值为什么突然下跌？": "业绩",
  "夏普比率/风险收益比？": "业绩",
  "牛市/熊市表现差异？": "业绩",
  // 流动性
  "赎回多久到账？": "流动性",
  "有没有最短持有期？": "流动性",
  "封闭期能卖吗？": "流动性",
  "节假日能交易吗？": "流动性",
  "大额赎回会受影响吗？": "流动性",
  "转换到其他基金可以吗？": "流动性",
  "最低申购金额多少？": "流动性",
  "流动性比货币差多少？": "流动性",
  "定开基金什么时候开放？": "流动性",
  "暂停申购赎回是怎么回事？": "流动性",
  // 分红
  "分红多不多？": "分红",
  "现金分红还是红利再投资？": "分红",
  "分红后净值为什么跌？": "分红",
  "定期支付型产品怎么分红？": "分红",
  "有没有分红记录？": "分红",
  // 经理与公司
  "基金经理是谁？": "经理",
  "经理任职期间表现？": "经理",
  "会不会换基金经理？": "经理",
  "基金管理公司可靠吗？": "经理",
  "基金托管人是谁？": "经理",
  // 持仓
  "前十大重仓是什么？": "持仓",
  "行业配置集中吗？": "持仓",
  "股票还是债券为主？": "持仓",
  "存单/债券前十大有哪些？": "持仓",
  "子基金前十大（FOF）？": "持仓",
  "海外重仓股有哪些？": "持仓",
  "指数成分股复制程度？": "持仓",
  "换手率高低说明什么？": "持仓",
  "持有人结构如何？": "持仓",
  "仓位最近有没有大变化？": "持仓",
  // 产品类型
  "是被动指数还是主动管理？": "产品",
  "和 ETF 联接有什么区别？": "产品",
  "同业存单指数适合什么场景？": "产品",
  "货币型和短债怎么选？": "产品",
  "黄金 ETF 联接是做什么的？": "产品",
  "QDII 额度受限怎么办？": "产品",
  "养老 Y 份额有何不同？": "产品",
  "是否 LOF/ETF？": "产品",
  "是否 FOF？": "产品",
  "是否 REITs？": "产品",
  // 配置与对比
  "适合定投吗？": "配置",
  "适合当底仓吗？": "配置",
  "和自家其他基金怎么配？": "配置",
  "能替代银行存款吗？": "配置",
  "一次买还是分批买？": "配置",
  "投资期限建议多久？": "配置",
  "和同类基金比优势？": "配置",
  "海外配置有什么意义？": "配置",
  "消费/科技/医药赛道差异？": "配置",
  "是否适合退休理财？": "配置",
  // 披露与解读
  "产品资料概要在哪看？": "披露",
  "招募书和概要有什么区别？": "披露",
  "季报、半年报、年报何时披露？": "披露",
  "哪里查最新公告？": "披露",
  "解读报告要注意什么？": "披露",
  "法律文件以哪个为准？": "披露",
  "定期报告能当投资建议吗？": "披露",
  "如何核对净值日期？": "披露",
  "知识库和联网信息谁优先？": "披露",
  "为什么季报持仓不是实时？": "披露",
};

function classifyEntry(title) {
  return CATEGORY_MAP[title] || "其他";
}

// ══════════════════════════════════════
// 6. 主流程
// ══════════════════════════════════════
async function main() {
  console.log("═══ L2 语义检索效果评估 ═══\n");

  if (!ZHIPU_API_KEY) {
    console.error("❌ 未找到 ZHIPU_API_KEY，退出。");
    console.error("   请在 .env.local 中配置 ZHIPU_API_KEY 和 ZHIPU_EMBEDDING_MODEL");
    process.exit(1);
  }

  console.log(`模型: ${EMBED_MODEL}  |  维度: ${DIMENSIONS}`);
  console.log(`API: ${EMBED_BASE_URL}\n`);

  // ── 6.1 加载 FAQ ──
  const entries = loadFAQEntries();

  // ── 6.2 生成/加载 FAQ embedding 缓存 ──
  let entryVectors;
  if (fs.existsSync(CACHE_PATH)) {
    console.log("✓ 加载已有 embedding 缓存...");
    const cached = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    if (cached.model === EMBED_MODEL && cached.dimensions === DIMENSIONS && cached.vectors.length === entries.length) {
      entryVectors = cached.vectors;
      console.log(`  缓存有效：${entryVectors.filter(Boolean).length} 条\n`);
    } else {
      console.log("  缓存无效（model/dimensions/count 不匹配），重新生成...\n");
      entryVectors = null;
    }
  }

  if (!entryVectors) {
    console.log(`⏳ 生成 ${entries.length} 条 FAQ embedding...`);
    const texts = entries.map((e) => entryText(e));
    entryVectors = await embedBatch(ZHIPU_API_KEY, texts, EMBED_MODEL, EMBED_BASE_URL, "FAQ");
    // 缓存
    fs.writeFileSync(CACHE_PATH, JSON.stringify({
      model: EMBED_MODEL,
      dimensions: DIMENSIONS,
      generated_at: new Date().toISOString(),
      vectors: entryVectors,
    }, null, 2), "utf8");
    console.log(`  ✓ 已缓存到 seed/fund_semantic_embeddings.json\n`);
  }

  // ── 6.3 对 25 个 query 执行评估 ──
  console.log(`⏳ 对 ${TEST_QUERIES.length} 个 query 执行评估...\n`);
  const queryVectors = [];
  for (const q of TEST_QUERIES) {
    process.stdout.write(`  [${String(q.id).padStart(2, "0")}] ${q.text}`);
    let vec = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        vec = await zhipuEmbed(ZHIPU_API_KEY, q.text, EMBED_MODEL, EMBED_BASE_URL);
        break;
      } catch (e) {
        if (attempt === 2) console.error(` ✗ ${e.message.slice(0, 60)}`);
        else await sleep(1000 * (attempt + 1));
      }
    }
    queryVectors.push(vec);
    console.log(vec ? " ✓" : " ✗ 失败");
  }
  console.log("");

  // ── 6.4 对每个 query 计算四种策略结果 ──
  const results = [];

  for (let qi = 0; qi < TEST_QUERIES.length; qi++) {
    const q = TEST_QUERIES[qi];
    const qVec = queryVectors[qi];
    console.log(`  [${q.id}] "${q.text}" (${q.category}/${q.type})`);

    // 关键词评分（对所有 100 条）
    const kwScores = entries.map((e, i) => ({
      idx: i,
      title: e.title,
      body: e.body,
      category: classifyEntry(e.title),
      kw: scoreEntry(e, q.text),
      embed: null,
      composite: null,
    }));

    // 纯关键词排序（A）
    const kwRanked = [...kwScores].sort((a, b) => b.kw - a.kw);
    const top1Kw = kwRanked[0];

    // embedding 评分（如果 query 向量成功）
    if (qVec) {
      for (const s of kwScores) {
        const eVec = entryVectors[s.idx];
        if (eVec) {
          const cos = cosineSimilarity(qVec, eVec);
          s.embed = cos;
          s.composite = cos * 0.7 + (s.kw / 10) * 0.3;
        }
      }
    }

    // B: 关键词 + embedding 重排（带阈值 0.4）
    const embRanked = (qVec
      ? [...kwScores].filter((s) => s.embed != null).sort((a, b) => b.composite - a.composite)
      : kwRanked);
    const top1Emb = embRanked[0];

    // C: pgvector cosine 排序
    const cosRanked = (qVec
      ? [...kwScores].filter((s) => s.embed != null).sort((a, b) => b.embed - a.embed)
      : kwRanked);
    const top1Cos = cosRanked[0];

    // D: 混合排序（无阈值）
    const top1Mix = embRanked[0]; // 复用 embRanked

    // 阈值误杀检测
    const belowThresh = qVec
      ? kwScores.filter((s) => s.embed != null && s.embed < 0.4 && s.kw >= 3)
      : [];
    const belowZero = qVec
      ? kwScores.filter((s) => s.embed != null && s.embed < 0 && s.kw >= 3)
      : [];

    results.push({
      query: q,
      qVec: !!qVec,
      strategy: {
        kw: { top1_idx: top1Kw?.idx, top1_title: top1Kw?.title, top1_score: top1Kw?.kw, top3_indices: kwRanked.slice(0, 3).map(s => s.idx) },
        emb: { top1_idx: top1Emb?.idx, top1_title: top1Emb?.title, top1_score: top1Emb?.composite, top1_embed: top1Emb?.embed, top3_indices: embRanked.slice(0, 3).map(s => s.idx) },
        cos: { top1_idx: top1Cos?.idx, top1_title: top1Cos?.title, top1_embed: top1Cos?.embed, top3_indices: cosRanked.slice(0, 3).map(s => s.idx) },
        mix: { top1_idx: top1Mix?.idx, top1_title: top1Mix?.title, top1_score: top1Mix?.composite, top3_indices: embRanked.slice(0, 3).map(s => s.idx) },
      },
      threshold_impact: {
        below_04_kw_ge3: belowThresh.length,
        below_04_kw_ge3_titles: belowThresh.slice(0, 5).map(s => s.title),
        below_zero_kw_ge3_titles: belowZero.map(s => s.title),
      },
      top10_kw: kwRanked.slice(0, 10).map(s => ({ idx: s.idx, title: s.title, kw: s.kw, embed: s.embed, composite: s.composite })),
      top10_emb: embRanked.slice(0, 10).map(s => ({ idx: s.idx, title: s.title, kw: s.kw, embed: s.embed, composite: s.composite })),
    });
  }

  // ── 6.5 输出原始数据 ──
  fs.writeFileSync(RAW_OUT, JSON.stringify(results, null, 2), "utf8");
  console.log(`✓ 原始数据已保存到 seed/eval_raw_data.json\n`);

  // ══════════════════════════════════════
  // 7. 终端报告
  // ══════════════════════════════════════
  console.log("═══════════════════════════════════════");
  console.log("  核心对比报告");
  console.log("═══════════════════════════════════════\n");

  // ── 表 1: Top-1 一致率 ──
  console.log("【表 1】Top-1 一致率（25 query × 4 策略）\n");
  console.log("  ID  类别        类型       A.关键词 B.Embedding C.Cosine D.混合");
  console.log("  ─── ────────── ──────── ──────── ────────── ─────── ──────");

  const pad = (s, n) => {
    let r = String(s);
    const visualLen = [...r].length;
    const target = n + Math.max(0, r.length - visualLen);
    return r + " ".repeat(Math.max(0, target - r.length));
  };

  for (const r of results) {
    const q = r.query;
    const kwT = (r.strategy.kw.top1_title || "").slice(0, 8);
    const emT = (r.strategy.emb.top1_title || "").slice(0, 10);
    const csT = (r.strategy.cos.top1_title || "").slice(0, 7);
    const mxT = (r.strategy.mix.top1_title || "").slice(0, 6);
    console.log(`  ${pad(q.id, 3)} ${pad(q.category, 10)} ${pad(q.type, 8)} ${pad(kwT, 8)} ${pad(emT, 10)} ${pad(csT, 7)} ${mxT}`);
  }

  // ── 汇总 ──
  let kwEmSame = 0, kwCosSame = 0, kwMixSame = 0;
  let semanticRescue = 0, rescueDetails = [];

  for (const r of results) {
    const k = r.strategy.kw.top1_idx;
    if (k === r.strategy.emb.top1_idx) kwEmSame++;
    if (k === r.strategy.cos.top1_idx) kwCosSame++;
    if (k === r.strategy.mix.top1_idx) kwMixSame++;

    // 语义救援：keyword miss（kw < 3 或 top-3 不理想）但 embedding top-1 属于 query 类别
    const bestEmb = r.strategy.emb;
    if (bestEmb.top1_idx != null && r.strategy.kw.top1_idx !== bestEmb.top1_idx) {
      const kwCategory = classifyEntry(r.strategy.kw.top1_title || "");
      const embCategory = classifyEntry(bestEmb.top1_title || "");
      if (embCategory === r.query.category && kwCategory !== r.query.category) {
        semanticRescue++;
        rescueDetails.push({
          query: r.query.text,
          category: r.query.category,
          kw_top1: r.strategy.kw.top1_title,
          emb_top1: bestEmb.top1_title,
          emb_cos: bestEmb.top1_embed?.toFixed(4),
        });
      }
    }
  }

  console.log(`\n  ─── 汇总 ───`);
  console.log(`  A vs B (Embedding)  Top-1一致: ${kwEmSame}/${results.length}`);
  console.log(`  A vs C (Cosine)     Top-1一致: ${kwCosSame}/${results.length}`);
  console.log(`  A vs D (混合)       Top-1一致: ${kwMixSame}/${results.length}`);
  console.log(`  语义救援: ${semanticRescue}/${results.length}（关键词 miss 但 embedding 命中目标类别）\n`);

  if (rescueDetails.length > 0) {
    console.log(`  【语义救援详情】`);
    for (const d of rescueDetails) {
      console.log(`    "${d.query}"`);
      console.log(`      KW top-1 → "${d.kw_top1}"`);
      console.log(`      EMB top-1 → "${d.emb_top1}" (cos=${d.emb_cos})`);
    }
    console.log("");
  } else {
    console.log(`  （无语义救援题 — embedding 未改变 Top-1 选择）\n`);
  }

  // ── 表 2: 阈值误杀表 ──
  console.log("【表 2】阈值误杀分析（cosine < 0.4 但 keyword ≥ 3 的条目）\n");
  let totalBelow = 0, queriesWithBelow = 0;
  for (const r of results) {
    const n = r.threshold_impact.below_04_kw_ge3;
    if (n > 0) {
      totalBelow += n;
      queriesWithBelow++;
    }
  }
  console.log(`  阈值 0.4 下受影响 query 数: ${queriesWithBelow}/${results.length}`);
  console.log(`  总误杀条目数: ${totalBelow}`);
  if (queriesWithBelow === 0) {
    console.log(`  ✓ 当前阈值 0.4 无明显误杀\n`);
  } else {
    console.log(`  ⚠ 阈值 0.4 可能导致 ${queriesWithBelow} 个 query 的高关键词得分条目被过滤\n`);
  }

  // ── 表 3: 按 query 类型汇总 ──
  console.log("【表 3】按 query 类型汇总\n");
  const typeSummary = {};
  for (const r of results) {
    const t = r.query.type;
    if (!typeSummary[t]) typeSummary[t] = { count: 0, kwEmSame: 0, kwCosSame: 0 };
    typeSummary[t].count++;
    if (r.strategy.kw.top1_idx === r.strategy.emb.top1_idx) typeSummary[t].kwEmSame++;
    if (r.strategy.kw.top1_idx === r.strategy.cos.top1_idx) typeSummary[t].kwCosSame++;
  }
  console.log(`  类型       题数  KW=EMB  KW=COS`);
  for (const [t, s] of Object.entries(typeSummary)) {
    console.log(`  ${pad(t, 10)} ${s.count}    ${s.kwEmSame}       ${s.kwCosSame}`);
  }
  console.log("");

  // ── 表 4: 按 query 类别汇总 ──
  console.log("【表 4】按 query 类别汇总\n");
  const catSummary = {};
  for (const r of results) {
    const c = r.query.category;
    if (!catSummary[c]) catSummary[c] = { count: 0, kwEmSame: 0, kwCosSame: 0, rescue: 0 };
    catSummary[c].count++;
    if (r.strategy.kw.top1_idx === r.strategy.emb.top1_idx) catSummary[c].kwEmSame++;
    if (r.strategy.kw.top1_idx === r.strategy.cos.top1_idx) catSummary[c].kwCosSame++;
  }
  for (const d of rescueDetails) {
    if (catSummary[d.category]) catSummary[d.category].rescue++;
  }
  console.log(`  类别       题数  KW=EMB  KW=COS  语义救援`);
  for (const [c, s] of Object.entries(catSummary)) {
    console.log(`  ${pad(c, 10)} ${s.count}    ${s.kwEmSame}       ${s.kwCosSame}       ${s.rescue}`);
  }
  console.log("");

  // ── 建议 ──
  console.log("═══════════════════════════════════════");
  console.log("  初步建议");
  console.log("═══════════════════════════════════════\n");

  const consensusRate = kwEmSame / results.length;
  if (consensusRate > 0.9) {
    console.log(`⚠ Top-1 一致率 ${(consensusRate * 100).toFixed(0)}% > 90% — embedding 增益微弱`);
    console.log("  可能原因：100 条 FAQ 语料同质化高，关键词已足够覆盖");
    console.log("  建议：优先扩展 FAQ 语料（100→300 条），增加同义改写和口语化变体\n");
  }

  if (semanticRescue > 0) {
    console.log(`✓ 语义救援 ${semanticRescue}/${results.length} 题 — embedding 在部分 query 上有增益`);
    console.log(`  建议：保留 embedding，但降低阈值（0.4→0 或 0.15）\n`);
  }

  if (queriesWithBelow === 0 && consensusRate > 0.85) {
    console.log(`✓ 当前阈值 0.4 无明显误杀 → 可保持`);
    console.log(`  L2 embedding 仅排序不过滤 的微调空间有限，优先扩语料\n`);
  }

  console.log("═══════════════════════════════════════");
  console.log(`  评估完成 · 缓存: seed/fund_semantic_embeddings.json`);
  console.log(`  原始数据: seed/eval_raw_data.json`);
  console.log("═══════════════════════════════════════");
}

main().catch((e) => {
  console.error("评估出错:", e);
  process.exit(1);
});
