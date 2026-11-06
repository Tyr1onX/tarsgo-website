# 飞书作业批改单人试点

本阶段只允许一名管理员在飞书私聊里批改。网站仍是作业状态、分数与批改历史的唯一数据源；不上传附件到飞书云盘。

## 功能范围

- 模拟卡片：填写 0–100 分、通过/退回、评语，飞书回调只更新模拟卡片，不修改数据库。
- 真实卡片：配置中的网站管理员**手动**指定最新、尚未批改的提交发送私聊卡片，回调调用现有作业评分服务，继续验证组权限并保留批改历史。
- 飞书旧卡片无法重复写入成绩。网站已有的重新评分操作仍可使用。
- 不自动向机器人推送所有新人作业；不开放其他成员；附件仍按原网站登录与权限访问。

## 服务端环境变量

不得将真实值提交至仓库、放入前端或在聊天中发送。

| 环境变量 | 用途 |
| --- | --- |
| `FEISHU_APP_ID` | 企业自建应用 App ID |
| `FEISHU_APP_SECRET` | 企业自建应用 App Secret |
| `FEISHU_VERIFICATION_TOKEN` | 回调 Verification Token |
| `FEISHU_ENCRYPT_KEY` | 回调 Encrypt Key；真实评分必须配置 |
| `FEISHU_TESTER_UNION_ID` | 试点操作者本人飞书 union_id |
| `FEISHU_TESTER_USER_ID` | 同一操作者的网站用户 ID |

前四项中 App ID、Secret、Verification Token 和 union_id 是基础必需项。真实评分还要求网站用户 ID、Encrypt Key 以及有效的管理员组权限。修改服务器环境变量后需要重启服务。

## 飞书管理后台

1. 确认应用已开启机器人能力并拥有 `im:message:send_as_bot` 权限。
2. 「开发配置 → 事件与回调 → 回调配置」使用 HTTPS 开发者服务器，回调 URL 设为 `https://jijiamaster.com/api/integrations/feishu/card-action`。
3. 「加密策略」核对 Verification Token 和 Encrypt Key，填写到网站服务器的私有环境配置。
4. 订阅卡片回调 **`card.action.trigger`**（不是普通消息事件），创建版本并发布，可用范围暂时仅自己。

网站支持 `url_verification` challenge；正式回调有 Token 验证，启用 Encrypt Key 后额外验证签名、5 分钟时间窗并解密。飞书需要在 3 秒内获得响应。

## 手工触发

从已登录的试点管理员账号以同源请求调用：

- `POST /api/admin/integrations/feishu/test-card`：发送模拟卡片。
- `POST /api/admin/integrations/feishu/submissions/{id}/card`：发送真实作业卡片，仅供授权的测试提交使用。

两条接口都经过网站登录、管理员权限、同源和试点用户校验。回调根据飞书身份映射至网站管理员，并复用现有 `assignment.Service`，不能绕过组权限。

## 验收

模拟卡片验证 0、100 分及通过/退回；101、负数、小数、缺失字段必须拒绝；非试点身份、错误 Token、签名、过期回调必须拒绝；真实写分需验证网站批改历史只新增一次以及跨组越权被拒绝。

后端运行 `go test ./...`。在服务器密钥、回调 URL、发布版号配置完成前，不能声称线上卡片评分链路已验证。
