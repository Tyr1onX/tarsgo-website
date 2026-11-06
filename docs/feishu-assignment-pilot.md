# 飞书作业评分单人试点

网站仍是作业成绩与批改历史的唯一数据源；试点只向指定飞书 union_id 发送卡片。

## 流程

1. 网站试点管理员发送模拟卡片或指定待批改作业卡片。
2. 飞书将卡片操作以 HTTP POST 发送到 `/api/integrations/feishu/card-action`。
3. 网站解析 JSON；配置了 Encrypt Key 时先按飞书格式解密。
4. 模拟卡片只更新飞书展示，不写数据库；真实卡片调用原有 `assignment.Service.ReviewFirst` 保存成绩。

回调不校验签名、时间戳、Verification Token、App ID 或飞书操作者身份，也不要求真实评分必须加密。保留 JSON 解码、输入格式检查，以及评分服务已有的提交状态和组权限逻辑。

**风险：这是公开且不鉴权的回调接口。** 任意能够构造有效明文请求的人都可能冒用配置的网站管理员提交真实评分；在加密开启时，构造可解密的请求通常还需要对应密钥。仅限风险已被明确接受的试点使用，不应作为常规生产安全方案。评分服务的角色检查无法替代回调来源认证。

## 环境配置

- `FEISHU_APP_ID`、`FEISHU_APP_SECRET`：机器人发送卡片
- `FEISHU_TESTER_UNION_ID`：指定飞书卡片收件人
- `FEISHU_TESTER_USER_ID`：网站评分身份
- `FEISHU_ENCRYPT_KEY`：可选；仅用于解析飞书加密请求，需与飞书后台实际设置一致

不要在仓库、日志或聊天中公开密钥。

## 飞书后台

- 开启机器人发送消息权限。
- 使用回调 URL `https://jijiamaster.com/api/integrations/feishu/card-action`。
- 订阅 `card.action.trigger`，发布应用版本；需与服务器的加密设置一致。
- 飞书必须在规定时间内收到 HTTP 200 回调响应。

## 手工发送

已登录的指定网站管理员调用：

- `POST /api/admin/integrations/feishu/test-card`：模拟卡片，不修改真实成绩。
- `POST /api/admin/integrations/feishu/submissions/{id}/card`：真实提交的批改卡片。

这两个**发送**接口仍经过网站登录和管理员鉴权；**回调接收**接口不鉴权。

## 验收

先用试点账号模拟评分（0 分、100 分、通过、退回）验证回调成功与卡片更新。真实评分仅使用专门的测试作业，不修改已有成员的真实成绩。完成现场联调前不得声称端到端通过。
