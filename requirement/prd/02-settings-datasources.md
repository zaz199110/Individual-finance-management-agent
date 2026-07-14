> [← 设置总览](./02-settings.md) · **2.8 数据源（L0）**

## 2.8 数据源（L0 行情）

### 模块说明

Tushare / AKShare 结构化行情与交易日历（L0）；与模型「联网搜索」（L3）分工见 §2.8.1 页顶文案。Hub 对照 → [§2.0](./02-settings.md) ③。

路径：**设置 → 数据源**（`/settings/datasources`）

### 2.8.1 页顶对客说明（固定文案）

> 这里配置**基金净值、业绩、持仓、交易日历**等结构化数据来源（优先 Tushare，其次 AKShare）。  
> 与上方 **模型 → 联网搜索** 不同：联网用于新闻与公开资讯；**报告里的净值与业绩数字优先来自本页数据源**。  
> 若均未配置或不可用，系统会尝试联网补充并标注「行情来自公开网络参考」，**不阻断**对话与出报告（L0-FALLBACK-01）。

### 2.8.2 本期需配置项一览

| 数据源 | 设置页 | 用户填什么 | 必填 | 检测 |
|--------|--------|------------|------|------|
| **Tushare** | ✅ 分组 A | **Token**（`tushare.pro` 注册） | **推荐**（不填则跳过，走 AKShare） | ✅「检测可用性」 |
| **AKShare** | ✅ 分组 B | **无需 Key**（只读说明 + 连通检测） | — | ✅「检测连通性」（可选） |
| **联网兜底（L3）** | ❌ 不在此页 | 已在 **设置 → 模型 → 联网搜索** | 对话必填 | 见 §2.2.4 |

**本期不做**：Wind / 同花顺 iFinD / 额外商业行情 API、数据源优先级拖拽排序、按场景禁用 L0。

### 2.8.3 Tushare（分组 A · P0）

| 字段（设置页标签） | 必填 | 说明 |
|-------------------|------|------|
| **Tushare Token** | 推荐 | 控制台 [tushare.pro](https://tushare.pro) 获取；保存后掩码 `••••••` |

**页内 Helper**：「用于基金基本信息、净值、业绩、持仓、**沪深交易日历**（`trade_cal`）。积分不足时可能限流，系统将自动尝试 AKShare。」

**检测逻辑**（`POST /api/settings/datasources/test` · `{ provider: 'tushare' }`）：

| 步骤 | 说明 |
|------|------|
| 1 | 用 Token 调 **`trade_cal`**（`exchange='SSE'`，取最近 5 个交易日）或 **`fund_basic`** 限 1 条 |
| 2 | 成功 | 2xx + 非空数据行 → 「已通过检测，Tushare 可正常使用」 |
| 3 | 失败 | 对客：Token 无效 / 积分或权限不足 / 连接超时（**不**展示 HTTP 码） |

**配置变更后**：Token 修改 → 检测状态回退「尚未检测」（同 §2.2.4 四态）。

**落库**：`data_source_settings` 或 `app_settings` 键 `tushare_token`（服务端加密 · G-05）。

### 2.8.4 AKShare（分组 B · 只读 + 检测 · P0）

| 项 | 说明 |
|----|------|
| **配置项** | **无** API Key；页内固定文案：「AKShare 为免费公开数据源，**无需填写密钥**。当 Tushare 未配置或调用失败时，系统自动使用 AKShare。」 |
| **检测** | 按钮「检测连通性」→ 服务端调 **1 次最小公开接口**（如开放式基金信息或交易日历等价接口） |
| **成功** | 「AKShare 连通正常，可作为备用数据源」 |
| **失败** | 「AKShare 暂不可用，请检查网络；基金行情将依赖联网搜索兜底」 |

**不阻断**：AKShare 检测失败 **不阻断** 任何 Tab；仅影响 L0 质量与 `lookup_source`。

### 2.8.5 L0 调用链（Harness · 定稿）

```
fund_lookup / 持仓行情 / 定时 as_of_trade_date
    │
    ├─ 1. Tushare（若 Token 已配置且检测通过）
    │      └─ 失败 → 2
    ├─ 2. AKShare（无 Key，自动）
    │      └─ 失败 → 3
    └─ 3. web_search 兜底（L0-FALLBACK-01）
           └─ l0_degraded: true · 正文标注数据来源
```

| 场景 | 无 Tushare、AKShare 均失败 |
|------|------------------------------|
| **自由问答** | 可聊；涉及单基数字时走联网，附来源 |
| **基金解析 / 持仓 / 定时** | **可继续**；报告/分析标注 degraded |
| **阻断** | **不**因 L0  alone 阻断（与推理/联网/DB 规则独立 · §2.0.2） |

**`lookup_source` 枚举**：`tushare` | `akshare` | `web_fallback`（[analysis §9.1.8](./09-fund-analysis.md)）。

### 2.8.6 交易日历（SCH-01 / SCH-11 · 与本页关系）

定时持仓 **`as_of_trade_date`** 与 **`trading_calendar` 表**（[scheduled §4.2.6](./04-scheduled-tasks.md)）优先 **Tushare `trade_cal`**（需 Token）；否则 **AKShare 日历**；再否则净值回溯兜底（§4.2.1）。

| 项 | 规格 |
|----|------|
| 存储 | Postgres **`trading_calendar`**（权威 · **`exchange='SSE'`**）；SSE 与 SZSE A 股休市日一致，**本期不重复存 SZSE**（SCH-13） |
| **刷新** | 进入 **定时持仓分析页** 时，若缺 **当前公历年**（建议含次年）→ 后台拉取 |
| **MVP** | migration / seed 可预填 **2026 全年**，保证离线演示 |

用户 **无需** 在本页手动维护日历。

### 2.8.7 数据表（编码参考）

```sql
-- data_source_settings（单用户 · 单行）
id              uuid PK
tushare_token   text          -- 加密存储
tushare_check_status   text   -- unchecked | checking | passed | failed
tushare_last_checked_at timestamptz
tushare_last_error_message text
akshare_check_status   text
akshare_last_checked_at timestamptz
updated_at      timestamptz
```

### 2.8.8 API 速查

| API | 说明 |
|-----|------|
| `GET/PATCH /api/settings/datasources` | 读写 Token；Token 响应掩码 |
| `POST /api/settings/datasources/test` | body `{ provider: 'tushare' \| 'akshare' }` |

### 2.8.9 验收（勾选）

- [ ] 填写 Tushare Token → 保存 → **检测可用性** → 通过
- [ ] 清空 Token → 保存 → Tushare 跳过；**AKShare 检测**通过时 `fund_lookup` 仍返回 `lookup_source=akshare`
- [ ] 二者均不可用 → `fund_lookup` 返回 `l0_degraded: true`，**不**阻断 `chat` 发消息
- [ ] 维护者 `secrets.env` 的 `TUSHARE_TOKEN`：**设置页优先**（SET-DS-02）；env 仅开发 fallback

**env 与设置页优先级（SET-DS-02 · 定稿）**：运行时 **`data_source_settings`（设置页）优先**；未填时只读 fallback `{APP_ROOT}/.env.local` / 维护者 `secrets.env`（仅开发联调）。
