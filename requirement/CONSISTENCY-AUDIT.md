# PRD · HARNESS · CODING 一致性审计

> **审计日期**：2026-06  
> **范围**：`requirement/PRD.md`、`HARNESS.md`、`CODING.md`  
> **原则**：PRD = 已拍板；冲突以 PRD 为准；**附录 D** 为决项索引。

---

## 1. 已消除的冲突（本期已改文档）

| 议题 | 原冲突 | 统一口径 |
|------|--------|----------|
| 向量库 / Rerank | 曾「全不做 pgvector」 | **KB-01** 披露 = 本地 FTS；**KB-02** 语义小库 = **Supabase pgvector**（**仅 FAQ**）；**EMB-FILTER-01** = 层内 embedding 重排（**非**第三方 Rerank 槽位；**设置可关**）；**仍不做** Milvus |
| 基金检索 | 「RAG」与知识库混用 | 基金场景 = **`fund_knowledge_explore`**；规划第二步 = 行情接口（非基金库） |
| PDF 上传 | §5.3 聊天禁 PDF vs 知识库要 PDF | **聊天区**禁 PDF；**知识库管理页**必支持 PDF（FK-PDF-01） |
| 附录 D 定位 | 索引写「待确认」 | **附录 D = 已确认决项**；未定 → `07-mythinking.md` |
| §5.3 节号 | 两个 `5.3.4`（占位符 vs 图片） | 图片链改为 **§5.3.12–§5.3.14** |
| LCC 分期 | HARNESS s12「P1」、s18「P0」 | learn-claude-code 映射 **仅做/不做**（HAR-03） |
| 压缩 UI | HARNESS「P1 会话菜单压缩」 | **本期不做**菜单入口；`compact` Tool 仍可用 |
| 定时时刻 | 「可改」与「P1 仅 09:00」并存 | **默认可改** · 定时持仓分析页编辑弹窗配置时刻，**00:00–23:59**，默认 09:00（SCH-03 · E-05） |
| 模型槽位 | 四类 vs 五类 | **五类**（含文本嵌入 · E-01） |
| 投资需求报告模式 B | profile 草稿是否双栏 | **本期做** profile 模式 B（E-02） |
| 基金知识库 UI | 曾写双栏可编辑 md | **FK-UI-01** Preview 单栏 + 外部编辑；块目录 + 块删除（2026-06-13） |
| KB-02 范围 | 30 FAQ + 5 expert 向量 | **仅 FAQ**；expert 仅 vault + L1 FTS（2026-06-13） |
| Scene Handler | 四场景 vs 五场景 | **五 Handler**（`scene_chat` + 四业务 · E-03） |
| 任务图落盘 | DB vs JSON 文件 | **仅** Supabase `workflow_tasks`（E-04） |
| Propose 确认卡 | payload 在 messages | **ARTIFACT-01**：`propose_artifacts` + 瘦 `confirm_card` |
| 深度推理槽位 | 必填独立 vs 默认同推理 | **默认同推理**（G-01 · E-07） |
| 持仓报告章节 | 指向 mythinking 未定 | **§8.4.1 PORT-01** 七节骨架 |
| s15–17 重复 | PRD 与 HARNESS 双表 | PRD **见 HARNESS §8e**；细节保留 HARNESS |
| 向量库 UI 分组 | 分组 B 整段保留 | 合并为一行「无向量库分组」 |

---

## 2. 三文档对齐表（编码开工口径）

| 主题 | PRD | HARNESS | CODING |
|------|-----|---------|--------|
| 模型槽位 | **五类**（含深度推理、文本嵌入）§2.2.1 | 快慢路由 §12 | 设置页读取 §6 |
| 基金知识库 | §3.5 KB-01/02/03 · CG · FK | explore + semantic + **KB-03 瀑布** | #29–#37 |
| 报告引用 | FK-CITE §3.5.5 | Verify §11 | #35–#36 |
| PDF 转换 | FK-PDF-01 §3.5.3a | — | #37 |
| Mermaid | MERMAID-01 §1.3.3 | Verify + §13 | #31–#32 |
| Run 隔离 | HAR-01 §0.11.8 | §8b | #21、s18 |
| 任务图/后台 | HAR-03 s12/s13 | §8c/§8d | #25–#26 |
| 团队编排 | **不做** §0.11.12 | §8e | s15–17 不做 |

---

## 3. 本期明确不做

汇总见 **附录 D · UX-01**（完整列表以附录 D 为准，此处不重复维护）。

---

## 4. 仍留 mythinking（编码可并行、细表后补）

| 项 | 口径（P-JSONB-01 · E-06） |
|----|---------------------------|
| `profile_versions.basic_info` 等 jsonb **细字段** | 顶层字段与版本化规则以 PRD §6–§7 为准；**全模块 PRD 出齐后**统一查漏；细 schema 编码迭代 |
| §8–§9 Skill/Command **全表** | 要点已在各章；全表对齐 `registry.yaml` 编码期维护 |
| 基金知识库种子 + DEPLOY | 实现任务，非产品决项 |

---

## 5. MERGE 覆盖（2026-06-13）

| 主题 | 唯一详文 | 索引/Hub 只链不抄 |
|------|----------|-------------------|
| DEMO-ABC 三只梯度 | `09-fund.md` §9.0.1 | 03 §3.4.1、watchlist §9.3.5、knowledge §9.2.10、spec §2.2a |
| 报告草稿/发布 | `04-my-reports.md` §4.1.0 | 04 Hub、01 §1.2.5、06–09 各一节 |
| SET-DB-01 阻断 | `02-settings.md` §2.0.2 | 05 Hub 一行、08 前置一句 |
| KB-03 / 表结构 | `03-data-architecture.md` §3.5 | 09 analysis §9.1.2 流程图 + 链 |
| 基金章节骨架 | `09-fund-analysis.md` §9.1.1 | spec 实现映射 |
| Harness 循环 | `HARNESS.md` | `00-overview` §0.11 索引 |

规范全文 → [prd/CONVENTIONS.md](./prd/CONVENTIONS.md) **MERGE 原则**。

---

## 6. 维护

- PRD 变更后：更新本文件 §1、§5；跑 **HARNESS §13**  
- 新决项：写入 **附录 D**，从 mythinking 删除  
- 新冲突：记入 [appendix-e](./prd/appendix-e-conflicts-pending.md)，拍板后迁入 §1

---

## 7. 待确认冲突

**E-01～E-07 已于 2026-06-13 拍板**（见 §1、附录 D）。新冲突 → [appendix-e](./prd/appendix-e-conflicts-pending.md)。
