/**
 * 配置验证 CLI 工具
 * 用途：验证环境变量、数据库连接、模型配置
 * 可被 skill 调用，也可独立运行
 *
 * 运行方式：npx tsx automation/cli/verify-config.ts [all|env|db|models]
 */

import { resolveProviderStack, probeModelSlot } from "@/lib/config/model-providers";
import { createClient } from "@supabase/supabase-js";

interface VerifyResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

// 验证环境变量
async function verifyEnv(): Promise<VerifyResult> {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "MIMO_API_KEY",
    "ZHIPU_API_KEY",
  ];

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return {
      ok: false,
      message: `缺少必要的环境变量：${missing.join(", ")}`,
      details: { missing },
    };
  }

  return {
    ok: true,
    message: "环境变量配置完整",
    details: {
      supabase_url: process.env.SUPABASE_URL?.slice(0, 30) + "...",
      has_mimo_key: !!process.env.MIMO_API_KEY,
      has_zhipu_key: !!process.env.ZHIPU_API_KEY,
    },
  };
}

// 验证数据库连接
async function verifyDatabase(): Promise<VerifyResult> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return {
      ok: false,
      message: "数据库配置缺失",
    };
  }

  try {
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await client.from("conversations").select("id").limit(1);

    if (error) {
      if (error.message.includes("does not exist")) {
        return {
          ok: false,
          message: "数据库表不存在，请先运行迁移",
          details: { error: error.message },
        };
      }
      return {
        ok: false,
        message: `数据库连接失败：${error.message}`,
        details: { error: error.message },
      };
    }

    return {
      ok: true,
      message: "数据库连接正常",
    };
  } catch (e) {
    return {
      ok: false,
      message: `数据库连接异常：${e instanceof Error ? e.message : "未知错误"}`,
    };
  }
}

// 验证模型配置
async function verifyModels(): Promise<VerifyResult> {
  const stack = resolveProviderStack();
  const results: Record<string, VerifyResult> = {};

  // 检查推理模型
  if (stack.reasoning) {
    results.reasoning = await probeModelSlot("reasoning");
  } else {
    results.reasoning = { ok: false, message: "未配置推理模型" };
  }

  // 检查联网搜索
  if (stack.web) {
    results.web = await probeModelSlot("web");
  } else {
    results.web = { ok: false, message: "未配置联网搜索" };
  }

  const allOk = Object.values(results).every((r) => r.ok);
  const messages = Object.entries(results)
    .map(([slot, r]) => `${slot}: ${r.message}`)
    .join("\n");

  return {
    ok: allOk,
    message: allOk ? "所有模型检测通过" : `部分模型检测失败：\n${messages}`,
    details: results,
  };
}

// 全量验证
async function verifyAll(): Promise<VerifyResult> {
  const envResult = await verifyEnv();
  if (!envResult.ok) {
    return { ok: false, message: `环境变量检查失败：${envResult.message}` };
  }

  const dbResult = await verifyDatabase();
  const modelsResult = await verifyModels();

  const allOk = dbResult.ok && modelsResult.ok;
  return {
    ok: allOk,
    message: [
      `环境变量：${envResult.ok ? "✅" : "❌"}`,
      `数据库：${dbResult.ok ? "✅" : "❌"} ${dbResult.message}`,
      `模型：${modelsResult.ok ? "✅" : "❌"} ${modelsResult.message}`,
    ].join("\n"),
    details: {
      env: envResult,
      database: dbResult,
      models: modelsResult,
    },
  };
}

// CLI 入口
async function main() {
  const command = process.argv[2] || "all";

  let result: VerifyResult;
  switch (command) {
    case "env":
      result = await verifyEnv();
      break;
    case "db":
      result = await verifyDatabase();
      break;
    case "models":
      result = await verifyModels();
      break;
    case "all":
    default:
      result = await verifyAll();
      break;
  }

  console.log("\n=== 配置验证结果 ===\n");
  console.log(result.ok ? "✅ 通过" : "❌ 失败");
  console.log(result.message);

  process.exit(result.ok ? 0 : 1);
}

main().catch((e) => {
  console.error("验证失败:", e);
  process.exit(1);
});
