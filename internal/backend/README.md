# TarsGo Backend

`internal/backend` 现在不再只是初始化骨架，而是已经包含管理员后台 Round 1 所需的完整认证闭环：

- 邮箱验证码注册
- 邮箱密码登录
- 邮箱验证码登录
- JWT HttpOnly Cookie 会话
- `/api/me` 当前会话检查
- 首次运行超级管理员初始化

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `cmd/server/main.go` | Web 服务入口，负责加载配置、连接数据库并启动 Gin；是否自动迁移由 `APP_AUTO_MIGRATE` 控制 |
| `cmd/migrate/main.go` | 独立迁移入口，供生产发布在切换 Web 进程前执行一次 |
| `config/config.go` | 环境变量读取与配置组装，包含数据库、JWT、邮件发信配置 |
| `database/mysql.go` | Gorm MySQL 连接、自动迁移与角色种子数据 |
| `model/*.go` | 核心数据模型：角色、用户、邮箱验证码、报名表、报名信息 |
| `service/email/email.go` | 单一 `SendEmail` 入口，使用服务器环境变量调用 Resend |
| `service/auth/*.go` | 认证业务逻辑：JWT、邮箱密码和验证码 |
| `service/adminuser/*.go` | 后台用户管理业务与仓储 |
| `service/usergroup/*.go` | 用户组管理业务与仓储 |
| `service/registration/*.go` | 报名表、报名提交流程、审核与文件存储 |
| `handler/*.go` | HTTP 适配层，只负责参数绑定、错误翻译与响应输出 |
| `middleware/*.go` | 鉴权中间件与会话校验 |
| `router/router.go` | 路由与 CORS 中间件 |

## 快速启动

1. 进入后端目录：

   ```bash
   cd internal/backend
   ```

2. 检查 `.env`：

   - 当前仓库已经提供可直接运行的本地 `.env`
   - 示例模板在 `.env.example`
   - `.env` 只负责数据库、JWT、CORS 等基础运行参数
   - 邮箱发信配置由超级管理员在后台“系统设置”中维护
   - 分离式前端联调默认端口通常是 `http://127.0.0.1:5173`
   - 若前端开发端口被占用，React Router / Vite 可能自动切到 `http://127.0.0.1:5180`
   - `APP_AUTO_MIGRATE` 默认为 `true`，适合本地开发；生产 Web 进程建议设置为 `false`

3. 启动服务：

   ```bash
   go run ./cmd/server
   ```

4. 验证后端：

   ```bash
   go test ./...
   ```

## 首次初始化

服务启动后不再自动创建测试超级管理员账号。

首次运行且系统中尚不存在 `super_admin` 时：

- 访问前端 `/dashboard` 会进入超级管理员初始化流程
- 前端会先调用 `GET /api/bootstrap/status` 判断是否需要初始化
- 创建首个超级管理员使用 `POST /api/bootstrap/super-admin`
- 初始化完成后会直接进入 `/dashboard/admin`

## 认证接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/bootstrap/status` | 获取系统初始化状态 |
| `POST` | `/api/bootstrap/super-admin` | 首次注册超级管理员 |
| `POST` | `/api/register/email/send-code` | 发送注册验证码 |
| `POST` | `/api/register/email` | 邮箱注册并签发 HttpOnly 服务端会话 Cookie |
| `POST` | `/api/login/email/password` | 邮箱密码登录 |
| `POST` | `/api/login/email/send-code` | 发送登录验证码 |
| `POST` | `/api/login/email/code` | 邮箱验证码登录 |
| `GET` | `/api/me` | 获取当前登录用户 |
| `GET` | `/api/account-sessions` | 获取当前浏览器保存的账号 |
| `POST` | `/api/account-sessions/initialize` | 将当前有效会话纳入浏览器账号列表 |
| `POST` | `/api/account-sessions/switch` | 校验账号槽位并轮换服务端会话 |
| `DELETE` | `/api/account-sessions/:id` | 移除账号并撤销对应会话 |
| `POST` | `/api/account-sessions/logout-all` | 撤销并退出当前浏览器保存的全部账号 |
| `POST` | `/api/logout` | 退出当前账号并保留其他已保存账号 |

新登录使用随机不透明会话值，数据库只保存其 SHA-256 摘要；浏览器只通过 HttpOnly Cookie 持有当前会话和账号列表标识。JWT 仅为兼容部署前尚未过期的旧 Cookie 保留解析逻辑。账号列表最多 5 个槽位，每次切换都会轮换所选会话值；所有账号变更接口要求自定义请求头并校验 Origin。

