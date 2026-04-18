# TarsGo

当前仓库按前后端分区：

- `internal/frontend`: React 前端工作区
- `internal/backend`: Go 后端服务

常用命令：

```bash
make frontend
make frontend-check
make backend
make backend-test
make build
```

## Development

启动前端开发服务器：

```bash
make frontend
```

启动本地 MariaDB：

```bash
make db-up
```

该脚本会读取 `internal/backend/.env`，按配置启动本地 MariaDB，并将运行时文件放在 `.runtime/`。

启动后端：

```bash
make backend
```

或同时启动数据库与后端：

```bash
make backend-up
```

构建单二进制：

```bash
make build
```

`make build` 会先构建前端静态资源，再把资源内嵌进后端二进制，最终输出 `dist/tarsgo-backend`。运行该二进制即可同时提供前端页面与后端 API。
