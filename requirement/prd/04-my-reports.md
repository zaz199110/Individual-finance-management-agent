> [← 报告与定时 Hub](./04-reports-and-tasks.md) · **4.1 我的报告**

## 4.1 我的报告

### 模块说明

| 项 | 说明 |
|----|------|
| **做什么** | 查看 **已确认发布** 的报告；复制深链回聊天；本地改 md 后刷新 |
| **入口** | 侧栏 **「我的报告」**（§1.2.3）→ `/reports`；全屏 `/reports/view`（§4.1.0c） |
| **页内 Tab** | 投资需求 / 规划 / 持仓 / 基金（顺序与 `report_type` → §4.1.1） |
| **不做** | 未发布草稿（在对话模式 B · §1.2.5）；列表不提供下载 |
| **编码锚点** | REST §4.1.5 · RPT-LINK-01 · 发布规则 §4.1.0 |

**仅已确认发布**快照；草稿在各场景 **模式 B**。Hub 对照 → [04-reports-and-tasks §4.0](./04-reports-and-tasks.md)。

**页内 Tab（顺序固定 · 四 Tab）**

| 顺序 | 对客 Tab | `report_type` | 本地目录 |
|------|----------|---------------|----------|
| 1 | **投资需求** | `profile` | `{APP_ROOT}/data/reports/profile/` |
| 2 | **资产配置方案** | `plan` | `{APP_ROOT}/data/reports/plan/` |
| 3 | **持仓分析** | `portfolio` | `{APP_ROOT}/data/reports/portfolio/` |
| 4 | **基金解读** | `fund` | `{APP_ROOT}/data/reports/fund/` |

---

### 4.1.0 报告草稿与发布（RPT-DRAFT-01 · RPT-PUB-01 · 四报告统一）

| 阶段 | 存储 | `report_index` | 在哪看 |
|------|------|----------------|--------|
| **待确认草稿** | `data/runs/{conversation_id}/{run_id}/draft-report.md` | **无** | 对应场景 · **模式 B** 主区 Preview |
| **已发布** | `data/reports/{type}/…` | **有** | **本页**对应 Tab |

| 规则 | 说明 |
|------|------|
| **绑定对话** | `pending_report_draft` + **`has_unconfirmed=true`**；删对话 → 删 run |
| **每对话 1 份** | 再生成 / 换类型 → **覆盖前二次确认** |
| **确认发布** | 聊天列确认卡 → `report_publish` → 清草稿 → **恢复模式 A** |
| **放弃草稿** | 删 run 草稿；**不删对话** · 投资需求报告 **另** 同轮 PH-PROFILE-UNDO-02 追问（§6.2.8） |
| **场景内草稿修订** | 仅在 **聊天列**；模式 B Preview **只读**（RPT-REV-01 · **分流** §4.1.0g） |
| **报告-only 增量** | `report_overlay`（§4.1.0h）· **重生报告时合并保留** · **不进模板** |
| **草稿 Preview 链接** | **RPT-PREVIEW-LINK-01**：仅 **外部链接** 与 **已发布报告深链** 可点击；其余链文案 **不可点**（§4.1.0f · [§1.3.4 Preview](./01-global-design.md)） |
| **已发布 md 修订** | 仅 **本页 Preview / 全屏页** 外部编辑 + **刷新**（§4.1.1 · RPT-EDIT-01）；**不回写 DB、不 Verify** |
| **定时持仓** | **例外**：Verify 后 **直接发布**，无草稿卡（§4.2 · RPT-SCHED-01） |

**各报告触发草稿**

| report_type | 何时写草稿 | 确认发布后 |
|-------------|------------|------------|
| `profile` | 某一 **投资目标约束** 确认写库后 **立即** 生成投资需求 md 草稿（§6.2.8 · Verify 后 · **必做**） | `data/reports/profile/` + `report_index` |
| `plan` | 方案 **第二步结构化确认写库后** 生成规划 md（§7.4 · PL-03） | `data/reports/plan/` |
| `portfolio` | 手动持仓分析完成（§8.4） | `data/reports/portfolio/` |
| `fund` | **`fund_full_report`** / 自选「AI 解析」（§9.1）；**`fund_qa` 不写草稿** | `data/reports/fund/` |

> **投资规划**：**大类/明细方案**写库（`allocation_plans`）与 **规划 md 发布** 是 **两步**；后者须用户 **确认发布**。

| 报告类型 | Tab | 性质 | 触发 |
|----------|-----|------|------|
| 投资需求报告 | 投资需求 | 已发布快照 | 约束 **确认写库** → 草稿 → **确认发布**（§6.2.8 · §6.0.1 **完善**） |
| 投资规划报告 | 投资规划 | 已发布快照 | 方案第二步写库 → 草稿 → **确认发布** |
| 持仓分析报告 | 持仓分析 | 已发布快照 | 手动：草稿 → 确认发布；**定时：直发**（§4.2） |
| 单只基金解读报告 | 基金解读 | 已发布快照 | **`fund_full_report`** 确认发布；简答不进本页 |

#### 4.1.0a 报告确认卡（RPT-CARD-01 · 四报告统一 · P0）

