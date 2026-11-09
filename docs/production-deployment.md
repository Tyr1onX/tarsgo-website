# 生产发布、备份与回滚

生产目录为 `/opt/jijia`。**正常发布由 GitHub Actions 自动执行**：PR 合并到 `main` 后，`production-ops.yml` 依次完成代码与隔离 MariaDB 验证、发布 CI 构建产物、通过 SSH 部署生产，并检查容器和 `/healthz`。PR 上只执行检查，不部署。查看状态以 [Actions](https://github.com/Tyr1onX/tarsgo-website/actions) 的实际结果为准，不能把“已合并”当作“已部署”。

需要人工重试时，可在已配置生产 SSH、GitHub CLI 和 Cloudflare CLI 凭据的受控环境，从干净且等于最新 `origin/main` 的工作树运行 `./scripts/deploy-production.sh`；不得在未验证的本地改动上部署。

发布脚本先只读确认当前生产镜像和 release，并记录它们作为新版本的 previous_stable，再读取根分区使用率。低于 85% 时继续；达到或超过 85% 时先执行一次安全清理，清理后仍达到或超过 85% 就退出。整个发布最多执行一次安全清理：如果入口检查未触发清理，而上传 release 和业务备份后达到高水位，就在 Docker build 前用这次清理机会。安全清理仅处理可回收 Docker build cache、超过 30 天保留期的本地备份、APT cache，以及能明确识别为 current 和 previous_stable 之外的 Jijia 镜像与 release；无法明确识别回滚版本时会保留所有 Jijia 镜像和 release。它不会清理 volume、MariaDB 数据、uploads 或其他项目资源。脚本还会验证 current release 文件清单完整、SHA256 正确且镜像 tag 后缀与 release commit.txt 一致；普通发布不触发业务数据备份，仅在显式设置 `DEPLOY_REQUIRE_OFFSITE_BACKUP=1` 时，才在部署前完成本地及腾讯云异机备份与校验。

## 构建产物来源

`production-ops.yml` 在固定的 Ubuntu 24.04 runner 上安装锁定的 Node.js/pnpm 工具链、运行检查并构建 Linux amd64 后端和迁移程序。只有 `main` 的 push 在全部检查成功后，才会把名为 `tarsgo-production-release` 的 Actions artifact 交给独立发布 job；该 job 使用仅限自身的 `GITHUB_TOKEN` `contents:write` 权限，将归档和 `.sha256` 校验文件发布为 `production-artifacts` 预发布版本下的公开资产。归档包含 Dockerfile、两个二进制、完整提交 SHA 和 SHA256 清单。后续成功的 main 构建会替换这两个资产。

`deploy-production.sh` 通过 `gh release download` 获取上述归档和 `.sha256` 文件，核对归档、文件清单及完整提交 SHA；随后使用 SSH/rsync 上传到生产临时目录，由生产机再次验证并原子转正。任一校验不通过均停止部署，不会切换版本。脚本在切换后还使用 Cloudflare CLI 清理公开 HTML 缓存。

GitHub Actions 的 `deploy-production` job **确实持有部署所需的仓库 Secrets**：`PRODUCTION_SSH_PRIVATE_KEY`、`PRODUCTION_SSH_KNOWN_HOSTS`、`PRODUCTION_SSH_TARGET`，以及 Cloudflare 的 API Token 和 Account ID。它们仅供部署 job 使用，不写入 Release 资产。部署 job 使用 Node 安装 Cloudflare CLI；实际发布使用已在 CI 构建的二进制，不会在生产机重新编译 Go 或前端。

人工运行同一脚本还需要 Git、SSH、rsync、`gh`、`cf`、tar、gzip、Perl（含 `Digest::SHA`）及已授权的 CLI 凭据。`DEPLOY_TARGET` 指定生产 SSH 目标；未指定时使用本机 `racknerd` alias。

## 首次异机备份配置

首次启用部署前强制异机备份时，若备份目标尚未配置，脚本会按 SSH alias `tencent` 中已保存的主机密钥配置专用备份账号、专用 SSH key 和接收目录。私钥仅保存在生产机，腾讯云保存公钥；备份目标为 `/opt/backups/jijia`，目录仅 root 可读。普通部署不会因此触发业务备份。

主机密钥未在本机 `~/.ssh/known_hosts` 中固定时，配置会停止；先使用已有可信渠道核实并保存 Tencent 主机密钥，再重试。

## 备份内容与保留

每份 `jijia-full-*.tar.gz` 包含：

- MariaDB logical dump（single transaction、routines、events、triggers）
- `/opt/jijia/data/upload`
- `compose.yaml`、`.env`、`app.env` 配置快照
- 对归档文件计算的 SHA256 校验文件

本地归档和配置使用仅 root 可读权限。备份先在生产机生成、压缩并校验，再通过 SCP 复制到腾讯云；腾讯云重新校验 SHA256。**每周定时异机备份**只有本地校验、复制和远端校验全部成功后，才执行生产本地 30 天、腾讯云 30 天保留。失败时保留旧备份，失败的新本地临时归档会清理。**普通部署默认不执行备份**，由每周异机备份负责常规数据保护。确需部署前备份时，可显式执行 `DEPLOY_REQUIRE_OFFSITE_BACKUP=1 ./scripts/deploy-production.sh`。脚本保留手工 `jijia-backup.sh --local-only` 能力。

systemd timer 每周六 19:00 UTC（北京时间周日 03:00）运行 `backup-production.service`，无参数调用备份脚本，**仍会上传腾讯云并校验**。普通发布跳过备份；当发布包含重大数据库结构调整等高风险操作时，执行 `DEPLOY_REQUIRE_OFFSITE_BACKUP=1 ./scripts/deploy-production.sh`，强制在部署前完成本地与腾讯云异机备份及双端校验。

普通部署不再等待完整备份，避免数据压缩与校验拖慢**普通代码更新**；高风险发布仍需等待双端备份成功。若每周异机备份长期失败，需要及时处理（当前脚本未建立超过 36 小时的独立告警，不能假定有监控）。

## 发布、健康检查与 retention

根分区空间护栏通过后，脚本将已校验的 CI 产物上传到新的不可变 release 目录。Docker build 前，生产机再次确认使用率低于 85%；若唯一一次安全清理已执行后又达到高水位，就中止本次发布。之后：

1. 校验 release 文件和 SHA256。
2. 使用新镜像执行 migration。
3. 更新 Compose 并启动新应用容器。
4. 等待应用容器、MariaDB 容器均为 healthy，且本机 `/healthz` 正常。
5. 只有以上步骤成功后，按显式记录的 tag 和 release 名保留 current 与 `previous_stable`，删除更旧的吉甲镜像和 release。删除旧版吉甲镜像后，沿**该旧镜像事先记录的父级构建链**逐层检查：只尝试删除无标签、无容器引用的父镜像；遇到共享镜像、有标签镜像、引用检查失败或 Docker 拒绝删除时立即停止。不会扫描或清理其他项目的无标签镜像，也不会触碰卷、数据库或 RedPalm。
6. 再核验两个镜像、两个 release、容器健康和 `/healthz`，并报告磁盘、容器状态及 retention 前后可用字节数（实际差值可能受到同期日志写入影响）。

健康检查失败时恢复之前的 Compose 配置并启动 `previous_stable`；不会执行发布成功后的镜像/release retention。Retention 后使用率若达到或超过 85%，只发出告警并停止额外清理。脚本不运行 Docker 全局 prune，也不清理其他项目或 volume。

当前迁移框架只提供向前迁移。应用回滚不会反向回滚数据库 schema；需要恢复业务数据时，应先将异机备份恢复到隔离数据库验证，再安排生产恢复。

## 真实验证

提交前运行：

CI 和本地前端 Make 目标使用 Node.js 22.23.4、pnpm 9.15.4 与同一锁文件。生产发布直接使用 CI 已构建的产物，不执行本机前端或 Go 构建。

```bash
for file in scripts/*.sh; do bash -n "$file"; done
scripts/test-production-ops.sh
git diff --check
make backend-test
make frontend-test
make frontend-check
```

`scripts/test-production-ops.sh` 只使用临时目录和 mock 命令，覆盖公开 CI Release 资产下载与校验、缺失/损坏/提交不匹配时拒绝发布、本机没有构建工具或 `sha256sum` 时仍可部署、85% 高水位清理、current/previous retention、健康检查失败回滚，以及上传中断后的安全重试。CI 负责实际构建并校验 Linux amd64 发布二进制。
