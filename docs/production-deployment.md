# 生产发布、备份与回滚

生产目录为 `/opt/jijia`。正式发布只能从干净且等于最新 `origin/main` 的工作树执行：

```bash
./scripts/deploy-production.sh
```

脚本在开始构建前读取生产根分区的可用字节数。小于 4 GiB 时立即退出，不构建、不上传、不迁移、不切换 Compose。脚本随后记录当前运行的镜像和 release，作为 previous_stable，并验证 release 文件清单完整、SHA256 正确且镜像 tag 后缀与 release commit.txt 一致；再在开始发布前执行一份完整业务备份。

## 首次异机备份配置

发布脚本首次运行时，会按本机 SSH alias `tencent` 中已保存的主机密钥配置专用备份账号、仅限备份用途的 SSH key 和接收目录。密钥由生产机生成，私钥只保存在生产机；腾讯云保存对应公钥。备份目标为 `/opt/backups/jijia`，目录仅 root 可读。之后无需额外基础设施。

主机密钥未在本机 `~/.ssh/known_hosts` 中固定时，配置会停止；先使用已有可信渠道核实并保存 Tencent 主机密钥，再重试。

## 备份内容与保留

每份 `jijia-full-*.tar.gz` 包含：

- MariaDB logical dump（single transaction、routines、events、triggers）
- `/opt/jijia/data/upload`
- `compose.yaml`、`.env`、`app.env` 配置快照
- 对归档文件计算的 SHA256 校验文件

本地归档和配置使用仅 root 可读权限。备份先在生产机生成、压缩并校验，再通过 SCP 复制到腾讯云；腾讯云重新校验 SHA256。只有本地校验、复制和远端校验全部成功后，才执行生产本地 7 天、腾讯云 30 天保留。失败时保留旧备份，失败的新本地临时归档会清理。

systemd timer 每天 04:00 UTC 运行 `backup-production.service`。正式发布开始前也会立即执行一次备份。

## 发布、健康检查与 retention

根分区空间护栏通过后，脚本构建 Linux amd64 后端和迁移程序，并上传到新的不可变 release 目录。生产机重新检查可用空间，然后：

1. 校验 release 文件和 SHA256。
2. 使用新镜像执行 migration。
3. 更新 Compose 并启动新应用容器。
4. 等待应用容器、MariaDB 容器均为 healthy，且本机 `/healthz` 正常。
5. 只有以上步骤成功后，按显式记录的 tag 和 release 名保留 current 与 `previous_stable`，删除更旧的 TarsGo 镜像和 release。
6. 再核验两个镜像、两个 release、容器健康和 `/healthz`，并报告磁盘和容器状态。

健康检查失败时恢复之前的 Compose 配置并启动 `previous_stable`；不会删除任何旧镜像、release 或备份。Retention 后可用空间若低于 4 GiB，只发出告警并停止额外清理。脚本不运行 Docker 全局 prune，也不清理其他项目或 volume。

当前迁移框架只提供向前迁移。应用回滚不会反向回滚数据库 schema；需要恢复业务数据时，应先将异机备份恢复到隔离数据库验证，再安排生产恢复。

## 真实验证

提交前运行：

前端依赖使用 pnpm 9.15.4，CI 固定使用该版本。

```bash
for file in scripts/*.sh; do bash -n "$file"; done
scripts/test-production-ops.sh
git diff --check
make backend-test
cd internal/frontend
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run test:progress
pnpm run test:workbench
```

`scripts/test-production-ops.sh` 只使用临时目录和 mock 命令，覆盖低磁盘提前退出、current/previous retention、健康检查失败回滚，以及复制或远端 checksum 失败时不执行备份 retention。