> **位置**：profile / plan / portfolio / fund · **模式 B** · **右侧聊天列**（非 Preview 内）。  
> **对客 Mock** → `skills/shared/confirm_card.mock.zh.md` §六 · 通则 → [shared §5.3.10b](./05-chat-shared.md)。  
> **合规**：卡片底或副标题重复 §0.7 短版一句。  
> **预览**：模式 B 下主区左侧已是报告 Preview；卡片正文须提示客户在左侧查看，**不设**「查看报告预览」按钮。  
> **确认前 chat**：按 **RPT-CHAT-ROUTE-01**（§4.1.0g）分流；**报告-only** 走 overlay（§4.1.0h），**不必** 点放弃草稿。

| 按钮（对客） | 行为 |
|--------------|------|
| **确认发布** | `report_publish` → 清 draft · **`has_unconfirmed=false`** → 模式 A → 助手一句（见下表 · Mock → `confirm_card.mock.zh.md` §六） |
| **放弃草稿** | 删 run · 清 draft → 模式 A |

| report_type | 卡片标题示例 | 副信息 |
|-------------|--------------|--------|
| `profile` | `{report_name}` | 投资目标场景名（只读） · 发布后助手：**已保存至「我的报告 · 投资需求」** |
| `plan` | `{report_name}` | 绑 `{goal_constraint_id}` 场景名（只读） · 发布后助手：**已保存至「我的报告 · 资产配置方案」** |
| `portfolio` | `{report_name}` | 持仓版本摘要（只读） · 发布后助手：**已保存至「我的报告 · 持仓分析」** |
| `fund` | `{report_name}` | 数据截至 `{as_of_trade_date}` · 发布后助手：**已保存至「我的报告 · 基金解读」** |

**定时持仓**：**无**本卡（RPT-SCHED-01 直发）。

#### 4.1.0b `draft-meta.json`（与 md 同目录 · 建议 schema）

| 中文含义 | 字段名称 | 字段类型 | 字段说明 |
|----------|----------|----------|----------|
| 报告类型 | `report_type` | string | `profile` \| `plan` \| `portfolio` \| `fund` |
| 所属对话 | `conversation_id` | uuid | |
| Run 标识 | `run_id` | uuid | |
| 报告名称 | `report_name` | string | 与 md `#` 标题一致 §4.1.0d |
| 基金代码 | `fund_code` | string? | fund 必填 |
| 报告 archetype | `report_archetype` | string? | fund · `A`–`F` |
| 数据截止日 | `as_of_trade_date` | date? | fund / portfolio |
| 客户信息层版本 | `profile_version_id` | uuid? | profile / plan |
| 目标约束 | `goal_constraint_id` | uuid? | profile / plan |
| 约束修订 | `goal_constraint_revision_id` | uuid? | **profile** · 写草稿时主表最新修订 id（与 publish 一致 · PH-PROFILE-GV-02） |
| 方案版本 | `allocation_plan_id` | uuid? | plan |
| 绑定投资需求 | `profile_report_id` | uuid? | **plan** · PH-PROFILE-ENC-01 对齐的 `report_index.id`（§一 深链） |
| 持仓版本 | `holdings_version_id` | uuid? | portfolio |
| 知识库引用 | `knowledge_citations` | array? | fund · FK-CITE |
| 联网引用 | `web_citations` | array? | L3 ≤5 |
| 草稿创建时间 | `draft_created_at` | timestamptz | |
| 草稿更新时间 | `draft_updated_at` | timestamptz | |

#### 4.1.0c 页面、导航与全屏查看（RPT-NAV-01 · P0）

**布局 · 列表页 `/reports`**

```
┌─ 侧栏 ─────────┬─ 主区 · 我的报告 ─────────────────────────────────────┐
│ [+ 新对话]      │  [ ← 返回对话 ]   我的报告          ← 仅 URL 带 ?c= 时 │
│ 历史…          │  ───────────────────────────────────────────────────── │
│ ── 全局 ──     │  [投资需求][资产配置方案][持仓分析][基金解读]  [打开文件夹]   │
│ ● 我的报告     │  ────────────────┬────────────────────────────────────  │
│  定时持仓分析… │  列表             │  Preview（选中行 · 内嵌）              │
└────────────────┴──────────────────┴──────────────────────────────────────┘
```

| 规则 ID | 规则 |
|---------|------|
| **RPT-NAV-01** | **侧栏常驻**；进本页 **不拦截** pending（SH-03）；侧栏 **「我的报告」高亮** |
| **RPT-NAV-02** | 从对话进入时 URL 携带 **`?c={conversation_id}`**（及可选 `tab` / `id`） |
| **RPT-NAV-03** | URL 带 `?c=` 时顶栏显示 **「← 返回对话」** → 回到 `/?c={id}`，恢复离开前 Tab / 模式 A 或 B |
| **RPT-NAV-04** | URL **无** `?c=`（深链直达等）→ **不显示**「返回对话」 |
| **RPT-NAV-05** | 点「返回对话」时若 **`?c=` 对应对话已删除** → **不**静默跳转 CH-FIRST-01；展示 **友好报错页/横幅**（见下表） |
| **RPT-NAV-06** | 切换侧栏其它全局项（定时持仓分析 / 知识库 / 设置）→ **保留** URL 中的 `?c=`（若存在） |
| **RPT-NAV-07** | 内嵌 Preview 工具条 **始终** 显示 **「全屏查看」** → `/reports/view?tab=&id=&c=`；窄屏强调见 §4.1.6f |

**对话已删除 · 友好报错（RPT-NAV-05）**

