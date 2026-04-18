# TarsGo Backend

`internal/backend` 现在不再只是初始化骨架，而是已经包含管理员后台 Round 1 所需的完整认证闭环：

- 邮箱验证码注册
- 邮箱密码登录
- 邮箱验证码登录
- GitHub OAuth 登录
- JWT HttpOnly Cookie 会话
- `/api/me` 当前会话检查
- 首次运行超级管理员初始化

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `cmd/server/main.go` | 服务入口，负责加载配置、连接数据库、自动迁移并启动 Gin |
| `config/config.go` | 环境变量读取与配置组装，包含数据库、JWT、SMTP、GitHub OAuth 配置 |
| `database/mysql.go` | Gorm MySQL 连接、自动迁移与角色种子数据 |
| `model/*.go` | 核心数据模型：角色、用户、邮箱验证码、报名表、报名信息 |
| `service/auth/*.go` | 认证业务逻辑：JWT、验证码、SMTP 发信、GitHub OAuth |
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
   - 认证依赖的 JWT / SMTP / GitHub OAuth 配置都已补齐
   - 前端联调默认端口通常是 `http://127.0.0.1:5173`
   - 若前端开发端口被占用，React Router / Vite 可能自动切到 `http://127.0.0.1:5180`
   - 当前 `.env.example` 已默认放行 `5173` 与 `5180` 两组本地域名，`APP_FRONTEND_URL` 需要和你实际打开的前端地址保持一致

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
| `POST` | `/api/register/email` | 邮箱注册并签发 JWT Cookie |
| `POST` | `/api/login/email/password` | 邮箱密码登录 |
| `POST` | `/api/login/email/send-code` | 发送登录验证码 |
| `POST` | `/api/login/email/code` | 邮箱验证码登录 |
| `GET` | `/api/login/github` | GitHub OAuth 登录入口 |
| `GET` | `/api/register/github/oauth/callback` | GitHub OAuth 回调 |
| `GET` | `/api/me` | 获取当前登录用户 |
| `POST` | `/api/logout` | 清除 JWT Cookie |

## 基础接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/healthz` | 健康检查，包含数据库连通性 |

## 自动迁移

服务启动后会自动执行 `AutoMigrate`，当前会完成以下初始化：

| 项目 | 说明 |
| --- | --- |
| `roles` | 创建角色表并写入 `super_admin`、`admin`、`user` 三条预置角色 |
| `users` | 创建用户表，支持邮箱密码登录与 GitHub OAuth 字段 |
| `email_codes` | 创建邮箱验证码表，区分 `register` / `login` 两类用途 |
| `registration_forms` | 创建报名表配置表，支持 `fields_schema` JSON 字段定义 |
| `registrations` | 创建报名信息表，支持 `form_data` JSON 与姓名/手机号/邮箱冒泡字段 |
