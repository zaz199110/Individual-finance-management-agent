# 配置目录（config）

本仓库 **仅存放需求与设计**，不写业务代码。  
此目录集中放**编码新项目**所需的配置模板与你的本地密钥，方便整体拷贝。

## 文件说明

| 文件 | 是否提交 Git | 说明 |
|------|--------------|------|
| `env.template` | ✅ 提交 | 环境变量模板（无真实密钥） |
| `secrets.env` | ❌ 不提交 | 你的真实 Key，仅本机保留 |
| `model-defaults.md` | ✅ 提交 | **本地联调模型栈定稿表**（五槽位默认值 · 勿再口头重复） |

## 新建编码项目时怎么用

1. 新建代码仓库（如 `agent-demo-app`）
2. 将本目录 **`secrets.env` 复制**到新项目根目录，重命名为 `.env.local`
3. 对照 `env.template` 补全 Supabase 的 `URL` / `ANON_KEY` 等占位项
4. 将 `requirement/PRD.md` 与 `design/` 作为需求输入交给 Cursor

```powershell
# 示例：从需求仓拷贝到新编码仓
Copy-Item "D:\CursorProjects\agent-demo\requirement\config\secrets.env" `
          "D:\CursorProjects\agent-demo-app\.env.local"
```

## 安全

- `secrets.env` 已在仓库根 `.gitignore` 排除，**切勿**改名为可提交文件名
- 不要把真实 Key 写进 `PRD.md`、`需求仓/research/*.md` 等会公开的文档
