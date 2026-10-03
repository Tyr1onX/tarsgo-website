# 生产发布与回滚

本文适用于当前 TarsGo 版本。生产环境只使用生产数据库和生产密钥；开发环境的 Docker 数据、mock 用户和测试报名数据不能复制到生产。

## 发布原则

1. 发布前先备份数据库和运行时上传目录。
2. 使用同一版本构建出的 `dist/tarsgo-migrate` 单独执行迁移。
3. 迁移成功并完成校验后，再启动 `dist/tarsgo-backend`。
4. Web 进程设置 `APP_AUTO_MIGRATE=false`，避免多实例同时执行迁移。
5. 保留旧二进制、旧配置、备份文件和校验值，至少覆盖一个完整观察窗口。

当前迁移框架只有向前迁移，没有自动 down migration。迁移 6 会规范化权限数据，迁移 7 新增面试表和最终录取字段。若要精确恢复到迁移前的数据状态，必须从发布前备份恢复，不能只回滚二进制。

## 发布前检查

~~~bash
go -C internal/backend test ./...
npm --prefix internal/frontend run typecheck
make build-linux-amd64
git diff --check
~~~

确认产物包含 `dist/tarsgo-backend-linux-amd64` 和 `dist/tarsgo-migrate-linux-amd64`，并将它们放入不可变版本目录，不要覆盖正在运行的版本。`make build` 生成的是当前构建机架构的二进制，Linux 生产环境应使用 `make build-linux-amd64` 的产物。

## 发布前备份

备份目录应位于独立磁盘或对象存储，并在备份后复制到另一位置。

~~~bash
export DB_HOST='127.0.0.1'
export DB_PORT='3306'
export DB_NAME='tarsgo'
export DB_USER='tarsgo_backup'
export DB_PASSWORD='从密钥管理系统注入'
export BACKUP_DIR='/var/backups/tarsgo'
./scripts/backup-mariadb.sh
~~~

同时备份运行时上传文件（报名附件、组 logo 等）：

~~~bash
tar -C /opt/tarsgo/current -czf /var/backups/tarsgo/uploads-$(date -u +%Y%m%dT%H%M%SZ).tar.gz upload
~~~

验证备份：

~~~bash
sha256sum -c /var/backups/tarsgo/<数据库备份>.sha256
gzip -t /var/backups/tarsgo/<数据库备份>.sql.gz
~~~

正式发布前应至少在临时 MariaDB 实例恢复一次备份，并核对 `users`、`registrations` 和 `schema_migrations`。

## 正式发布顺序

1. 从负载均衡摘除旧实例或进入维护页，等待正在处理的请求完成。
2. 保留旧实例、旧版本目录和旧配置。
3. 新版本生产配置设置 `APP_AUTO_MIGRATE=false`。
4. 只执行一次迁移程序：

  ~~~bash
  APP_ENV=production APP_AUTO_MIGRATE=false ./dist/tarsgo-migrate
  ~~~

Linux amd64 服务器应执行 `./dist/tarsgo-migrate-linux-amd64`。

迁移退出码非 0 时立即停止发布，不启动新 Web 实例，也不要手工写入 `schema_migrations`。

5. 检查迁移版本、`registration_interviews` 表和 `registrations` 最终录取字段。
6. 启动一台新 Web 实例，执行 `curl -fsS http://127.0.0.1:8080/healthz`，再验证登录、用户权限、报名详情、面试结果、最终录取和附件下载。
7. 观察错误日志、5xx、登录失败率和数据库连接数，再逐步恢复流量。

## 回滚

- 只有代码问题且新代码没有写入新字段：停止新实例，切回旧二进制和旧静态资源；新增表和字段可以保留。
- 迁移失败且事务未提交：保持旧版本运行，修复后重新执行迁移。
- 迁移成功后需要恢复权限或业务数据：停止所有 Web 实例，将备份先恢复到隔离数据库校验，再在维护窗口恢复生产库和上传目录。

恢复示例（确认目标库和审批后执行）：

~~~bash
gunzip -c /var/backups/tarsgo/<数据库备份>.sql.gz | mariadb \
  --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --password="$DB_PASSWORD" "$DB_NAME"
tar -C /opt/tarsgo/current -xzf /var/backups/tarsgo/<上传目录备份>.tar.gz
~~~

迁移 6 属于数据迁移，精确回滚必须依靠备份；迁移 7 的旧版本短时可回退，但旧版本不会理解面试记录和最终录取数据。生产必须使用 `APP_ENV=production`、唯一随机的 `JWT_SECRET`（至少 32 位）、`JWT_COOKIE_SECURE=true`，并将 CORS 限制为正式站点域名。
