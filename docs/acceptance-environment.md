# 持久化招新验收环境

本机验收环境与生产完全分离。它使用 Homebrew MariaDB 的独立数据目录和端口，不使用 Docker、生产数据库或 TARS Base / RedPalm 资源。环境文件和数据位于：

```text
~/Library/Application Support/TarsGo/Acceptance/
```

目录权限为当前 macOS 用户专用。数据库文件、测试上传、模拟邮箱和日志都存放在此目录；停止服务、关闭浏览器或结束验收都不会删除数据。

## 地址与固定账号

| 用途 | 地址 / 标识 |
| --- | --- |
| 验收网站 | http://127.0.0.1:8182 |
| 模拟收件箱 | http://127.0.0.1:8126/ |
| 专用数据库 | `127.0.0.1:3317`，数据库 `tarsgo_acceptance` |
| 普通用户 | `test-user@tarsgo.test`，钥匙串项目 `TEST_USER` |
| 管理员 | `test-admin@tarsgo.test`，钥匙串项目 `TEST_ADMIN` |
| 超级管理员 | `test-super-admin@tarsgo.test`，钥匙串项目 `TEST_SUPER_ADMIN` |

三个账号的显示姓名分别带有 `[TEST_USER]`、`[TEST_ADMIN]`、`[TEST_SUPER_ADMIN]` 标记，且使用 `.test` 邮箱域。密码、JWT 密钥、数据库密码和收件箱令牌保存在 macOS 登录钥匙串，服务名为 `com.tarsgo.acceptance`；不保存在仓库或环境文件中。模拟收件箱使用 HTTP Basic 用户 `inbox`，密码是同一钥匙串下的 `mailbox-token` 项目。

## 启动、复用与重置

从仓库根目录运行：

```sh
scripts/acceptance-env.sh up
```

首次启动会构建前端和后端、初始化**专用** MariaDB 数据目录并准备三个固定账号。后续启动会复用原数据库和钥匙串密码。拉取新代码后先运行 `scripts/acceptance-env.sh build`，再运行 `up`。

固定测试届为 `[TEST] Persistent Recruitment Acceptance`，包含开放报名表、带 `[TEST]` 标记的招新组别、两个启用面试场次，以及待初筛、待预约、已预约、已录取和未通过候选人记录。所有测试候选人都使用 `@tarsgo.test` 邮箱。三个固定角色账号和这些候选人身份均保留在专用测试数据库中。

每轮流程结束后，如需把**测试届**和模拟邮件恢复到初始状态：

```sh
scripts/acceptance-env.sh reset-data
```

这会删除专用测试届下的报名、面试场次、验证码、相关验收日志、该届上传文件和模拟邮件，再重新创建测试数据；会保留三个固定角色账号、候选人账号、测试组别、数据库和环境。重置前先结束正在进行的浏览器验收，避免和正在写入的数据竞争。

查询服务状态或停止服务：

```sh
scripts/acceptance-env.sh status
scripts/acceptance-env.sh stop
```

`stop` 只停止本项目的本地网站、模拟邮箱和专用 MariaDB 进程，不清理任何数据。下次 `up` 会继续使用原数据。

## 邮件隔离

验收模式配置固定为 `http://127.0.0.1:8126/emails`。邮件服务只监听回环地址、把邮件写入权限为 `0600` 的本地 JSONL 收件箱，并且只接受 `@tarsgo.test` 收件人；真实邮箱会被拒绝。浏览器邮箱页面对邮件内容进行转义后显示，不执行原始 HTML。

应用的验收配置还固定限制在 `127.0.0.1:8182` 与 `127.0.0.1:3317/tarsgo_acceptance`。配置不符时应用拒绝启动。生产模式拒绝覆盖默认邮件服务地址。验收数据种子只在显式 `APP_ENV=acceptance`、`TARSGO_ACCEPTANCE_SEED=true` 且专用本地数据库匹配时运行。生产不自动创建这些账号；生产角色验收应继续使用受控的一次性方案。

## 后续 AI 使用说明

开始验收前先运行 `scripts/acceptance-env.sh up` 并查看 `status`。直接使用表中三个账号和已准备的 `[TEST]` 届次；无需重新创建账号或测试数据。凭据由启动脚本从 `com.tarsgo.acceptance` 钥匙串项目注入进程，不要打印密码、把密码写入仓库或聊天，也不要将本机 `.test` 地址替换成真实收件人。只有在明确需要重放初始流程时才执行 `reset-data`。本地验收通过不代表生产通过，且此环境不会部署到生产。
