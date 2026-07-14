import { getPublicModelSettings } from "@/lib/supabase/server";
import {
  getPublicDatabaseSettings,
} from "@/lib/settings/database";
import { getPublicDataSourceSettings } from "@/lib/settings/datasources";
import { settingsPath } from "@/lib/settings/copy";
import type { ModelSettingsRowWithSource } from "@/lib/settings/env-defaults";

export interface ReadinessResult {
  models: {
    reasoning: boolean;
    web: boolean;
    vision: boolean;
    chat_ready: boolean;
  };
  database: {
    ready: boolean;
    check_status: string;
    /** true 时设置页无「我的数据」；未就绪请启动 Docker + supabase start */
    local_managed: boolean;
  };
  datasources: {
    tushare: boolean;
    akshare: boolean;
  };
  banners: string[];
}

function modelReady(row: ModelSettingsRowWithSource | undefined): boolean {
  return row?.check_status === "passed";
}

/** 只读配置表中的检测结果；全量检测在打开客户端时触发，刷新页面不重复检测 */
export async function getReadiness(): Promise<ReadinessResult> {
  const [rows, dbPublic, dsPublic] = await Promise.all([
    getPublicModelSettings(),
    getPublicDatabaseSettings(),
    getPublicDataSourceSettings(),
  ]);

  const reasoningReady = modelReady(rows.find((r) => r.slot === "reasoning"));
  const webReady = modelReady(rows.find((r) => r.slot === "web"));
  const visionReady = modelReady(rows.find((r) => r.slot === "vision"));
  const chatReady = reasoningReady && webReady;
  const dbReady = dbPublic.check_status === "passed";

  const banners: string[] = [];
  if (!chatReady) {
    banners.push(`请先完成${settingsPath("models")}中「日常对话」与「联网搜索」的检测。`);
  } else if (!dbReady) {
    banners.push(
      dbPublic.local_managed
        ? "本地 Supabase 未就绪。请启动 Docker Desktop，在终端运行 npm run supabase:recover 后刷新页面。"
        : `保存投资方案与持仓需要先连接个人数据空间。请先到${settingsPath("database")}完成检测。`,
    );
  }

  return {
    models: {
      reasoning: reasoningReady,
      web: webReady,
      vision: visionReady,
      chat_ready: chatReady,
    },
    database: {
      ready: dbReady,
      check_status: dbPublic.check_status,
      local_managed: dbPublic.local_managed,
    },
    datasources: {
      tushare: dsPublic.tushare_check_status === "passed",
      akshare: dsPublic.akshare_check_status === "passed",
    },
    banners,
  };
}

export function isTabBlocked(
  tab: string,
  readiness: ReadinessResult,
): { blocked: boolean; reason?: string } {
  if (!readiness.models.chat_ready) {
    return {
      blocked: true,
      reason: `请先完成${settingsPath("models")}中「日常对话」与「联网搜索」的检测。`,
    };
  }
  if (tab !== "chat" && !readiness.database.ready) {
    const localHint =
      "本地 Supabase 未就绪。请启动 Docker 并运行 npm run supabase:recover。";
    const byokHint = `使用前请先到${settingsPath("database")}完成连接检测。`;
    const hint = readiness.database.local_managed ? localHint : byokHint;
    return {
      blocked: true,
      reason: hint,
    };
  }
  return { blocked: false };
}