## 基础接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/healthz` | 健康检查，包含数据库连通性 |

## 招新流程接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/admin/registrations/:id/screening` | 提交 `approve` 或 `reject` 初筛结果 |
| `DELETE` | `/api/admin/registrations/:id/screening` | 在面试前撤销初筛并恢复待初筛 |
| `POST` | `/api/admin/registrations/:id/interview` | 提交 `admit` 或 `reject` 面试结果 |

每条报名只保留一个意向组和一个主业务状态。初筛通过进入待面试；面试通过后直接录取到意向组，面试未通过则流程结束。历史双志愿字段和旧面试表仅用于历史记录兼容，不参与新业务判断。

开发环境会幂等创建关闭状态的“招新流程功能测试”报名表及四条记录，覆盖待初筛、待面试、未通过和已录取。可使用 `reviewer@tarsgo.test` 和开发 mock 统一密码 `TarsGo123!` 登录测试；这些数据不会在生产、测试或预发布环境创建。

## 单二进制部署

在仓库根目录执行：

```bash
make build
```

构建流程会先执行前端构建，再把 `internal/frontend/build/client/` 复制到 `internal/backend/web/frontend/`，最后通过 `go:embed` 生成 `dist/tarsgo-backend`，并同时生成同版本的 `dist/tarsgo-migrate`。运行 Web 二进制后，后端会同时提供：

| 路径 | 行为 |
| --- | --- |
| `/api/*` | 后端 API |
| `/upload/config/group/*` | 运行时上传文件 |
| `/assets/*`、`/media/*`、`/favicon.ico` | 内嵌前端静态资源 |
| `/`、`/login`、`/dashboard/*` | 内嵌前端 SPA fallback |

## 数据库迁移

版本化迁移由 `database.RunMigrations` 执行，迁移版本记录在 `schema_migrations` 表中。`APP_AUTO_MIGRATE=true` 时 Web 服务会在启动阶段运行迁移；生产环境推荐设为 `false`，并在切换新版本前单独运行同一次构建产出的 `tarsgo-migrate`。首个版本负责创建当前业务表和角色种子；开发环境 mock 数据会在每次迁移运行后幂等补齐，但不会覆盖已有记录的审核状态；后续结构变更应新增版本迁移，避免修改历史版本。

推荐的生产发布顺序：

```bash
# 从部署环境导出 DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD 后执行
BACKUP_DIR=./backups ./scripts/backup-mariadb.sh
./dist/tarsgo-migrate
APP_AUTO_MIGRATE=false ./dist/tarsgo-backend
```

迁移程序失败时不得切换 Web 进程。备份文件默认写入 `./backups`，目录权限为 `0700`，同时生成 SHA-256 校验文件。

| 项目 | 说明 |
| --- | --- |
| `roles` | 创建角色表并写入 `super_admin`、`admin`、`user` 三条预置角色 |
| `users` | 创建用户表，支持邮箱密码登录；旧 GitHub 字段仅保留历史数据 |
| `oauth_accounts` | 保留旧第三方账号关联记录，不再提供登录入口或管理 API |
| `email_codes` | 创建邮箱验证码表，区分 `register` / `login` 两类用途 |
| `registration_forms` | 创建报名表配置表，支持 `fields_schema` JSON 字段定义 |
| `registrations` | 创建报名信息表，支持 `form_data` JSON 与姓名/手机号/邮箱冒泡字段 |
| `audit_logs` | 记录管理员写操作、状态码和客户端地址，不保存请求正文或敏感字段 |

## 后端权限矩阵

权限由后端中间件强制执行，前端菜单仅用于导航展示：

| 能力 | `user` | `admin` | `super_admin` |
| --- | --- | --- | --- |
| 我的招新 | ✓ | — | — |
| 招新工作台、当前届候选人处理 | — | ✓ | ✓ |
| 报名表、面试场次、招新组别配置 | — | — | ✓ |
| 账号与权限 | — | — | ✓ |
| 邮件系统设置 | — | — | ✓ |

历史报名按报名表状态归档；当前工作台、候选人处理和预约只使用唯一的 `published` 报名表。面试场次通过报名表 ID 关联届次。关闭报名表不会删除历史记录。
