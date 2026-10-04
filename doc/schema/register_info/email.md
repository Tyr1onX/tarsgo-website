# 邮箱发信相关信息

所有业务邮件统一通过 `internal/backend/service/email/email.go` 的 `SendEmail` 入口发送。

- 当前发信使用 Resend，生产服务器通过 `RESEND_API_KEY` 提供凭据。
- `EMAIL_FROM` 默认值为 `吉甲大师 <noreply@jijiamaster.com>`。
- API Key 仅存放在服务器私有环境文件，不提交到 Git，不传给前端。
- `contact@jijiamaster.com` 使用 Cloudflare Email Routing 转发收信。
- 服务商额度由服务商处理；更换发信服务只需修改发送实现和相关环境变量。
