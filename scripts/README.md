# 脚本目录

直接执行时以仓库根目录为工作目录；日常操作优先使用根目录 `Makefile` 的命令。

| 位置 | 用途 |
| --- | --- |
| `start-dev.*`、`start-db.*` | 本地前后端和 MariaDB 启动 |
| `deploy-production*.sh`、`production-safe-cleanup.sh`、`production.Dockerfile` | 生产发布与回滚 |
| `backup-*.sh`、`backup-production.service/.timer`、`accept-production-backup.sh`、`setup-production-backup-destination.sh` | 备份与异机恢复相关配置 |
| `acceptance-env.sh`、`check-secrets.sh` | 验收环境和凭据检查 |
| [`tests/`](tests/) | 本地、CI 的数据库与发布安全测试 |
| [`assets/`](assets/) | 仅在素材更新时手动执行的图片生成脚本 |

生产部署入口仍是 `scripts/deploy-production.sh`。
