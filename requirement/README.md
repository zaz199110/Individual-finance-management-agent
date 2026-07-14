# 需求文档目录

本仓库 **只写需求，不写代码**。实现见 [CODING.md](./CODING.md)。

| 路径 | 说明 |
|------|------|
| [PRD.md](./PRD.md) | **唯一索引**（模块清单 + 阅读顺序） |
| [prd/CONVENTIONS.md](./prd/CONVENTIONS.md) | 撰写规范（一处详文、Hub 不重复） |
| [prd/GLOSSARY.md](./prd/GLOSSARY.md) | 专有名词 |
| [prd/](./prd/) | 模块化 PRD（00–09 + 附录） |
| [HARNESS.md](./HARNESS.md) | Agent 循环；改 PRD 须对照 §13 |
| [CODING.md](./CODING.md) | 编码仓约束 |
| [../需求仓/docs/CODING-BOOTSTRAP.md](../需求仓/docs/CODING-BOOTSTRAP.md) | **编码启动包**：复制清单、PRD、前置资产、外部参考 |
| [config/](./config/) | 环境变量、模型默认值 |

**协作**：已定 → `prd/` + 附录 D；未定 → `需求仓/research/07-mythinking.md`（拍板后迁入模块并删除）。每次只深改 **一个** 模块文件，遵守 [CONVENTIONS](./prd/CONVENTIONS.md)。
