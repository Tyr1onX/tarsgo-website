# 吉甲大师网站 · TarsGo

本仓库是吉林大学吉甲大师战队的**官方网站与招新管理后台**，也是唯一主开发入口。旧仓库 [`Tyr1onX/TarsGo`](https://github.com/Tyr1onX/TarsGo) 仅保留历史版本，不再用于新功能开发。本仓库由战队成员共同维护，欢迎开发、运营、内容、设计和测试成员参与。

> **第一次参与：** [找一项任务](https://github.com/Tyr1onX/jijia-website/issues) → 确认负责人和完成标准 → 提交反馈或独立分支的 [Pull Request](https://github.com/Tyr1onX/jijia-website/pulls) → 维护者审查。**不需要一开始就接触生产环境。**

## 这个项目做什么

| 部分 | 主要内容 | 代码位置 |
| --- | --- | --- |
| 官方网站 | 战队介绍、展示内容、页面素材 | `internal/frontend/`、`public/` |
| 招新与管理后台 | 报名、初筛、面试预约及后台管理 | `internal/frontend/`、`internal/backend/` |
| 数据与基础设施 | MariaDB、开发脚本、验收与生产维护 | `database/`、`scripts/`、`docs/` |

技术栈：React 19、React Router 7、TypeScript、Tailwind CSS 4；Go 1.25、Gin、GORM；MariaDB 11.4。部分历史代码仍使用 `TarsGo` 名称。**吉甲网站不是 TARS Base（`tarsgo-platform`）**，不要混淆仓库。

## 新成员从哪里开始

**不写代码也能参与。** 先在 [Issues](https://github.com/Tyr1onX/jijia-website/issues) 找一项范围小、验收标准明确的任务，或请负责人分配：

| 参与方向 | 建议的第一个任务 | 需要本地开发环境吗 |
| --- | --- | --- |
| 运营 / 内容 | 核对战队介绍、队史、招新文案，给出具体修改建议 | 不需要 |
| 设计 / 体验 | 记录某个页面的排版或交互问题，附截图和修改建议 | 不需要 |
| 测试 | 按步骤复现问题，写清预期、实际结果和使用环境 | 不需要 |
| 开发 | 修改一处低风险页面、文案或文档，补充相应验证 | 需要 |

新人第一次协作的目标是**完成一个小任务的闭环**，不是独立重构网站。反馈问题时请写清：发生位置、复现步骤、期望行为、实际行为，以及必要的截图；截图和 Issue **不得包含账号、真实报名数据或其他敏感信息**。

## 开发环境（macOS / Linux）

请先联系维护者获取本**私有仓库**的访问权限，配置 GitHub SSH，并安装：

- Git、Make、Docker + Docker Compose v2
- Go **1.25+**
- Node.js **22**、pnpm **9.15.4**（与 CI 使用的版本一致）

在终端执行：

```bash
git clone git@github.com:Tyr1onX/jijia-website.git
cd jijia-website
make env       # 从示例文件创建 internal/backend/.env
make install   # 安装 Go / 前端依赖
make db-up     # 启动本地 MariaDB，默认使用 3307 端口
make backend   # 启动 Go 后端，默认 http://127.0.0.1:8080
```

**另外打开一个终端**，进入仓库根目录后执行：

```bash
make frontend  # 启动前端，一般为 http://localhost:5173
```

前端开发服务器会把 `/api` 与 `/upload` 请求转发到本机 `http://127.0.0.1:8080`。数据库启动状态可用 `docker compose -f database/docker-compose.yml ps` 检查。

也可用 `make dev` 同时启动本地数据库和后端（前端仍需单独启动），用 `make db-down` 停止本地数据库。Windows 的数据库启动脚本为 `scripts/start-db.ps1`；上述完整 Make / Shell 流程主要针对 macOS、Linux。

**本地配置提醒：** `internal/backend/.env` 含本地密码和 JWT 配置，只能用于开发，不得提交到仓库、发送到群聊或直接用于生产。普通开发不需要生产数据库、正式用户账号或邮件服务密钥。

## 如何提交第一次 PR

先在任务或 Issue 中明确：**负责人、修改范围、完成标准、验收人**。每项修改从最新 `main` 创建独立分支：

```bash
git switch main
git pull --ff-only origin main
git switch -c docs/my-first-change  # 根据任务使用 docs/、fix/、feat/ 等命名

# 修改本次任务涉及的文件
git diff --check
git add README.md  # 示例：只提交本次修改的 README；其他任务请调整文件名
git commit -m "docs: improve onboarding notes"
git push -u origin docs/my-first-change
```

随后到 [Pull Requests](https://github.com/Tyr1onX/jijia-website/pulls) 创建 PR，**base 选择本仓库的 `main`**。PR 描述用简洁中文，包括：

```markdown
## 背景
## 修改内容
## 验证
## 结果
## 备注
```

仅记录**实际执行过的**测试或人工验证。等待维护者审查以及 GitHub Actions 结果后再合并；**不要直接向 `main` 提交功能修改**。已 push、已 merge、已部署是三种不同状态。

### 提交前检查

```bash
make backend-test     # Go 后端测试
make frontend-check   # 前端类型检查
```

前端单测在 `internal/frontend/` 内执行：

```bash
cd internal/frontend
pnpm run test:progress
pnpm run test:workbench
```

仅修改文档时，先检查 `git diff --check`、命令和链接；在 PR 中如实说明未运行的测试。CI 会执行后端测试、前端单测、类型检查以及生产运维脚本检查。

## 测试和生产边界

- **默认只在本地验证。** 不用真实报名数据做测试，不在仓库或聊天中发送密码、密钥及个人信息。
- 已配置的独立招新验收环境见 [验收环境说明](docs/acceptance-environment.md)：它依赖维护者 Mac 上的专用数据和钥匙串，**不是每位新人必须先搭建的环境**。
- 生产发布由授权维护者负责。[生产部署与回滚说明](docs/production-deployment.md) 是运维资料，**不是新成员的启动教程**；未经安排不要运行生产部署、数据库迁移或数据重置。
- 缺少权限、不会启动或任务不明确时，优先在对应 Issue 留下可复现的信息，并联系负责人。

## 项目入口

- [Issues：任务与问题](https://github.com/Tyr1onX/jijia-website/issues)
- [Pull Requests：提交与审查](https://github.com/Tyr1onX/jijia-website/pulls)
- [Actions：自动化检查](https://github.com/Tyr1onX/jijia-website/actions)
- [招新验收环境](docs/acceptance-environment.md)
- [生产发布与回滚](docs/production-deployment.md)