| 项 | 对客文案 |
|----|----------|
| **标题** | 无法返回原对话 |
| **正文** | 您离开时已打开的这条对话**已被删除**，因此无法回到原来的聊天界面。<br><br>您**仍可在此查看报告**；若要继续交流，请从侧栏 **「+ 新对话」** 或选择其它历史对话。 |
| **主按钮** | **留在此页**（关闭报错，留在 `/reports`） |
| **次按钮** | **新建对话**（等同侧栏 + 新对话） |

**全屏阅读页 `/reports/view`**

| 项 | 规格 |
|----|------|
| **顶栏** | **「← 返回列表」** → 回到进入前的 `/reports?tab=&id=&c=` |
| **主区** | 仅 **`ReportMarkdownPreview`**（`showSourcePane=false`）+ §4.1.1 Preview 工具条 |
| **侧栏** | **仍常驻**（与列表页一致）；或实现上等价于列表页「主区占满」— 以编码仓 **viewport 宽 ≥1280** 下可读为准 |

#### 4.1.0d 报告名称与本地文件（RPT-NAME-01 · P0）

**对客 `report_name` 模板**（与 md 一级标题一致；分隔符统一 **`-`**）

| report_type | 模板 | 示例 |
|-------------|------|------|
| `profile` | `{场景名}-投资需求-{YYYYMMDD}` | `子女教育-投资需求-20260612` |
| `plan` | `{场景名}-资产配置方案-{YYYYMMDD}` | `子女教育-资产配置方案-20260612` |
| `portfolio` | `持仓分析报告-{YYYYMMDD}`；对照方案时 `{场景名}-持仓分析报告-{YYYYMMDD}`（**PORT-NAME-01**） | `持仓分析报告-20260612` · `退休养老-持仓分析报告-20260615` |
| `fund` | `{fund_code}-{基金简称}-基金解读-{YYYYMMDD}` | `019305-摩根标普500指数(QDII)人民币C-基金解读-20260612` |

| 项 | 规格 |
|----|------|
| **`{场景名}`** | `investment_goal_constraints` 对客中文场景名 |
| **`{YYYYMMDD}`** | **`generated_at` 确认发布时刻** · 北京时间 · **仅日期** |
| **列表展示** | 主列 **完整报告名称**（含 `{YYYYMMDD}`，便于用户唤起版本记忆）；**不单独列报告 ID**（uuid 仅用于深链/API） |
| **场景选择器** | 用户选历史报告 / 对照方案时，选项文案 **须带完整 `report_name`**（四类报告均适用 · **RPT-NAME-01**） |
| **文件名** | 默认 **`{sanitized_report_name}.md`**（非法路径字符替换为 `-`） |
| **重名** | 同目录已存在 → **`{sanitized_report_name}-{report_index.id 前 8 位}.md`** |
| **`file_path`** | 相对 `{APP_ROOT}/` · 写入 `report_index.file_path` |

#### 4.1.0e 投资需求 · 当前版本（RPT-PROFILE-01～03 · P0）

