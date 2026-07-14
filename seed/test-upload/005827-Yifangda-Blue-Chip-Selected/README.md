# 005827 知识库测试包（非自选 · 待手动入库）

> **用途**：供你在「基金知识库」页自行上传或复制入库，验证**非自选基金**也能建库、检索、FK-CITE 深链。  
> **位置**：本目录在 vault **之外**，不会自动进入 `data/fund-knowledge/`。

## 基金信息

| 项 | 值 |
|----|-----|
| 基金代码 | **005827** |
| 基金名称 | 易方达蓝筹精选混合 |
| 是否在自选 | **否**（自选默认仅 019305 / 017704 / 206007） |
| 建议 vault 目录名 | `005827-Yifangda-Blue-Chip-Selected` |

## 本目录绝对路径

```
D:\CursorProjects\agent-demo-coding\seed\test-upload\005827-Yifangda-Blue-Chip-Selected\
```

## 内含文件（3 份 Markdown）

| 相对路径 | 文档类型 | 上传时选择 |
|----------|----------|------------|
| `prospectus/product-summary.md` | 招募说明书 / 产品概要 | 招募说明书 |
| `quarterly_report/2025Q4-quarterly-report.md` | 季报 | 季报 |
| `expert_opinion/active-equity-outlook-2026.md` | 专家观点 | 专家观点 |

内容为演示整理稿，依据公开基金档案风格编写，**非实时官方 PDF**。

---

## 方式 A：页面上传（推荐先试）

1. 打开 **基金知识库** → 点 **上传**
2. 基金代码填 **`005827`**
3. 文档类型选上表对应项，文件选本目录下 `.md`
4. 三份文件分 **3 次上传**（同批须同一类型；不同类型请分批）
5. 上传完成后点 **更新搜索索引**（全局或单基金 005827）

**预期**：左侧源文档树出现 `005827 易方达蓝筹精选混合`，与是否在「我的自选」无关。

---

## 方式 B：整夹复制到 vault

1. 将整个文件夹复制到：

   ```
   D:\CursorProjects\agent-demo-coding\data\fund-knowledge\005827-Yifangda-Blue-Chip-Selected\
   ```

   复制后结构示例：

   ```
   data/fund-knowledge/005827-Yifangda-Blue-Chip-Selected/
   ├── prospectus/product-summary.md
   ├── quarterly_report/2025Q4-quarterly-report.md
   └── expert_opinion/active-equity-outlook-2026.md
   ```

2. 知识库页点 **更新搜索索引** → 范围选「单只基金」→ 填 `005827`

---

## 验收建议

- [ ] 源文档树能看到 005827，且自选列表里**没有** 005827
- [ ] 点开 `product-summary.md`，Preview 正常渲染
- [ ] 「更新搜索索引」后维护日志有记录，块目录非空
- [ ] （可选）对话里问「005827 管理费多少」能触发 explore / 引用知识库
