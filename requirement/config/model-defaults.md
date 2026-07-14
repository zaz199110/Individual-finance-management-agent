# 本地联调模型配置表（定稿）

> **用途**：本仓库编码阶段 **本地 / 自动化验收** 的模型栈唯一记录。  
> **密钥**：真实 Key 只写在 `secrets.env` / 项目根 `.env.local`，**勿**写入本文件或 PRD。  
> **生效**：`npm run env:bootstrap` 会按本表写入 `.env.local`；代码默认见 `src/lib/config/model-providers.ts`。

**定稿日期**：2026-06-15 · 后续不再重复口头约定，以本表为准。

---

## 一、五槽位默认方案

| 槽位 | 默认厂商 / 模型 | API Base URL | 默认 `model_name` | 与推理相同？ | 聊天阻断？ | 备注 |
|------|-----------------|--------------|-------------------|--------------|------------|------|
| **推理（快）** | 小米 Mimo | `https://token-plan-cn.xiaomimimo.com/anthropic` | `mimo-v2.5` | — | ✅ 必填 | Anthropic `/v1/messages` 协议 |
| **深度推理** | 小米 Mimo | 同推理 | `mimo-v2.5` | ✅ 默认相同 | 否 | 规划书、深度报告 |
| **图片理解** | 小米 Mimo | 同推理 | `mimo-v2.5` | ✅ 默认相同 | 用图时 | 五 Tab 发图 / 截图 |
| **联网搜索** | 智谱 Search-Std | `https://open.bigmodel.cn/api` | `search_std` | ❌ **独立** | ✅ 必填 | Web Search API，**不与推理共用** |
| **文本嵌入** | 智谱 Embedding-3 | `https://open.bigmodel.cn/api/paas/v4` | `embedding-3` | ❌ 独立 | 否（可选） | L1/L2/L3 层内语义筛选；设置可关；未配不阻断聊天 |

**原则（定稿）**：

1. **快推理 / 深度推理 / 图片理解** → 默认 **同一套 Mimo v2.5**，不混用 Kimi / DeepSeek。  
2. **联网搜索** → 默认 **智谱 Search-Std**，独立计费资源包，**不回落**到 Mimo / Kimi。  
3. **文本嵌入** → 默认 **可不启用**；需要时用 **智谱 Embedding-3**（L1/L2/L3 层内重排）；**设置页可关闭**语义筛选；与联网共用 `ZHIPU_API_KEY`。

---

## 二、环境变量对照

| 环境变量 | 示例值 | 对应槽位 |
|----------|--------|----------|
| `MIMO_API_URL` | `https://token-plan-cn.xiaomimimo.com/anthropic` | 推理 / 深度 / 图片 |
| `MIMO_API_KEY` | （见 `secrets.env`） | 同上 |
| `MIMO_MODEL_NAME` | `mimo-v2.5` | 同上 |
| `MIMO_API_PROTOCOL` | `anthropic` | 同上 |
| `ZHIPU_API_KEY` | （见 `secrets.env`） | 联网 + 嵌入 |
| `ZHIPU_WEB_API_URL` | `https://open.bigmodel.cn/api` | 联网 |
| `ZHIPU_WEB_SEARCH_ENGINE` | `search_std` | 联网 |
| `ZHIPU_EMBEDDING_API_URL` | `https://open.bigmodel.cn/api/paas/v4` | 嵌入 |
| `ZHIPU_EMBEDDING_MODEL` | `embedding-3` | 嵌入（设此项才启用槽位） |
| `PRIMARY_REASONING_PROVIDER` | `mimo` | bootstrap 补丁 |
| `PRIMARY_DEEP_PROVIDER` | `mimo` | bootstrap 补丁 |
| `PRIMARY_VISION_PROVIDER` | `mimo` | bootstrap 补丁 |
| `PRIMARY_WEB_PROVIDER` | `zhipu` | bootstrap 补丁 |

模板见 [`env.template`](./env.template)。一键生成：项目根 `npm run env:bootstrap`。

---

## 三、API 与文档

| 能力 | 端点 | 官方文档 |
|------|------|----------|
| Mimo 对话 | `{MIMO_API_URL}/v1/messages` | Token Plan 控制台 |
| 联网 Search-Std | `POST /paas/v4/web_search` | [网络搜索](https://docs.bigmodel.cn/api-reference/%E5%B7%A5%E5%85%B7-api/%E7%BD%91%E7%BB%9C%E6%90%9C%E7%B4%A2) |
| 文本 Embedding-3 | `POST /paas/v4/embeddings` | [文本嵌入](https://docs.bigmodel.cn/api-reference/%E6%A8%A1%E5%9E%8B-api/%E6%96%87%E6%9C%AC%E5%B5%8C%E5%85%A5) |

**代码入口**：

| 模块 | 路径 |
|------|------|
| 槽位解析 | `src/lib/config/model-providers.ts` |
| 联网 | `src/lib/zhipu/web-search.ts` |
| 嵌入 | `src/lib/zhipu/embedding.ts` |
| Harness 工具 | `src/harness/tools/web_search.ts` |

---

## 四、控制台与资源包

| 厂商 | 控制台 | 本地用途 |
|------|--------|----------|
| 小米 Mimo | https://platform.xiaomimimo.com/console/plan-manage | 推理 / 深度 / 图片（Token Plan） |
| 智谱 | https://open.bigmodel.cn/usercenter/proj-mgmt/apikeys | Search-Std 联网（按次）+ Embedding-3（按 token） |

智谱资源包（联调参考）：Search-Std 独立包；Embedding-3 按 token 计费。**联网与推理分开买、分开配。**

---

## 五、设置页与就绪规则

| 检查项 | 规则 |
|--------|------|
| **聊天就绪** | 推理 ✅ + 联网 ✅（嵌入不参与） |
| 深度 / 图片 | 设置页默认勾选「与推理模型相同」 |
| 联网 / 嵌入 | **不**提供「与推理相同」；各自独立填或读 env |

自动化验收：`SET-MIMO-01`、`SET-MIMO-VISION`、`SET-ZHIPU-WEB`；索引见 [`automation/INDEX.md`](../../automation/INDEX.md)。

---

## 六、备用 API（secrets.env 中保留，非默认栈）

| 厂商 | 典型用途 | 说明 |
|------|----------|------|
| Kimi | 历史联调 / 备用 | **非**当前默认联网或推理 |
| DeepSeek | 历史联调 / 备用 | **非**当前默认推理 |
| 智谱 GLM 对话 | `glm-4-flash` 等 | **非**当前默认；嵌入用 `embedding-3` 而非 chat 模型名 |

---

## 七、变更记录

| 日期 | 变更 |
|------|------|
| 2026-06-15 | **定稿**：Mimo v2.5（推理/深度/图片）+ 智谱 Search-Std（联网）+ 可选 Embedding-3（嵌入） |
| （更早） | 曾用 DeepSeek 推理 + Kimi 联网/Vision；已废弃为默认栈 |
