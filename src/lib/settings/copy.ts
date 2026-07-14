/** C 端设置页文案：只保留必要对客信息 */

export const SETTINGS_SECTIONS = {
  general: {
    href: "/settings/general",
    navLabel: "显示偏好",
    title: "显示偏好",
  },
  database: {
    href: "/settings/database",
    navLabel: "我的数据",
    title: "我的数据",
  },
  datasources: {
    href: "/settings/datasources",
    navLabel: "行情数据",
    title: "行情数据",
  },
  models: {
    href: "/settings/models",
    navLabel: "模型配置",
    title: "模型配置",
  },
  memory: {
    href: "/settings/memory",
    navLabel: "回答偏好",
    title: "回答偏好",
  },
} as const;

export type SettingsSectionKey = keyof typeof SETTINGS_SECTIONS;

/** 配置已同步至配置表；打开客户端时会自动检测一次，设置页直接展示库内结果。 */
export const CONFIG_FROM_ENV_HINT =
  "配置已同步至配置表；打开客户端时会自动检测一次，设置页展示库内检测结果。";

/** 本地 Supabase：由 .env.local + Docker 栈自动注入，无需在设置页手填 BYOK */
export const LOCAL_DATABASE_MANAGED_HINT =
  "本地 Supabase 已由开发环境自动配置（.env.local）。请保持 Docker 运行；若启动异常可运行 npm run supabase:recover 恢复，启动应用时会自动检测连接，无需手动填写项目地址或密钥。";

export const SETTINGS_NAV_ORDER: SettingsSectionKey[] = [
  "general",
  "database",
  "datasources",
  "models",
  "memory",
];

export function settingsPath(key: SettingsSectionKey): string {
  return `「设置 → ${SETTINGS_SECTIONS[key].navLabel}」`;
}

export const CHECK_STATUS_LABEL: Record<string, string> = {
  unchecked: "尚未检测",
  checking: "检测中…",
  passed: "可用",
  failed: "暂不可用",
};

export const CHECK_STATUS_TONE: Record<
  string,
  "success" | "warning" | "neutral" | "error"
> = {
  unchecked: "neutral",
  checking: "warning",
  passed: "success",
  failed: "error",
};
