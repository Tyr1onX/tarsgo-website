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

首次启动（macOS/Linux/Windows）：

```bash
cp internal/backend/.env.example internal/backend/.env
# 按需修改数据库、JWT 和 OAuth/SMTP 配置；生产环境必须替换所有示例密钥
make db-up
```

安全提示：仓库文档只保留 OAuth/SMTP 占位符。若旧提交曾包含真实凭据，请先在 GitHub
和邮件服务商控制台撤销并重新生成，再清理远端 Git 历史；不要把新凭据写回仓库。

macOS/Linux 需要 Docker Compose v2、Go 1.25+ 和 Node.js/npm。Windows 可继续使用
`scripts/start-db.ps1`；跨平台脚本分别为 `scripts/start-db.sh` 和 `scripts/start-dev.sh`。

启动前端开发服务器：

```bash
make frontend
```

启动本地 MariaDB：

```bash
make db-up
```

该脚本会读取 `internal/backend/.env` 中的 `DB_PORT`，通过 `database/docker-compose.yml` 启动 MariaDB。

启动后端：

```bash
make backend
```

或同时启动数据库与后端：

```bash
make backend-up
```

重复执行 `make dev` 或 `make backend-up` 时，如果端口由当前项目的旧后端占用，启动脚本会先停止旧进程再启动新版本；如果端口属于其他程序，脚本会保留该进程并提示 PID。

构建单二进制：

```bash
make build
```

`make build` 会先构建前端静态资源，再把资源内嵌进后端二进制，最终输出 `dist/tarsgo-backend`。运行该二进制即可同时提供前端页面与后端 API。