| 规则 | 说明 |
|------|------|
| **RPT-PROFILE-01** | 同一 **`goal_constraint_id`（同一投资目标）** 可有多条已发布历史；列表仍按 **`generated_at` DESC** 展示 **全部** 已发布行 |
| **RPT-PROFILE-02** | **完善 / 下游有效** = [§6.0.1 PH-PROFILE-ENC-01](./06-profile.md#601-完善的投资需求n-的定义--p0)：`Rep.profile_version_id` + `Rep.goal_constraint_revision_id` 分别等于当前客户信息层 P 与该组最新修订 R*；§7 Gather 读 **对齐行的 md 全文**（**PL-PLAN-PROFILE-MD-01**）；Hook/写库仍对主表；**不以** 旧 md 为准 |
| **RPT-PROFILE-03** | 列表 **「当前」** 小标签 = **RPT-PROFILE-02 对齐行**（每个场景 **至多一条**；约束/客户信息层已变但新版 **未发布** → **无「当前」标签**，旧行仍作历史浏览） |

**Tab 顶栏说明条（投资需求 · 对客 · 可折叠）**

> **每个投资目标，须约束确认写库且投资需求报告确认发布后，才可用于资产配置**  
> 例如「子女教育」「退休养老」各自独立。您更新某一目标约束并再次确认后，须 **确认发布** 新版《投资需求报告》，该组才重新变为 **完善**（§6.0.1）；在此之前，旧报告仍可在下方列表中 **回顾**，但 **不能** 当作当前有效需求。  
> 带 **「当前」** 标签的行 = 与当前客户信息层/约束 **一致** 的已发布报告；**做方案认的是完善态，不是随便点开一份旧 md**。

#### 4.1.0f 报告正文内链接（RPT-PREVIEW-LINK-01 · P0）

> 与 §4.1.2 **深链 URL 同形**；区别在 **待确认草稿 Preview** 是否允许点击。

**深链格式**（复制链接 / 正文互跳 **同一相对路径**）：

```
/reports?tab={profile|plan|portfolio|fund}&id={report_index.id}
```

| Preview 场景 | prop `linkPolicy` | 可点击 |
|----------------|-------------------|--------|
| **模式 B · 待确认草稿** | `draft` | ① **`http(s)://` 外部链接** ② **`/reports?…&id=` 且 `id` 已在 `report_index`** |
| **我的报告 · 已发布** | `published` | 合法深链 + 外部链接 |
| **不满足** | — | **不可点击** · 保留链文案 · 普通文字样式（无 `href` · 无手型） |

**规划书 §一**：须链至绑定 **投资需求报告**（`tab=profile` · `profile_report_id` · §7.4.1 · [plan spec §4.4](../docs/samples/plan-allocation-report-spec.md)）。

**实现**：`ReportMarkdownPreview` 渲染前校验；深链查 `report_index`；不满足 → `<span class="link-disabled">`（§1.3.4）。

#### 4.1.0g 报告确认前 · 场景 chat 分流（RPT-CHAT-ROUTE-01 · P0）

> **适用**：四类报告 **模式 B** 期间（含 **报告确认卡 `*.rpt.wait`**；各场景 **确认卡 `*.wait`** 亦同哲学 · 候选卡列表不同）。  
> **Planner 第一步**：用户消息是否要 **改库（结构化真源）**？否 → **报告-only**（§4.1.0h）。

**三分流**

```
用户消息（模式 B · 场景 chat）
        │
        ├─ 1 · 报告-only（不改库）
        │      例：加一段「综合分析」、改标题、写通俗点、删冗余段
        │      → 更新 report_overlay → 合并进 draft-report.md → 刷新 Preview
        │      → 仍 blocked 在报告确认卡（或当前 wait 节点）
        │
        ├─ 2 · 改库 · 非本 Tab
        │      例：去改投资需求、改持仓、换一只基做深度解读
        │      → **跳转卡**（shared §5.6.2）→ 目标 Tab 完整流程
        │
        └─ 3 · 改库 · 本 Tab
               → 命中哪张 **确认卡 / 写库层** → 该层 propose → Hook → **新确认卡**
               （旧卡 superseded · shared §5.3.10b）
               → 必要时 **重跑 report_draft** · **须 re-apply overlay**（§4.1.0h）
```

**Planner 信号（优先规则 · 非穷尽）**

| 倾向 | 典型信号 |
|------|----------|
| **报告-only** | 「加/删/改一段话」「标题」「通俗点」「综合分析」「排版」；**无** 可解析的比例/金额/代码/约束字段 |
| **改库 · 本 Tab** | 基金 **代码**、大类 **%**、约束 **回撤/期限/金额**、持仓 **市值**、分批/再平衡 **结构化字段** |
| **改库 · 跨 Tab** | 明确 **投资需求/持仓/另一只基金/别的场景**；或本 Tab **无** 对应确认卡层可写 |
| **含糊** | 对客 **先问一句**：「这是 **只改报告表述**，还是要 **改配置/方案**？」 |

**Verify（报告-only 仍须）**

| 项 | 规则 |
|----|------|
| 模板 Verify | 章节、echarts、与 **已写库快照** 一致 — **仍过** |
| overlay 段落 | **不要求** 进模板骨架 |
| **禁止** | overlay / 正文 **出现与已写库结构化数据矛盾的数字或基金代码** → 按 **改库** 走对应确认卡，**不得** 仅 overlay 偷偷改数 |

**各 Tab · 本场景「确认卡 / 写库层」索引（Planner 命中用）**

| Tab | 候选层（自上而下命中） | 报告 wait 期常见 |
|-----|------------------------|------------------|
| **profile** | 客户信息层确认 · 约束确认 · （队列）报告 draft | 改 §2–§5 事实 → 约束/客户信息层卡；改措辞 → overlay |
| **plan** | **大类卡** `plan.s1` · **明细卡** `plan.s2` · 报告 `plan.rpt` | 见 [§7.8.2](./07-allocation-plan.md#782-规划--chat-分流索引pl-plan-route--p0) |
| **portfolio** | 持仓确认卡 · 报告 `port.rpt.wait` | 改持仓事实 → `port.hold.*`；改分析表述 → overlay |
| **fund** | Gather/解读 · 报告 `fund.rpt` | 改数据/结论 → 重 Gather；改表述 → overlay |

**与 RPT-REV-01**：修订 **仅** 在聊天列；Preview **只读**；**禁止** Preview 内 inline 改库字段。

#### 4.1.0h 报告-only 增量 · `report_overlay`（RPT-OVERLAY-01 · P0）

> **性质**：用户 **临时追加** 的非模板正文（如「综合分析」）· **不回写** `allocation_plans` / 约束表 / 模板 Skill。  
> **绑定**：**对话** `conversation_id`；**删对话即删 overlay**（与 run 草稿同生命周期）。  
> **重生报告**：`report_draft` 自模板 + 结构化快照 **重写 body 后**，**必须** 再 **合并 overlay** — **禁止** 冲掉用户已加段落。

**存储（双写 · 同源）**

| 位置 | 说明 |
|------|------|
| **`conversations.metadata.report_overlay`** | 对话级 **权威索引**（Planner / UI） |
| **`data/runs/{conversation_id}/{run_id}/report-overlay.json`** | Harness 落盘 · 与当前 `pending_report_draft.run_id` 一致 |

**`report_overlay` 顶层**

| 中文含义 | 字段名称 | 字段类型 | 说明 |
|----------|----------|----------|------|
| 绑定 Run | `run_id` | uuid | 须 = `pending_report_draft.run_id` |
| 增量块列表 | `blocks` | array | 见下表 · **顺序即合并顺序** |
| 更新时间 | `updated_at` | timestamptz | |

**`blocks[]` 单块**

| 中文含义 | 字段名称 | 字段类型 | 说明 |
|----------|----------|----------|------|
| 块 id | `id` | uuid | 稳定 id · 修订同 id **UPDATE** |
| 插入锚点 | `anchor` | string | `after:{heading}` · `before:{heading}` · `append:end`（heading 为 md `##` 字面） |
| 对客小标题 | `title` | string? | 可选 · 渲染为 `### {title}` |
| **正文全文** | `content` | string | **永不丢弃** · 合并 md **只用此字段** |
| 长文摘要 | `summary` | string? | 仅当 `content` 超长时生成 · 见下 |
| 来源消息 | `source_message_id` | uuid? | 便于追溯 |
| 创建/更新 | `created_at` / `updated_at` | timestamptz | |

**长文阈值（RPT-OVERLAY-LEN · P0）**

| 项 | 规格 |
|----|------|
| **计量** | `content` **Unicode 字符数**（含汉字、标点、空格） |
| **≤ 800** | 仅存 `content` · **不生成** `summary` |
| **> 800** | **必须** 保留 **完整** `content` · **另生成** `summary`：**≤ 220 字** 中文摘要（供 Agent 上下文 / 确认卡「您追加的内容」摘要 · **禁止** 用 summary 代替正文合并） |
| **单块上限** | `content` **≤ 6000 字**；超出 → 对客建议拆成多块或缩短 |
| **块数上限** | **≤ 10** 块 / run |

**合并时机**

| 触发 | 行为 |
|------|------|
| 用户 **报告-only** 修订 | PATCH overlay → **`merge_report_overlay`** → 更新 `draft-report.md` → 刷新 Preview |
| **`report_draft` 重生**（改库后重出模板） | 模板 Compose 完成 → **自动 re-merge overlay** |
| **`report_publish`** | 发布前 **最终 merge** → 写入 `data/reports/…` · 发布后 **清除** `report_overlay`（正文已在定稿 md） |
| **放弃草稿 / 删对话** | 清除 overlay + run 文件 |

**对客说明（确认卡或助手一句）**

> 您 **额外加的分析段落** 会保存在 **本对话** 里，**换模板重出报告也不会丢**；**不会** 写进下次自动生成的模板骨架。确认发布后，这段会进定稿报告。

**实现 Command（Harness · 建议）**：`report_overlay_patch` · `report_overlay_merge`（内部）· `report_draft` 末尾 **必须** 调 merge。

---

### 4.1.1 已发布报告列表（四 Tab · RPT-LIST-01 · P0）

> **范围**：**仅** `report_index` 已发布行。操作列 **统一**（**无下载** · RPT-DL-01）。

**排序**：各 Tab 默认 **`generated_at` DESC**。

**Tab 顶栏（各 Tab 共有）**

| 控件 | 行为 |
|------|------|
| **打开文件夹** | 调用系统文件管理器，打开 **本 Tab 对应根目录**（§4.1.0 表）；用户可见 **本类全部 md 快照** |
| **搜索** | 仅 **资产配置方案**、**基金解读** Tab：**报告名称模糊匹配**（子串、忽略大小写） |

**操作列（四 Tab 一致）**

| 操作 | 行为 |
|------|------|
| **查看** | 选中行 → 内嵌 Preview 加载 `file_path`；工具条 **始终** 可 **全屏查看**（§4.1.6f） |
| **复制链接** | 复制 §4.1.2 深链；Toast「链接已复制」 |
| ~~下载~~ | **本期不做**（RPT-DL-01） |
| ~~在文件夹中显示此文件~~ | **本期不做** |

**列表列（四 Tab 统一骨架）**

| 列 | 内容 |
|----|------|
| **报告名称** | `report_name`；profile Tab 当前版本行加 **「当前」** 标签 |
| **生成时间** | `generated_at` → `YYYY-MM-DD HH:mm:ss` |
| **操作** | 查看 · 复制链接 |

##### 4.1.1a 投资需求 Tab

| 项 | 规格 |
|----|------|
| **搜索** | 本期不做 |
| **副信息** | 可选：场景名（若名称中已含场景名则省略） |

##### 4.1.1b 资产配置方案 Tab

| 项 | 规格 |
|----|------|
| **搜索** | **P0** · 报告名称模糊匹配 |

##### 4.1.1c 持仓分析 Tab

| 列 / 项 | 内容 |
|---------|------|
| **报告名称** | `持仓分析报告-{YYYYMMDD}` |
| **副行** | 可选：`metadata.trigger_source=scheduled` →「定时生成」 |
| **搜索** | 本期不做 |

##### 4.1.1d 基金解读 Tab

| 项 | 规格 |
|----|------|
| **搜索** | **P0** · 报告名称模糊匹配 |
| **表格** | 全部已发布 fund 快照（**不按 `fund_code` 分组**） |
| **重新生成** | 表格上方 **「解读新报告」** → 跳转 fund 场景 |
| **FK-CITE** | Preview 内「参考披露 · 查看原文」与联网引用分开展示（[knowledge §9.2.0e](./09-fund-knowledge.md)） |

**Preview 区（内嵌 / 全屏共用 · RPT-EDIT-01 · P0）**

| 控件 | 行为 |
|------|------|
| **信息条** | 展示 **`file_path` 目录 + 文件名**（文件名优先展示 **报告名称** 对应 md 名） |
| **全屏查看** | **始终显示**（§4.1.6f）；跳转 `/reports/view?…` |
| **编辑** | 系统默认文本编辑器打开该 md（如 Windows 记事本 / `shell.openPath`）；**不在 App 内嵌源码编辑** |
| **刷新** | 重新读盘 → 更新 Preview；Toast「已刷新」 |
| **约束** | 改 md **不回写** `report_index` / 结构化表；**不**触发 Verify |
| **首次编辑** | 可选 Toast：「将用系统默认程序打开本地文件，保存后请点刷新」 |

渲染：**`ReportMarkdownPreview`** · `showSourcePane=false` · 只读 Preview 栏（PREVIEW-01）。

---

### 4.1.2 报告深链与聊天引用（RPT-LINK-01 · P0）

> 聊天区 **不做业务文件上传**；讨论已发布报告 → **复制链接** 贴入输入框。

**深链 URL**

```
{origin}/reports?tab={profile|plan|portfolio|fund}&id={report_index.id}
```

| 项 | 规格 |
|----|------|
| **`tab`** | 与 `report_type` 一致 |
| **`id`** | `report_index.id`（uuid） |
| **打开** | 对应 Tab · 选中行 · 加载 Preview；可选 **`&c=`** 保留返回对话 |
| **复制内容** | **完整 URL**（含 `origin`） |

**聊天区粘贴链接（五 Tab 通用）**

| 步骤 | 规格 |
|------|------|
| 1 | 用户粘贴链接（可附带自然语言） |
| 2 | Planner 识别 `/reports?tab=` + `id=` → **`simple_qa`** 或相关追问；**不**启新报告生成 |
| 3 | Harness **`report_read`** 注入上下文 |
| 4 | 助手基于 **已发布快照** 回答 |

**与图片区分**：截图 → `vision_parse`；报告链接 → `report_read`。

**`report_read` Tool** → [HARNESS.md §4.1](../HARNESS.md)

**本期不做**：聊天 `@` 选报告；链接卡片内嵌 Preview。

---

### 4.1.5 REST 与桌面能力（RPT-API-01 · P0）

> **索引**：REST 总表见 [05-chat-shared §5.10.1](./05-chat-shared.md)；本节为 **我的报告页** 专用契约。  
> **运行环境**：`{APP_ROOT}` 本地磁盘 + 桌面壳（Electron / Tauri 等）；**非**纯浏览器读用户本机路径。

#### 4.1.5a 列表与详情

**`GET /api/reports`**

| Query | 必填 | 说明 |
|-------|------|------|
| `type` | ✅ | `profile` \| `plan` \| `portfolio` \| `fund` |
| `q` | — | **报告名称**子串；**仅** `type=plan` 或 `type=fund` 时生效；忽略大小写 |
| `limit` | — | 默认 **50**；最大 **200** |
| `offset` | — | 默认 **0** |

**排序**：`generated_at DESC`（与 §4.1.1 一致）。

**Response `200`**

```json
{
  "items": [
    {
      "id": "uuid",
      "report_type": "plan",
      "report_name": "子女教育-资产配置方案-20260612",
      "generated_at": "2026-06-12T14:30:52+08:00",
      "file_path": "data/reports/plan/子女教育-资产配置方案-20260612.md",
      "goal_constraint_id": "uuid",
      "is_current": false,
      "badges": []
    }
  ],
  "total": 1
}
```

| 中文含义 | 字段名称 | 字段类型 | 字段说明 |
|----------|----------|----------|----------|
| 是否当前有效 | `is_current` | boolean | 仅 `type=profile` · **RPT-PROFILE-03**：该行满足 **PH-PROFILE-ENC-01**（与 §6.0.1 同一公式）；**非** 单纯 `generated_at` 最新 |
| 列表徽章 | `badges` | string[] | 如 `["scheduled"]` ← `metadata.trigger_source` |

**错误**

| HTTP | code | 何时 |
|------|------|------|
| 400 | `ERR-RPT-TYPE` | `type` 非法 |
| 400 | `ERR-RPT-SEARCH` | `type=profile\|portfolio` 且带 `q` |

---

**`GET /api/reports/:id`**

| Query | 默认 | 说明 |
|-------|------|------|
| `include` | `metadata` | `metadata` \| `none` — 是否带 `metadata` jsonb |
| `body` | `true` | `true` \| `false` — 是否读盘返回 `markdown` |

**Response `200`**

```json
{
  "id": "uuid",
  "report_type": "fund",
  "report_name": "019305-摩根标普500指数(QDII)人民币C-基金解读-20260612",
  "report_slug": "019305-20260612143052",
  "generated_at": "2026-06-12T14:30:52+08:00",
  "file_path": "data/reports/fund/019305-摩根标普500指数(QDII)人民币C-基金解读-20260612.md",
  "fund_code": "019305",
  "markdown": "# …",
  "metadata": { "trigger_source": "manual" },
  "file_exists": true,
  "is_current": false
}
```

| 中文含义 | 字段名称 | 字段类型 | 字段说明 |
|----------|----------|----------|----------|
| 报告正文 | `markdown` | string | `body=true` 时读盘 UTF-8 · Preview 刷新 |
| 文件是否存在 | `file_exists` | boolean | 索引在但磁盘无文件时为 `false` |

**错误**

| HTTP | code | 何时 |
|------|------|------|
| 404 | `ERR-RPT-NOT-FOUND` | `id` 不存在 |

> **刷新**：前端 **不**单独 `POST`；对用户点 **刷新** → 再次 `GET /api/reports/:id?body=true`（可加 `_t=Date.now()` 防缓存）。

#### 4.1.5b 返回对话 · 对话存在性

**不复用** `/api/reports/:id/exists`；用已有对话 API：

| 步骤 | 调用 | 行为 |
|------|------|------|
| 1 | 用户点 **← 返回对话**（URL 含 `?c=`） | 前端 `GET /api/conversations/:c?messages_limit=0` |
| 2a | **200** | 导航 `/?c={c}` |
| 2b | **404** | 展示 §4.1.0c **友好报错**（RPT-NAV-05）；**不** CH-FIRST-01 |

#### 4.1.5c 桌面动作（本地壳 IPC · P0）

> 由 **本地 HTTP 服务** 暴露下列路由；内部调 OS：`explorer` / `shell.openPath` / `notepad` 等。纯 Web 部署无 `{APP_ROOT}` 时 → **`ERR-DESKTOP-UNAVAILABLE`**。

**`POST /api/reports/actions/open-folder`**

| Body | 说明 |
|------|------|
| `{ "report_type": "plan" }` | 打开 `{APP_ROOT}/data/reports/plan/`（四类型见 §4.1.0 表） |

**Response `200`**：`{ "opened_path": "D:\\…\\data\\reports\\plan" }`

---

**`POST /api/reports/:id/actions/open-file`**

| 行为 | 用系统默认程序打开该报告 **md** 绝对路径 |
|------|------------------------------------------|

**Response `200`**：`{ "opened_path": "…md" }`

**错误**

| HTTP | code | 何时 |
|------|------|------|
| 404 | `ERR-RPT-NOT-FOUND` | 无索引行 |
| 409 | `ERR-RPT-FILE-MISSING` | 文件不存在 |
| 501 | `ERR-DESKTOP-UNAVAILABLE` | 非桌面壳 / 无本地盘 |
| 500 | `ERR-DESKTOP-OPEN-FAILED` | OS 打开失败（附 `message`） |

**编码仓 IPC 名（建议 · 与 HTTP 二选一或并存）**

| IPC channel | 等价 HTTP |
|-------------|-----------|
| `reports:open-folder` | `POST …/actions/open-folder` |
| `reports:open-file` | `POST …/:id/actions/open-file` |
| `reports:read-file` | `GET …/:id?body=true` 内读盘逻辑 |

#### 4.1.5d 深链落地（服务端可选 · 前端亦可纯路由）

进入 `/reports?tab=fund&id={uuid}&c=…` 时：

1. `GET /api/reports/:id`  
2. 若 `report_type` ≠ URL `tab` → **以索引为准** 修正 Tab（§4.1.6）  
3. 选中行 · 加载 Preview

---

### 4.1.6 边界态与错误展示（P0）

#### 4.1.6a 空列表

| Tab | 标题 | 正文 |
|-----|------|------|
| 投资需求 | 还没有投资需求报告 | 完成某一投资目标的**需求梳理**并 **确认发布** 报告后，会出现在这里。<br>请先在 **「需求梳理」** Tab 完成约束采集与报告确认发布（§6.2.8 · 模式 B）。 |
| 资产配置方案 | 还没有资产配置方案报告 | 在资产配置场景生成方案并确认发布后，会出现在这里。 |
| 持仓分析 | 还没有持仓分析报告 | 完成一次持仓分析并确认发布，或开启定时持仓分析后，会出现在这里。 |
| 基金解读 | 还没有基金解读报告 | 在基金解读场景生成报告并确认发布，或对自选基金使用「AI 解析」。 |

**基金 Tab 额外**：空态下仍展示 **「解读新报告」** → CH-TAB-01 跳转 `fund` 场景（§4.1.1d）。

#### 4.1.6b 搜索无结果

| 项 | 对客 |
|----|------|
| 文案 | **未找到匹配报告** |
| 行为 | 表格空；**不清**搜索框 |

#### 4.1.6c 深链 / 选中 id 无效

| 条件 | 行为 |
|------|------|
| `id` **不存在**（404） | Toast **「找不到该报告」**；停留当前 Tab；**不**选中行；Preview 空态：「请从左侧选择一份报告」 |
| `id` 存在 · URL `tab` **不一致** | **以 `report_type` 为准** 切换 Tab 并选中；**不** Toast（静默纠正） |
| `id` 存在 · **`file_exists=false`** | 选中行；Preview 区错误卡（§4.1.6d） |

#### 4.1.6d 索引有行 · 磁盘无 md（ERR-RPT-FILE-MISSING）

| 项 | 对客 |
|----|------|
| **标题** | 报告文件不存在 |
| **正文** | 系统里有这条报告记录，但本地文件 **{file_path}** 已缺失或被移动。<br>您可以用「打开文件夹」查看目录，或重新生成报告。 |
| **按钮** | **打开文件夹**（本 Tab）· **复制链接**（仍可用） |
| **禁用** | **编辑** · **刷新**（刷新仍 409） |

#### 4.1.6e Preview 未选行

| 项 | 对客 |
|----|------|
| 文案 | 请从左侧列表选择一份报告，或点击 **查看**。 |

#### 4.1.6f 「全屏查看」入口（RPT-FULLSCREEN-01 · 已定）

| 项 | 规格 |
|----|------|
| **显示** | 内嵌 Preview 工具条 **始终** 展示 **「全屏查看」**（与 **编辑** · **刷新** 同级；未选行时 **禁用**） |
| **行为** | 跳转 `/reports/view?tab=&id=&c=`（§4.1.0c）；全屏页顶栏 **「← 返回列表」** |
| **窄屏强调** | Preview 容器宽度 **&lt; 520px** 时：**「全屏查看」** 使用 **主色 CTA**（§1.1.1 `#0075de` · 实心或描边主按钮）；工具条 **sticky 置顶**，避免被长文滚出视口 |
| **宽屏** | ≥520px 时仍为常规次要按钮样式，**不隐藏** |

#### 4.1.6g 列表加载失败

| 项 | 对客 |
|----|------|
| 文案 | 报告列表加载失败 |
| 操作 | **重试** → 重新 `GET /api/reports` |

---

### 4.1.7 字段规格（Supabase · 报告索引）

> **本模块权威**：`report_index` 及对话内报告草稿索引键。实体关系摘要 → [03-data-architecture §3.3](./03-data-architecture.md)。

#### 4.1.7a `report_index`

| 中文含义 | 字段名称 | 字段类型 | 字段长度 | 是否必填 | 字段校验 | 值的相关说明 |
|----------|----------|----------|----------|----------|----------|--------------|
| 主键 | `id` | uuid PK | uuid | 系统 | — | 深链 `?id=` RPT-LINK-01 |
| 报告类型 | `report_type` | text | 枚举 4 值 | 是 | 决定 FK 组合 | Tab 分类 |
| 业务 slug | `report_slug` | text? UK | ≤32 | 条件（fund） | `{code}-{14位时间}` UNIQUE | fund 业务 ID |
| 报告名称 | `report_name` | text | ≤200 字 | 是 | = md 标题 §4.1.0d | `file_path` |
| 生成时间 | `generated_at` | timestamptz | — | 是 | = slug 时间基准 | 列表排序 |
| 文件路径 | `file_path` | text | 相对路径 | 是 | 文件存在 | 本地 md |
| 扩展元数据 | `metadata` | jsonb? | — | 否 | 键 §4.1.7b | — |
| 客户信息层版本 | `profile_version_id` | uuid? FK | — | 条件（profile/plan） | FK | — |
| 目标约束 | `goal_constraint_id` | uuid? FK | — | 条件（profile/plan） | FK | RPT-PROFILE-01 |
| 约束修订 | `goal_constraint_revision_id` | uuid? FK | — | 条件（**profile**） | FK · `goal_constraint_revisions.id` | 发布时绑 **确认写库快照**（PH-PROFILE-GV-02 · UNDO-02 回滚锚点） |
| 方案版本 | `allocation_plan_id` | uuid? FK | — | 条件（plan） | FK | portfolio 可选 |
| 持仓版本 | `holdings_version_id` | uuid? FK | — | 条件（portfolio） | FK | — |
| 基金代码 | `fund_code` | text? | 6 位 | 条件（fund） | — | 与自选无外键 |

**`report_slug`（fund · RPT-FUND-01）**：`{fund_code}-{YYYYMMDDHHmmss}`，北京时间 14 位；与 `generated_at` 同一 publish 时刻；冲突则顺延重试。

**`report_publish` 写入顺序**：计算 `report_name` / 文件名 →（fund）`report_slug` → 写 md → INSERT `report_index` → 清 `pending_report_draft` · `has_unconfirmed=false` → 归档 run 草稿 →（fund）回写 `last_analysis_at`。

#### 4.1.7b `report_index.metadata`（jsonb · P0）

| 中文含义 | 字段名称 | 字段类型 | 字段长度 | 是否必填 | 字段校验 | 值的相关说明 |
|----------|----------|----------|----------|----------|----------|--------------|
| 触发来源 | `trigger_source` | enum | — | 条件（portfolio） | — | `manual` / `scheduled` |
| 知识库引用快照 | `knowledge_citations` | array | — | 否 | FK-CITE 结构 | fund 报告脚注 |
| 联网引用 | `web_citations` | array? | ≤5 | 否 | CH-18 | fund L3 |
| 报告 archetype | `report_archetype` | `"A"`～`"F"`? | 单字符 | 否 | §9.1.1b | fund 第四章 |
| 绑定投资需求 | `profile_report_id` | uuid? | — | 否 | plan · FK | 规划书 §一 来源报告 id |

#### 4.1.7c `pending_report_draft`（`conversations.metadata` 内）

| 中文含义 | 字段名称 | 字段类型 | 字段长度 | 是否必填 | 字段校验 | 值的相关说明 |
|----------|----------|----------|----------|----------|----------|--------------|
| 报告类型 | `report_type` | string | — | 是 | 四类之一 | — |
| Run 标识 | `run_id` | string | — | 是 | — | `data/runs/…` |
| 报告名称 | `report_name` | string | — | 是 | — | 待发布标题 |
| 基金代码 | `fund_code` | string? | — | 条件（fund） | — | — |
| 数据截止日 | `as_of_trade_date` | date? | — | 否 | — | fund / portfolio |
| 客户信息层版本 | `profile_version_id` | uuid? | — | 条件 | — | profile / plan |
| 目标约束 | `goal_constraint_id` | uuid? | — | 条件 | — | profile / plan |
| 方案版本 | `allocation_plan_id` | uuid? | — | 条件 | — | plan |
| 绑定投资需求 | `profile_report_id` | uuid? | — | 条件（plan） | FK · `report_index.id` | plan §一 深链 · PH-PROFILE-ENC-01 |
| 持仓版本 | `holdings_version_id` | uuid? | — | 条件 | — | portfolio |

#### 4.1.7d `report_overlay`（`conversations.metadata` · 详 §4.1.0h）

字段表见 [§4.1.0h](./04-my-reports.md#410h-报告-only-增量--report_overlayrpt-overlay-01--p0)；落盘 **`report-overlay.json`** 与 metadata **双写**。

---
