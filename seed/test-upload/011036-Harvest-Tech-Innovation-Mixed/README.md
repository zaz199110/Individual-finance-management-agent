# 011036 知识库测试包（非自选 · 待手动入库）

> **用途**：供你在「基金知识库」页自行上传或复制入库，验证**非自选基金**也能建库、检索、FK-CITE 深链。  
> **位置**：本目录在 vault **之外**，不会自动进入 `data/fund-knowledge/`。

## 基金信息

| 项 | 值 |
|----|-----|
| 基金代码 | **011036** |
| 基金名称 | 嘉实科技创新混合 |
| 是否在自选 | **否**（自选默认仅 019305 / 017704 / 206007） |
| 建议 vault 目录名 | `011036-Harvest-Tech-Innovation-Mixed` |

## 本目录绝对路径

```
D:\CursorProjects\agent-demo-coding\seed\test-upload\011036-Harvest-Tech-Innovation-Mixed\
```

## 内含文件（3 份 Markdown）

| 相对路径 | 文档类型 | 上传时选择 |
|----------|----------|------------|
| `prospectus/product-summary.md` | 招募说明书 / 产品概要 | 招募说明书 |
| `quarterly_report/2025Q4-quarterly-report.md` | 季报 | 季报 |
| `expert_opinion/tech-innovation-outlook-2026.md` | 专家观点 | 专家观点 |

内容为演示整理稿，依据公开基金档案风格编写，**非实时官方 PDF**。

---

## 方式 A：页面上传（推荐先试）

1. 打开 **基金知识库** → 点 **上传**
2. 基金代码填 **`011036`**
3. 文档类型选上表对应项，文件选本目录下 `.md`
4. 三份文件分 **3 次上传**（同批须同一类型；不同类型请分批）
5. 上传完成后点 **更新搜索索引**（全局或单基金 011036）

**预期**：左侧源文档树出现 `011036 嘉实科技创新混合`，与是否在「我的自选」无关。

---

## 方式 B：整夹复制到 vault

1. 将整个文件夹复制到：

   ```
   D:\CursorProjects\agent-demo-coding\data\fund-knowledge\011036-Harvest-Tech-Innovation-Mixed\
   ```

   复制后结构示例：

   ```
   data/fund-knowledge/011036-Harvest-Tech-Innovation-Mixed/
   ├── prospectus/product-summary.md
   ├── quarterly_report/2025Q4-quarterly-report.md
   └── expert_opinion/tech-innovation-outlook-2026.md
   ```

2. 知识库页点 **更新搜索索引** → 范围选「单只基金」→ 填 `011036`

---

## 验收建议

- [ ] 源文档树能看到 011036，且自选列表里**没有** 011036
- [ ] 点开 `product-summary.md`，Preview 正常渲染；管理费显示 **1.50%**
- [ ] 「更新搜索索引」后维护日志有记录，块目录非空
- [ ] （可选）对话里问「011036 管理费多少」能触发 explore / 引用知识库

## 与已有测试包对照

| 代码 | 名称 | 类型 | 测试包位置 |
|------|------|------|------------|
| 019305 | 摩根标普500 QDII | 海外宽基指数 | `seed/fund-knowledge/`（已入库） |
| 017704 | 兴业存单指数 7 天 | 固收指数 | `seed/fund-knowledge/`（已入库） |
| 206007 | 鹏华消费优选 | 主动 · 消费 | 无 vault（故意） |
| 005827 | 易方达蓝筹精选混合 | 主动 · 蓝筹 | `seed/test-upload/005827-...` |
| **011036** | **嘉实科技创新混合** | **主动 · 科技成长** | **本目录 · 待你入库** |
