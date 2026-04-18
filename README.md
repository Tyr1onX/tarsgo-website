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
