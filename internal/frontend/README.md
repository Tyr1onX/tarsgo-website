# TarsGo Frontend Workspace

`internal/frontend` 是当前仓库的 React 前端工作区。前端源码、静态资源与构建配置都集中在这里。

## 目录

```text
internal/frontend/
├── app/                    React Router 应用源码
├── public/                 静态资源
├── .env.example            前端无需环境变量，该文件只保留说明
├── package.json            前端脚本与依赖
├── react-router.config.ts  React Router 配置
├── tsconfig.json           TypeScript 配置
├── vite.config.ts          Vite 配置
└── Dockerfile              前端容器构建入口
```

## 开发

在 `internal/frontend` 目录下执行：

```bash
npm install
npm run dev
```

默认开发地址：`http://localhost:5173`

## API 访问

前端不再读取 `.env` 中的 `VITE_API_*` 配置，所有接口固定访问同源 `/api`。

- 开发态：`vite.config.ts` 将 `/api` 代理到 `http://127.0.0.1:8080`
- 生产态：`make build` 会把 `build/client/` 复制到后端 embed 目录并编译进 Go 二进制

## 常用命令

```bash
npm run dev
npm run typecheck
npm run build
npm run preview
```

## 构建产物

- `build/client/`：React Router 静态资源输出，最终会被后端 `go:embed` 内嵌
- `.react-router/`：React Router 类型生成与中间产物
