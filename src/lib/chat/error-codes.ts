/**
 * PRD §5.14 对客文案 错误码常量
 * 供前端/后端统一使用，便于 i18n 和日志追踪。
 */

import { settingsPath } from "@/lib/settings/copy";

// —— 流式 / 连接 ——
export const ERR_STREAM = "ERR-STREAM";
export const ERR_TIMEOUT = "ERR-TIMEOUT";
export const ERR_OFFLINE = "ERR-OFFLINE";

// —— 图片 ——
export const ERR_IMAGE_SIZE = "ERR-IMAGE-SIZE";
export const ERR_IMAGE_TYPE = "ERR-IMAGE-TYPE";
export const ERR_IMAGE_COUNT = "ERR-IMAGE-COUNT";
export const ERR_IMAGE_COUNT_PORT = "ERR-IMAGE-COUNT-PORT";

// —— 持仓 ——
export const ERR_HOLDINGS_ROW_LIMIT = "ERR-HOLDINGS-ROW-LIMIT";

// —— 写锁 ——
export const ERR_WRITE_LOCK = "ERR-WRITE-LOCK";

// —— 对话 ——
export const ERR_CONV_NOTFOUND = "ERR-CONV-NOTFOUND";
export const ERR_LOAD_MSGS = "ERR-LOAD-MSGS";
export const ERR_LOAD_HISTORY = "ERR-LOAD-HISTORY";

// —— 消息 ——
export const MSG_STOPPED = "MSG-STOPPED";
export const MSG_LINK_COPIED = "MSG-LINK-COPIED";

// —— Banner ——
export const BANNER_MODEL = "BANNER-MODEL";
export const BANNER_DB = "BANNER-DB";
export const BTN_GO_SETTINGS = "BTN-GO-SETTINGS";

// —— 对客文案映射 —─
export const ERROR_MESSAGES: Record<string, string> = {
  [ERR_STREAM]: `抱歉，这次没能完成回复。请稍后再试；若多次失败，请到${settingsPath("models")}检查配置。`,
  [ERR_TIMEOUT]: "等待时间有点长，本次回复已中断。你可以重新发送问题。",
  [ERR_OFFLINE]: "当前网络不可用，请检查连接后重试。",
  [ERR_IMAGE_SIZE]: "单张图片不能超过 10MB，请压缩后重试。",
  [ERR_IMAGE_TYPE]: "仅支持 JPG、PNG、WebP 格式的图片。",
  [ERR_IMAGE_COUNT]: "每轮最多上传 5 张图片。",
  [ERR_IMAGE_COUNT_PORT]: "单次最多上传 20 张图片。请先发送最重要的几页，之后再补充剩余截图。",
  [ERR_HOLDINGS_ROW_LIMIT]: "单次最多保存 100 笔持仓记录。请删减或分批录入后再确认。",
  [ERR_WRITE_LOCK]: "需求梳理、资产配置或持仓的分析正在进行中，请等当前流程结束后再试。",
  [ERR_CONV_NOTFOUND]: "这条对话不存在或已被删除。",
  [ERR_LOAD_MSGS]: "对话内容加载失败。",
  [ERR_LOAD_HISTORY]: "历史列表加载失败。",
  [MSG_STOPPED]: "已停止生成",
  [MSG_LINK_COPIED]: "链接已复制",
};
