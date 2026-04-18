# TarsGo Frontend Workspace

`internal/frontend` 是当前仓库的 React 前端工作区。前端源码、静态资源、环境变量、构建配置与前端容器文件都集中在这里。

## 目录

```text
internal/frontend/
├── app/                    React Router 应用源码
├── public/                 静态资源
├── .env                    前端本地环境变量
├── .env.example            前端环境变量模板
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

## 环境变量

前端 API 基地址统一通过环境变量配置：

```bash
VITE_API_BASE_URL=http://localhost:8080
```

## 常用命令

```bash
npm run dev
npm run typecheck
npm run build
npm run start
```

## 构建产物

- `build/`：React Router 构建输出
- `.react-router/`：React Router 类型生成与中间产物
