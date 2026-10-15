# API列表
important：
 - API格式为 {请求类型} {请求地址} {API描述} {测试用账号密码（可选）}
 -示例： GET http://127.0.0.1:3000 测试API 账号：123 密码：123

## 门户主页

GET http://127.0.0.1:8080/api/portal/home 获取当前用户可见的主页聚合数据
 - 需要登录并携带 HttpOnly JWT Cookie
 - 公告仅返回已发布、已生效、未失效且对当前用户可见的内容；超级管理员可看到所有目标组公告；置顶优先，最多 3 条
 - 阶段 1 中 `events` 与 `links` 稳定返回空数组
 - 成功响应：`{ "code": 200, "message": "获取主页数据成功", "data": { "announcements": [], "events": [], "links": [], "generatedAt": "2026-09-15T16:00:00+08:00" } }`

### 门户公告管理

说明：`super_admin` 与全局管理员可访问全部内容；启用管理组中的组长或组内管理员，仅能访问、维护目标组属于其唯一管理组的公告。删除为软删除；组内管理账号不能创建全员可见或跨组公告。

GET http://127.0.0.1:8080/api/admin/portal-groups 获取当前组长负责的启用用户组
 - `super_admin` 不使用此接口，继续使用用户分组接口获取全部用户组

GET http://127.0.0.1:8080/api/admin/announcements 获取公告分页列表
 - 查询参数：`status=draft|published|archived`、`page`、`pageSize`（最大 100）

POST http://127.0.0.1:8080/api/admin/announcements 创建公告
GET http://127.0.0.1:8080/api/admin/announcements/:id 获取公告详情
PATCH http://127.0.0.1:8080/api/admin/announcements/:id 更新公告
DELETE http://127.0.0.1:8080/api/admin/announcements/:id 软删除公告
 - 创建和更新字段：`title`、`summary`、`content`、`category`、`status`、`isPinned`、`publishAt`、`expireAt`、`audienceType`、`targetGroupIds`
 - `category`：`competition|training|team|system`
 - `status`：`draft|published|archived`
 - `audienceType`：`all|groups`；使用 `groups` 时至少提供一个有效启用用户组
 - `publishAt`、`expireAt` 使用 RFC3339；两者同时存在时失效时间必须晚于发布时间

### 门户日程管理

说明：`super_admin` 与全局管理员可访问全部内容；启用管理组中的组长或组内管理员，仅能访问、维护目标组属于其唯一管理组的日程。删除为软删除；组内管理账号不能创建全员可见或跨组日程。

GET http://127.0.0.1:8080/api/admin/portal-events 获取日程分页列表
POST http://127.0.0.1:8080/api/admin/portal-events 创建日程
GET http://127.0.0.1:8080/api/admin/portal-events/:id 获取日程详情
PATCH http://127.0.0.1:8080/api/admin/portal-events/:id 更新、发布或取消日程
DELETE http://127.0.0.1:8080/api/admin/portal-events/:id 软删除日程
 - 列表查询参数：`status=draft|published|cancelled`、`page`、`pageSize`
 - 创建和更新字段：`title`、`description`、`location`、`startsAt`、`endsAt`、`status`、`audienceType`、`targetGroupIds`
 - `startsAt`、`endsAt` 使用 RFC3339，且结束时间必须晚于开始时间
 - `GET /api/portal/home` 的 `events` 返回与北京时间本周有交集、已发布且当前用户可见的日程，按开始时间升序；超级管理员可看到所有目标组日程

### 门户快捷链接管理

说明：`super_admin` 与全局管理员可访问全部内容；启用管理组中的组长或组内管理员，仅能访问、维护目标组属于其唯一管理组的快捷链接。删除为软删除；组内管理账号不能创建全员可见或跨组链接。

GET http://127.0.0.1:8080/api/admin/portal-links 获取可管理范围内的快捷链接（超级管理员为全部，组长为负责组）
POST http://127.0.0.1:8080/api/admin/portal-links 创建快捷链接
GET http://127.0.0.1:8080/api/admin/portal-links/:id 获取快捷链接详情
PATCH http://127.0.0.1:8080/api/admin/portal-links/:id 更新、排序或启停快捷链接
DELETE http://127.0.0.1:8080/api/admin/portal-links/:id 软删除快捷链接
 - 字段：`name`、`url`、`iconKey`、`sortOrder`、`isEnabled`、`openInNewWindow`、`audienceType`、`targetGroupIds`
 - `url` 仅允许单 `/` 开头的站内路径或具有有效主机的 `https://` 外链
 - `iconKey` 仅允许 `book|folder|home|external|link`
 - 系统纳新路径 `/dashboard/users/registrations` 不能配置为数据库快捷链接
 - `GET /api/portal/home` 的 `links` 仅返回启用且当前用户可见的链接，按 `sortOrder`、`id` 升序

### 管理员数据面板

GET http://127.0.0.1:8080/api/admin/dashboard 获取管理员数据面板聚合数据
 - `admin` 与 `super_admin` 可访问，普通用户返回 `403`
 - 返回字段：`totalUsers`、`newUsersThisMonth`、`pendingRegistrations`、`activeTechnicalGroups`、`groupDistribution`、`recentActivities`、`generatedAt`
 - 本月新增按 `Asia/Shanghai` 当前自然月计算
 - 组别分布按唯一所属组统计；多启用组异常用户不重复计入任何具体组，未分组用户不计入组别分布
 - 最近动态最多 10 条，按发生时间倒序，只返回 `actionKey`、操作者显示名、安全可读文案、可选组名和发生时间，不返回内部元数据或审计 IP
 - 响应包含 `Cache-Control: no-store`；前端每 30 秒自动请求一次，并在窗口重新聚焦时立即同步

## 登录/注册

说明：
 - 身份验证采用 JWT Token，通过 HttpOnly Cookie 下发
 - 所有响应格式统一为 `{ "code": int, "message": string, "data": object }`
 - 后端地址：`http://127.0.0.1:8080`
 - 前端开发地址默认是 `http://127.0.0.1:5173`，若端口冲突可能自动切到 `http://127.0.0.1:5180`
 - 首次运行且系统中不存在 `super_admin` 账号时，前端应先访问 `/dashboard` 进入超级管理员初始化流程

### 初始化状态

GET http://127.0.0.1:8080/api/bootstrap/status 获取系统初始化状态
 - 用途：前端进入 `/dashboard` 前判断是否需要先创建首个超级管理员
 - 成功响应（未初始化）：
   ```json
   {
     "code": 200,
     "message": "获取初始化状态成功",
     "data": {
       "setupRequired": true
     }
   }
   ```
 - 成功响应（已初始化）：
   ```json
   {
     "code": 200,
     "message": "获取初始化状态成功",
     "data": {
       "setupRequired": false
     }
   }
   ```

POST http://127.0.0.1:8080/api/bootstrap/super-admin 首次注册超级管理员
 - 说明：
   - 仅在系统尚未初始化时可调用
   - 注册成功后通过 Set-Cookie 下发 JWT，并直接进入后台
   - 首个超级管理员不会自动加入默认用户组
 - 请求体：
   ```json
   {
     "email": "root@example.com",
     "password": "Password123",
     "confirmPassword": "Password123"
   }
   ```
 - 成功响应：
   ```json
   {
     "code": 200,
     "message": "超级管理员注册成功",
     "data": {
       "user": {
         "id": 1,
         "email": "root@example.com",
         "role": {
           "id": 1,
           "name": "super_admin",
           "displayName": "超级管理员"
         }
       }
     }
   }
   ```
 - 失败响应（两次密码不一致）：
   ```json
   { "code": 400, "message": "两次输入的密码不一致", "data": null }
   ```
 - 失败响应（系统已初始化）：
   ```json
   { "code": 409, "message": "系统已初始化，请直接登录", "data": null }
   ```

### 邮箱注册

POST http://127.0.0.1:8080/api/register/email/send-code 发送注册邮箱验证码
 - 限流：同一邮箱 60 秒内只能发送一次
 - 验证码：6 位数字，有效期 10 分钟
 - 请求体：
   ```json
   { "email": "user@example.com" }
   ```
 - 成功响应：
   ```json
   { "code": 200, "message": "验证码已发送", "data": null }
   ```
 - 失败响应（限流）：
   ```json
   { "code": 429, "message": "请求过于频繁，请60秒后重试", "data": null }
   ```
 - 失败响应（邮箱已注册）：
   ```json
   { "code": 409, "message": "该邮箱已注册", "data": null }
   ```
 - 失败响应（系统未初始化）：
   ```json
   { "code": 409, "message": "系统尚未初始化，请先完成超级管理员注册", "data": null }
   ```

POST http://127.0.0.1:8080/api/register/email 邮箱注册
 - 说明：
   - 注册成功后账号保持未分组；不创建或更新用户组成员关系
 - 请求体：
   ```json
   {
     "email": "user@example.com",
     "password": "yourpassword",
     "phone": "13800138000",
     "code": "123456"
   }
   ```
 - 成功响应（同时通过 Set-Cookie 下发 JWT）：
   ```json
   {
     "code": 200,
     "message": "注册成功",
     "data": {
       "user": {
         "id": 1,
         "email": "user@example.com",
         "phone": "13800138000"
       }
     }
   }
   ```
 - 失败响应（验证码错误/过期）：
   ```json
   { "code": 400, "message": "验证码错误或已过期", "data": null }
   ```
 - 失败响应（系统未初始化）：
   ```json
   { "code": 409, "message": "系统尚未初始化，请先完成超级管理员注册", "data": null }
   ```

### 邮箱登录（密码方式）

POST http://127.0.0.1:8080/api/login/email/password 邮箱密码登录
 - 请求体：
   ```json
   {
     "email": "user@example.com",
     "password": "yourpassword"
   }
   ```
 - 成功响应（同时通过 Set-Cookie 下发 JWT）：
   ```json
   {
     "code": 200,
     "message": "登录成功",
     "data": {
       "user": {
         "id": 1,
         "email": "user@example.com",
         "phone": "13800138000"
       }
     }
   }
   ```
 - 失败响应：
   ```json
   { "code": 401, "message": "邮箱或密码错误", "data": null }
   ```
 - 失败响应（系统未初始化）：
   ```json
   { "code": 409, "message": "系统尚未初始化，请先完成超级管理员注册", "data": null }
   ```

### 邮箱登录（验证码方式）

POST http://127.0.0.1:8080/api/login/email/send-code 发送登录邮箱验证码
 - 限流：同一邮箱 60 秒内只能发送一次
 - 验证码：6 位数字，有效期 10 分钟
 - 请求体：
   ```json
   { "email": "user@example.com" }
   ```
 - 成功响应：
   ```json
   { "code": 200, "message": "验证码已发送", "data": null }
   ```
 - 失败响应（邮箱未注册）：
   ```json
   { "code": 404, "message": "该邮箱未注册", "data": null }
   ```
 - 失败响应（系统未初始化）：
   ```json
   { "code": 409, "message": "系统尚未初始化，请先完成超级管理员注册", "data": null }
   ```

POST http://127.0.0.1:8080/api/login/email/code 邮箱验证码登录
 - 请求体：
   ```json
   {
     "email": "user@example.com",
     "code": "123456"
   }
   ```
 - 成功响应（同时通过 Set-Cookie 下发 JWT）：
   ```json
   {
     "code": 200,
     "message": "登录成功",
     "data": {
       "user": {
         "id": 1,
         "email": "user@example.com",
         "phone": "13800138000"
       }
     }
   }
   ```
 - 失败响应：
   ```json
   { "code": 400, "message": "验证码错误或已过期", "data": null }
   ```
 - 失败响应（系统未初始化）：
   ```json
   { "code": 409, "message": "系统尚未初始化，请先完成超级管理员注册", "data": null }
   ```

### GitHub 三方登录

GET http://127.0.0.1:8080/api/login/github GitHub 登录入口
 - 前端跳转到此地址，后端 302 重定向到 GitHub OAuth 授权页面
 - 若系统尚未初始化，则直接 302 重定向到前端初始化页 `/dashboard/setup/super-admin`
 - GitHub 授权完成后回调到后端回调地址

GET http://127.0.0.1:8080/api/register/github/oauth/callback GitHub OAuth 回调
 - GitHub 授权成功后回调此地址，携带 code 参数
 - 若系统尚未初始化，则直接 302 重定向到前端初始化页 `/dashboard/setup/super-admin`
 - 后端用 code 换取 access_token，获取 GitHub 用户信息
 - 如果该 GitHub 账号未绑定本站账户，自动创建新账户
 - GitHub 首次登录创建的新账号保持未分组
 - 成功后通过 Set-Cookie 下发 JWT，然后 302 重定向到前端统一工作台 `/dashboard`

### 当前会话

GET http://127.0.0.1:8080/api/me 获取当前登录用户
 - 需要携带登录成功后下发的 JWT Cookie
 - 成功响应：
   ```json
   {
     "code": 200,
     "message": "获取当前用户成功",
     "data": {
      "user": {
        "id": 1,
        "email": "root@example.com",
        "phone": null,
        "role": {
          "id": 1,
          "name": "super_admin",
          "displayName": "超级管理员"
        },
        "portal": {
          "showRecruitmentEntry": false
        }
      }
    }
  }
  ```
 - 字段说明：
   - 纳新报名入口和报名资格由报名表状态决定，不依赖用户所属组别；用户选择的报名意向组只保存在对应报名记录中
   - `adminScope`：身份管理范围，取值为 `none|group|global`；超级管理员固定为 `global`
   - `managementGroupId`：组内管理员负责的唯一用户组；非组内管理员为 `null`
   - `groupRole`：管理组内角色，取值为 `member|group_admin|leader`；超级管理员为空字符串
   - `permissions`、`capabilities`：后端根据系统角色、管理范围、管理组状态和组内角色实时计算的功能权限；前端只能据此控制入口，写接口仍由后端再次鉴权
 - 失败响应：
   ```json
   { "code": 401, "message": "未登录", "data": null }
   ```

### 登出

POST http://127.0.0.1:8080/api/logout 登出
 - 清除 JWT Cookie
 - 成功响应：
   ```json
   { "code": 200, "message": "登出成功", "data": null }
   ```

## 管理员后台API列表

### 用户数据

说明：
 - 需要管理员登录后携带 JWT Cookie 访问
 - 响应格式统一为 `{ "code": int, "message": string, "data": object | null }`
 - `super_admin` 可查看全部人员并管理 `admin` 与 `user`；超级管理员自身账号只读
 - `adminScope=global` 的全局管理员可查看全部人员，编辑普通用户资料和状态、编辑管理员资料，但不能修改管理员状态、角色或管理范围，也不能重置密码
 - 组长可查看本组人员并编辑普通成员或组内管理员资料，但不能修改账号状态、登录邮箱、系统角色或管理范围
 - 组内管理员可查看本组人员，但不能编辑资料或管理成员
 - 所有 `super_admin` 账号只允许查看，不允许修改、停用或重置密码

GET http://127.0.0.1:8080/api/admin/users 获取用户分页列表
 - 用途：加载 `/dashboard/admin/users` 列表、统计卡和分页信息
 - 查询参数：
- `page`：页码，默认 `1`
- `pageSize`：每页条数，默认 `10`，最大 `100`
- `keyword`：模糊匹配 `name / email / phone / real_name / nickname`
- `role`：人员身份筛选，支持 `member`、`group_admin`、`leader`、`global`（兼容 `global_admin`）和 `super_admin`
- `groupId`：按所属用户组筛选，传入用户组 ID
- `status`：账号状态，`1=启用`、`0=停用`
- `groupState`：用户有效组别状态筛选，支持 `assigned`、`unassigned`、`pending`；`cleanup` 筛选尚有停用组关系待清理的历史账号
- 排序：默认 `created_at DESC`
- 用户组字段：`groupState` 为 `assigned|unassigned|pending`；`groupName` 在唯一有效组别时返回；`groups` 返回完整历史关系 `{ groupId, name, status, role }`；`cleanupPending=true` 表示有多条记录但有效组不足两个，需清理停用组关系
- 统计口径：`total` 按唯一账号数；`enabled`、`disabled` 按账号状态；`grouped`、`unassigned`、`pending` 按启用组关系数分别统计；`cleanupPending` 单独统计停用关系清理人数；`groupDistribution` 仅统计恰好属于一个启用组的唯一用户，多启用组用户不计入任何单组分布
- `adminScope` / `managementGroupId`：该账号的管理范围和唯一管理组
 - 成功响应示例：
   ```json
   {
     "code": 200,
     "message": "获取用户列表成功",
     "data": {
       "items": [
         {
           "id": 3,
           "name": "Member",
           "email": "member@example.com",
           "phone": "13800138000",
           "role": {
             "id": 3,
             "name": "user",
             "displayName": "普通用户"
           },
           "groups": [
            {
              "groupId": 11,
              "name": "机械组",
              "status": 1,
              "role": 0
            }
           ],
           "status": 1,
           "authMethods": {
             "hasPassword": true,
             "githubBound": true
           },
           "lastLoginAt": "2026-04-12T10:30:00+08:00",
           "createdAt": "2026-04-10T09:00:00+08:00"
         }
       ],
       "summary": {
         "total": 12,
         "enabled": 10,
         "disabled": 2,
         "admins": 3,
        "grouped": 7,
        "unassigned": 3,
        "pending": 0,
        "cleanupPending": 0,
        "groupDistribution": [{ "groupId": 11, "name": "机械组", "userCount": 7 }]
       },
       "pagination": {
         "page": 1,
         "pageSize": 10,
         "total": 12,
         "totalPages": 2
       }
     }
   }
   ```

GET http://127.0.0.1:8080/api/admin/users/:id 获取用户详情
 - 用途：加载用户详情抽屉
 - 路径参数：`id` 为用户 ID
 - 详情新增字段：
   - `groups`：展示当前和历史组关系 `{ groupId, name, role, status }`；`role=0/1/2` 分别表示普通成员、组内管理员、组长
   - `groupState`：`assigned|unassigned|pending`；`cleanupPending` 表示还存在需要管理员清理的停用组关系
 - 成功响应示例：
   ```json
   {
     "code": 200,
     "message": "获取用户详情成功",
     "data": {
       "id": 3,
       "name": "Member",
       "email": "member@example.com",
       "nickname": "member",
       "avatarUrl": "https://example.com/avatar.png",
       "phone": "13800138000",
       "realName": "张三",
       "gender": 1,
       "birthday": "1999-03-12",
       "status": 1,
       "githubUsername": "member-gh",
       "role": {
         "id": 3,
         "name": "user",
         "displayName": "普通用户"
       },
       "groups": [
         { "groupId": 11, "name": "机械组", "role": 0, "status": 1 }
       ],
       "authMethods": {
         "hasPassword": true,
         "githubBound": true
       },
       "lastLoginAt": "2026-04-12T10:30:00+08:00",
       "createdAt": "2026-04-10T09:00:00+08:00",
       "updatedAt": "2026-04-12T11:15:00+08:00"
     }
   }
   ```

GET http://127.0.0.1:8080/api/user-group/confirmation 获取当前账号的组别确认状态
 - 鉴权：需要登录
 - 返回状态：`unassigned` 未分组、`assigned` 唯一启用组、`pending` 存在多个启用组
 - `groups` 只返回账号当前已拥有的启用组；普通账号不能提交其他组别
 - `canSelfConfirm=false` 表示关系包含组长/组内管理员、组内管理范围或超级管理员身份，需由管理员先处理
 - 未分组和唯一组账号正常进入工作台，不要求选择组别

POST http://127.0.0.1:8080/api/user-group/confirmation 确认历史多组账号的所属组别
 - 请求体：`{ "groupId": 11 }`
 - 鉴权：需要登录
 - 成功后在事务中保留所选有效组、移除其他可移除关系并写入审计记录；不会修改系统角色、管理范围或历史报名
 - 常见失败：`403` 目标组不属于当前账号；`409` 关系已变化或含需管理员处理的组内管理身份

PATCH http://127.0.0.1:8080/api/admin/users/:id/group 管理员替换用户所属组
 - 权限：沿用现有用户管理权限（当前路由仅超级管理员）
 - 请求体：`{ "groupId": 11 }` 将用户设为一个启用组；`{ "groupId": null }` 清理为未分组
 - 操作锁定用户记录并使用事务写审计日志；替换原关系，不增加第二个有效组
 - 组长、组内管理员关系和绑定的组内管理范围不会被直接移除；需先完成角色或管理范围处理

PATCH http://127.0.0.1:8080/api/admin/users/:id/group-role 管理员调整用户在某组的组内角色
 - 权限：仅超级管理员；目标组别必须是该账号当前已有的关系
 - 请求体：`{ "groupId": 11, "role": 0 }`；`role=0/1/2` 分别为普通成员、组内管理员、组长
 - 单独调整 `user_group_members.role`，写入前后审计记录；不会修改系统角色、`admin_scope` 或 `management_group_id`
 - 若需移除组长/组管理员关系，先明确调整该组内角色，再执行所属组替换；绑定到其他组的系统管理范围仍需单独处理

POST http://127.0.0.1:8080/api/admin/users 创建用户账号
 - 用途：后台直接创建邮箱密码账号
 - 说明：
   - 不支持后台写入 `github_id` 或手工绑定 GitHub
   - 创建后默认立即启用
   - 新账号默认未分组；系统角色字段与所属组别独立
   - 创建全局管理员时传 `adminScope=global` 且不传 `managementGroupId`
   - 组内管理员和组长必须先通过用户组成员接口任命，不能直接通过创建账号接口跳过成员关系约束
 - 请求体：
   ```json
   {
     "roleId": 3,
     "name": "New User",
     "email": "new-user@example.com",
     "password": "Password123",
     "nickname": "newbie",
     "avatarUrl": "https://example.com/avatar.png",
     "phone": "13800138000",
     "realName": "李四",
     "gender": 1,
     "birthday": "1999-03-12",
     "adminScope": "none"
   }
   ```
 - 成功响应：返回新建后的完整用户详情
- 新账号默认未分组；系统角色字段与用户所属组别独立
 - 常见失败：
   - `400`：请求参数不合法、生日格式错误、角色不存在
   - `403`：当前账号无权创建该角色
   - `409`：该邮箱已存在

PATCH http://127.0.0.1:8080/api/admin/users/:id 更新用户
 - 用途：更新用户资料、邮箱、角色和状态
 - 说明：
   - `status=0` 表示停用，不做物理删除
   - 邮箱允许修改，但必须保持唯一
   - `super_admin` 切换全局管理员需使用 `adminScope=global`；组内管理身份必须与唯一的 `managementGroupId` 及组成员角色一致
   - 将组内管理员降为普通用户前，必须先通过成员接口撤销其组内管理身份
 - 请求体：
   ```json
   {
     "roleId": 3,
     "name": "Updated User",
     "email": "updated-user@example.com",
     "nickname": "updated",
     "avatarUrl": "https://example.com/avatar-updated.png",
     "phone": "13800138001",
     "realName": "李四",
     "gender": 2,
     "birthday": "1999-03-12",
     "status": 0
   }
   ```
 - 成功响应：返回更新后的完整用户详情
 - 常见失败：
   - `400`：请求参数不合法、生日格式错误、状态值不合法、性别取值不合法
   - `403`：当前账号无权修改目标账号或无权设置目标角色
   - `404`：用户不存在
   - `409`：该邮箱已存在

POST http://127.0.0.1:8080/api/admin/users/:id/reset-password 后台重置用户密码
 - 用途：直接设置新的本地密码
 - 说明：
   - 重置成功后旧密码立即失效
   - GitHub 账号也可通过该接口补设本地密码
 - 请求体：
   ```json
   {
     "password": "NewPassword123"
   }
   ```
 - 成功响应：
   ```json
   {
     "code": 200,
     "message": "重置密码成功",
     "data": null
   }
   ```
 - 常见失败：
   - `400`：密码长度不合法或用户 ID 非法
   - `403`：当前账号无权修改该用户
   - `404`：用户不存在

GET http://127.0.0.1:8080/api/admin/roles 获取角色下拉选项
 - 用途：为创建/编辑用户表单提供角色选项
 - 成功响应示例：
   ```json
   {
     "code": 200,
     "message": "获取角色列表成功",
     "data": {
       "items": [
         {
           "id": 1,
           "name": "super_admin",
           "displayName": "超级管理员",
           "editableByCurrentActor": false
         },
         {
           "id": 2,
           "name": "admin",
           "displayName": "管理员",
           "editableByCurrentActor": true
         },
         {
           "id": 3,
           "name": "user",
           "displayName": "普通用户",
           "editableByCurrentActor": true
         }
       ]
     }
   }
   ```
 - 字段说明：
   - `id`：角色 ID
   - `name`：角色标识
   - `displayName`：角色显示名称
   - `editableByCurrentActor`：当前管理员是否允许分配该角色


### 用户分组

说明：
 - 需要管理员登录后携带 JWT Cookie 访问
- 用户组配置接口 `/api/admin/user-groups/**` 仅 `super_admin` 可访问
- `adminScope=global` 可读取用户组筛选项；组长和组内管理员通过 `/api/admin/managed-group/**` 访问自己的唯一管理组
- 用户组接口服务于 `/dashboard/admin/user-groups`
 - `is_default` 仅为旧数据兼容字段，当前接口不显示、不写入，也不参与报名资格判断；数据库字段暂保留
 - 邮箱注册、GitHub 首次建号和后台新建普通用户均保持未分组
 - 普通账号新增或替换所属组别会在事务中锁定用户记录；此阶段不增加 `user_id` 唯一索引，待生产历史关系清理并经只读审计确认无重复后再单独迁移
- `show` 表示该分组是否出现在前台报名表“意向组别(1)/(2)”下拉中，`1=展示`、`0=隐藏`
- `user` 与 `admin` 可以加入分组，`super_admin` 永远不能加入普通用户组
- 每个账号最多在一个组担任管理职务；`role=0` 为普通成员、`role=1` 为组内管理员、`role=2` 为组长
- 组长可管理本组普通成员和组内管理员，但不能任命组长、撤销自己的组长身份或调整全局管理员；组内管理员只有成员只读权限
- 成员详情不分页，成员排序为 `role DESC, joined_at ASC`

GET http://127.0.0.1:8080/api/admin/user-groups/options 获取人员筛选可用的用户组列表
 - 权限：`super_admin` 或全局管理员
 - 响应项：`{ id, name, status }`

GET http://127.0.0.1:8080/api/admin/managed-group 获取当前账号的管理组详情
GET http://127.0.0.1:8080/api/admin/managed-group/members 获取管理组成员
GET http://127.0.0.1:8080/api/admin/managed-group/member-candidates 获取可加入管理组的候选成员
POST http://127.0.0.1:8080/api/admin/managed-group/members 添加管理组成员
PATCH http://127.0.0.1:8080/api/admin/managed-group/members/:memberId 更新成员组内角色
DELETE http://127.0.0.1:8080/api/admin/managed-group/members/:memberId 移除普通成员
 - `managed-group` 接口自动使用当前会话中的 `managementGroupId`，客户端不能指定其他组
 - 组长可读写成员；组内管理员只能读取组详情和成员列表
 - 候选成员必须是启用账号；所属组别由成员管理操作显式设置，不以默认组作为资格判断

GET http://127.0.0.1:8080/api/admin/user-groups 获取用户组列表
 - 用途：加载用户分组页的统计卡与全量卡片列表
 - 查询参数：
   - `status`：分组状态，`1=启用`，`0=停用`
 - 成功响应示例：
   ```json
   {
     "code": 200,
     "message": "获取用户组列表成功",
     "data": {
       "items": [
         {
           "id": 11,
           "name": "新注册用户",
           "description": "邮箱注册与后台新建普通用户的默认承接组",
           "logoUrl": "/upload/config/group/20260418123000_a1b2c3_logo.png",
           "tags": ["新注册", "默认分流"],
          "isDefault": true,
          "show": 1,
          "status": 1,
           "memberCount": 18,
           "leaders": ["Alice", "Bob"],
           "createdAt": "2026-04-11T09:00:00+08:00",
           "updatedAt": "2026-04-12T10:10:00+08:00"
         }
       ],
       "summary": {
         "total": 4,
         "active": 3,
         "disabled": 1,
         "defaultCount": 1,
         "totalMembers": 42
       }
     }
   }
   ```

GET http://127.0.0.1:8080/api/admin/user-groups/:id 获取用户组详情
 - 用途：加载成员管理抽屉
 - 路径参数：`id` 为用户组 ID
 - 成功响应示例：
   ```json
   {
     "code": 200,
     "message": "获取用户组详情成功",
      "data": {
        "id": 11,
        "name": "新注册用户",
        "description": "邮箱注册与后台新建普通用户的默认承接组",
        "logoUrl": "/upload/config/group/20260418123000_a1b2c3_logo.png",
        "tags": ["新注册", "默认分流"],
      "isDefault": true,
      "show": 1,
      "status": 1,
       "memberCount": 2,
       "leaders": ["Alice", "Bob"],
       "createdAt": "2026-04-11T09:00:00+08:00",
       "updatedAt": "2026-04-12T10:10:00+08:00",
       "members": [
         {
           "id": 101,
           "userId": 3,
           "role": 1,
           "joinedAt": "2026-04-11T10:00:00+08:00",
           "user": {
             "id": 3,
             "name": "Alice",
             "email": "alice@example.com",
             "status": 1,
             "role": {
               "id": 2,
               "name": "admin",
               "displayName": "管理员"
             }
           }
         },
         {
           "id": 102,
           "userId": 9,
           "role": 0,
           "joinedAt": "2026-04-11T10:05:00+08:00",
           "user": {
             "id": 9,
             "name": "Tom",
             "email": "tom@example.com",
             "status": 1,
             "role": {
               "id": 3,
               "name": "user",
               "displayName": "普通用户"
             }
           }
         }
       ]
     }
   }
   ```
 - 字段说明：
   - `role`：组内角色，`0=普通成员`、`1=组内管理员`、`2=组长`
   - `leaders`：由当前成员中所有 `role=2` 的账号名称聚合而成

POST http://127.0.0.1:8080/api/admin/user-groups 创建用户组
 - 用途：创建新的用户组卡片
 - 请求类型：`application/json` 或 `multipart/form-data`
 - 请求体：
   ```json
  {
    "name": "企业客户",
    "description": "付费企业客户与重点服务对象",
    "tags": ["企业", "重点服务"],
    "isDefault": false,
    "show": 1,
    "status": 1
  }
   ```
 - multipart 补充：
   - 文件字段：`logo`
   - 普通字段：`name`、`description`、`tags`、`isDefault`、`show`、`status`
 - 成功响应：返回创建后的完整用户组详情
 - 常见失败：
- `400`：请求参数不合法、分组名称为空、状态值或 show 值不合法
   - `403`：当前账号无管理员权限
   - `409`：分组名称已存在

PATCH http://127.0.0.1:8080/api/admin/user-groups/:id 更新用户组
 - 用途：编辑分组基础信息、启停状态与默认标记
 - 说明：
   - 当 `isDefault=true` 且 `status=1` 时，服务端会自动清空其它分组的默认标记
   - 当 `status=0` 时，即使请求体中传入 `isDefault=true`，最终也不会保留默认标记
   - 支持 `application/json` 或 `multipart/form-data`
   - multipart 下可额外传 `logo` 文件字段，或传 `removeLogo=true` 清空已有 Logo
 - 请求体：
   ```json
  {
    "name": "企业客户",
    "description": "已签约企业客户",
    "tags": ["企业", "签约"],
    "isDefault": true,
    "show": 1,
    "status": 1
  }
   ```
 - 成功响应：返回更新后的完整用户组详情
 - 常见失败：
- `400`：请求参数不合法、分组名称为空、状态值或 show 值不合法
   - `403`：当前账号无管理员权限
   - `404`：用户组不存在
   - `409`：分组名称已存在

DELETE http://127.0.0.1:8080/api/admin/user-groups/:id 删除用户组
 - 用途：删除空组
 - 说明：
   - 仅允许删除没有任何成员的用户组
   - 有成员的分组会返回 `409`，前端需提示“请先移除成员”
 - 成功响应：
   ```json
   {
     "code": 200,
     "message": "删除用户组成功",
     "data": null
   }
   ```
 - 常见失败：
   - `403`：当前账号无管理员权限
   - `404`：用户组不存在
   - `409`：该用户组仍有成员，请先移除成员后再删除

GET http://127.0.0.1:8080/api/admin/user-groups/member-candidates 获取成员候选用户
 - 用途：为成员管理抽屉提供“可加入当前分组”的候选账号列表
 - 查询参数：
   - `groupId`：目标用户组 ID，必填
 - 返回规则：
   - 仅返回系统角色为 `user / admin` 的账号
   - 已在当前分组中的账号不会再次返回
   - `groups` 字段展示该候选账号当前已加入的其它分组
 - 成功响应示例：
   ```json
   {
     "code": 200,
     "message": "获取成员候选用户成功",
     "data": {
       "items": [
         {
           "id": 15,
           "name": "Lucy",
           "email": "lucy@example.com",
           "status": 1,
           "role": {
             "id": 3,
             "name": "user",
             "displayName": "普通用户"
           },
           "groups": [
             {
               "id": 12,
               "name": "试用观察组"
             }
           ]
         }
       ]
     }
   }
   ```

POST http://127.0.0.1:8080/api/admin/user-groups/:id/members 添加分组成员
 - 用途：把某个用户加入目标分组
 - 请求体：
   ```json
   {
     "userId": 15,
     "role": 0
   }
   ```
 - 字段说明：
   - `role`：组内角色，`0=普通成员`、`1=组内管理员`、`2=组长`
 - 成功响应示例：
   ```json
   {
     "code": 200,
     "message": "添加成员成功",
     "data": {
       "id": 120,
       "userId": 15,
       "role": 0,
       "joinedAt": "2026-04-12T11:40:00+08:00",
       "user": {
         "id": 15,
         "name": "Lucy",
         "email": "lucy@example.com",
         "status": 1,
         "role": {
           "id": 3,
           "name": "user",
           "displayName": "普通用户"
         }
       }
     }
   }
   ```
 - 常见失败：
   - `400`：请求参数不合法、组内角色不合法
   - `403`：当前账号无管理员权限，或目标账号角色不允许加入用户组
   - `404`：用户组不存在、目标用户不存在
   - `409`：该用户已经在当前分组中

PATCH http://127.0.0.1:8080/api/admin/user-groups/:id/members/:memberId 更新成员组内角色
 - 用途：在普通成员、组内管理员与组长之间调整；该路径仅超级管理员可用
 - 请求体：
   ```json
   {
     "role": 1
   }
   ```
 - 成功响应：返回更新后的成员详情
 - 常见失败：
   - `400`：组内角色不合法
   - `403`：当前账号无管理员权限
   - `404`：分组成员不存在

DELETE http://127.0.0.1:8080/api/admin/user-groups/:id/members/:memberId 移除分组成员
 - 用途：将成员从当前分组中移除
 - 成功响应：
   ```json
   {
     "code": 200,
     "message": "移除成员成功",
     "data": null
   }
   ```
 - 常见失败：
   - `403`：当前账号无管理员权限
   - `404`：分组成员不存在


### 表单配置

GET http://127.0.0.1:8080/api/admin/registration-forms 获取报名表列表
 - 用途：后台表单配置页加载多表单列表与统计信息
 - 查询参数：
   - `keyword`：按标题 / 描述模糊搜索，可选
   - `status`：状态筛选，可选，`0=草稿`、`1=已发布`、`2=已关闭`
 - 成功响应示例：
   ```json
   {
     "code": 200,
     "message": "获取报名表列表成功",
     "data": {
       "items": [
         {
           "id": 3,
           "title": "2026 春季招新报名表",
           "description": "面向机械、电控、视觉、算法方向开放招募",
           "coverImageUrl": "https://example.com/recruitment-cover.jpg",
        "fieldCount": 6,
        "requiredCount": 6,
        "maxRegistrations": 120,
        "startTime": "2026-04-20T09:00:00+08:00",
        "endTime": "2026-04-27T18:00:00+08:00",
        "status": 1,
        "createdAt": "2026-04-13T18:20:00+08:00",
        "updatedAt": "2026-04-13T18:40:00+08:00"
         }
       ],
       "summary": {
         "total": 4,
         "draft": 2,
         "published": 1,
         "closed": 1
       }
     }
   }
   ```
 - 常见失败：
   - `400`：状态筛选值不合法
   - `403`：当前账号无管理员权限

GET http://127.0.0.1:8080/api/admin/registration-forms/:id 获取报名表详情
 - 用途：后台打开某张报名表进行编辑
 - 成功响应：返回单个报名表完整配置，结构与创建 / 更新响应一致
 - 常见失败：
   - `400`：报名表 ID 非法
   - `403`：当前账号无管理员权限
   - `404`：报名表不存在

POST http://127.0.0.1:8080/api/admin/registration-forms 创建报名表
 - 用途：创建一张新的报名表草稿或直接创建为已发布 / 已关闭状态
 - 请求体：
   ```json
   {
     "title": "2026 春季招新报名表",
     "description": "面向机械、电控、视觉、算法方向开放招募",
     "coverImageUrl": "https://example.com/recruitment-cover.jpg",
     "fieldsSchema": [
       {
         "key": "name",
         "label": "姓名",
         "type": "text",
         "required": true,
         "placeholder": "请输入真实姓名"
       },
       {
         "key": "phone",
         "label": "手机号",
         "type": "phone",
         "required": true,
         "placeholder": "请输入常用手机号"
       },
       {
         "key": "email",
         "label": "邮箱",
         "type": "email",
         "required": true,
         "placeholder": "请输入联系邮箱"
       },
       {
         "key": "group_1",
         "label": "意向组别(1)",
         "type": "user_group_select",
         "required": true,
         "placeholder": "请选择意向组别(1)"
       },
       {
         "key": "group_2",
         "label": "意向组别(2)",
         "type": "user_group_select",
         "required": true,
         "placeholder": "请选择意向组别(2)"
       },
       {
         "key": "direction",
         "label": "意向方向",
         "type": "select",
         "required": true,
         "options": [
           {
             "label": "机械组",
             "value": "mechanical"
           },
           {
             "label": "电控组",
             "value": "embedded"
           }
         ]
       }
      ],
      "maxRegistrations": 120,
      "startTime": "2026-04-20T09:00",
      "endTime": "2026-04-27T18:00",
      "status": 0
    }
    ```
 - 字段说明：
  - `fieldsSchema`：支持 `text`、`textarea`、`number`、`select`、`radio`、`checkbox`、`date`、`phone`、`email`、`user_group_select`、`file`、`image`
  - `name`、`phone`、`email`、`group_1`、`group_2` 五个系统字段必须存在、必须 `required=true`
  - `group_1`、`group_2` 的类型固定为 `user_group_select`，其 `options` 由当前 `user_groups.show=1` 的分组实时注入，客户端提交时可省略手工配置的选项内容
   - `status`：`0=草稿`、`1=已发布`、`2=已关闭`
   - `coverImageUrl`：Round 1 仅支持图片 URL，不支持上传
 - 成功响应示例：
   ```json
   {
     "code": 200,
     "message": "创建报名表成功",
     "data": {
       "id": 5,
       "title": "2026 春季招新报名表",
       "description": "面向机械、电控、视觉、算法方向开放招募",
       "coverImageUrl": "https://example.com/recruitment-cover.jpg",
       "fieldCount": 6,
       "requiredCount": 6,
       "fieldsSchema": [
         {
           "key": "name",
           "label": "姓名",
           "type": "text",
           "required": true
         },
         {
           "key": "phone",
           "label": "手机号",
           "type": "phone",
           "required": true
         },
        {
          "key": "email",
          "label": "邮箱",
          "type": "email",
          "required": true
        },
        {
          "key": "group_1",
          "label": "意向组别(1)",
          "type": "user_group_select",
          "required": true,
          "options": [
            {
              "label": "机械组",
              "value": "11"
            },
            {
              "label": "电控组",
              "value": "12"
            }
          ]
        },
        {
          "key": "group_2",
          "label": "意向组别(2)",
          "type": "user_group_select",
          "required": true,
          "options": [
            {
              "label": "机械组",
              "value": "11"
            },
            {
              "label": "电控组",
              "value": "12"
            }
          ]
        },
        {
          "key": "direction",
          "label": "意向方向",
           "type": "select",
           "required": true,
           "options": [
             {
               "label": "机械组",
               "value": "mechanical"
             },
             {
               "label": "电控组",
               "value": "embedded"
             }
           ]
         }
        ],
        "maxRegistrations": 120,
        "startTime": "2026-04-20T09:00:00+08:00",
        "endTime": "2026-04-27T18:00:00+08:00",
        "status": 0,
        "createdAt": "2026-04-13T18:20:00+08:00",
        "updatedAt": "2026-04-13T18:20:00+08:00"
     }
   }
   ```
 - 常见失败：
   - `400`：标题为空、系统字段缺失或非必填、字段 key 重复、字段类型不支持、时间范围不合法、选项 / 文件配置不合法
   - `403`：当前账号无管理员权限
   - `409`：尝试创建已发布报名表时，系统中已经存在另一张已发布报名表

PATCH http://127.0.0.1:8080/api/admin/registration-forms/:id 更新报名表
 - 用途：后台修改报名表内容、字段配置、开放时间与发布状态
 - 请求体：与创建接口一致
 - 成功响应：返回更新后的报名表详情
 - 常见失败：
   - `400`：请求参数不合法、时间范围不合法、系统字段不满足要求
   - `403`：当前账号无管理员权限
   - `404`：报名表不存在
   - `409`：将当前表单改为已发布时，系统中存在另一张已发布报名表

GET http://127.0.0.1:8080/api/admin/registration-forms/:id/registrations/export 下载报名表报名信息 CSV
 - 用途：后台表单配置页在某张报名表的操作列中一键下载该报名表下所有报名人员信息
 - 鉴权：要求管理员权限
 - 返回类型：文件流，不使用 JSON envelope
 - 响应头：
   - `Content-Type: text/csv; charset=utf-8`
   - `Content-Disposition: attachment; filename="registration-form-{id}-registrations.csv"`
 - 权限规则：
   - `super_admin` 与全局管理员可导出该报名表下全部报名记录
   - 组长或组内管理员仅导出 `group_1` 或 `group_2` 命中其唯一管理组的报名记录
 - CSV 编码与列规则：
   - 文件内容以 `UTF-8 BOM` 开头，便于常见表格软件正确识别中文
   - 基础列固定为：`报名记录ID`、`报名表ID`、`报名表标题`
   - 基础列之后按当前报名表 `fieldsSchema` 顺序追加所有表单字段，包含 `姓名`、`手机号`、`邮箱` 等系统字段
   - 当字段为 `意向组别(1)` 时，会紧跟 `意向组别(1)审核状态`、`审核人(1)`、`审核时间(1)`、`审核备注(1)` 四列
   - 当字段为 `意向组别(2)` 时，会紧跟 `意向组别(2)审核状态`、`审核人(2)`、`审核时间(2)`、`审核备注(2)` 四列
   - 所有表单字段输出完成后，仅追加全局列：`报名状态`、`提交时间`
   - 若历史报名数据中存在已不在当前 `fieldsSchema` 内的 `formData` 字段，会按字段 key 字典序追加到末尾，避免旧数据丢失
   - `select`、`radio`、`checkbox`、`user_group_select` 会优先导出可读 `label`，找不到映射时回退原值；多选项使用 `；` 连接
   - `file` 与 `image` 字段导出为绝对 URL 文本，单个文件格式为 `文件名: URL`，多个图片 / 文件同列用 `；` 连接
   - 空报名表或当前管理员无可见报名记录时，仍返回只有表头的 CSV
 - 常见失败：
   - `400`：报名表 ID 非法
   - `403`：当前账号无管理员权限
   - `404`：报名表不存在

GET http://127.0.0.1:8080/api/recruitment/form 获取用户前台报名信息页数据
- 用途：用户前台 `/dashboard/users/registrations` 页面在登录后拉取报名页三态数据
- 鉴权：要求已登录；未登录时返回 `401`
- 返回规则：
   - 若当前用户对已发布报名表已有报名记录，则优先返回 `pageMode=submitted`
   - `pageMode=form`：返回当前开放中的报名表，前端展示可提交表单
   - `pageMode=submitted`：返回当前用户的报名摘要，前端展示总状态、两个意向组别的审核结果与提交时间
   - `pageMode=unavailable`：返回不可报名原因，前端展示不可报名状态页
   - 任何正常登录用户都可查看当前开放的报名表，不检查其用户所属组别；报名意向组只写入本次报名记录
 - 成功响应示例：
   ```json
   {
     "code": 200,
     "message": "获取报名信息页数据成功",
     "data": {
       "pageMode": "form",
       "form": {
         "id": 3,
         "title": "2026 春季招新报名表",
         "description": "面向机械、电控、视觉、算法方向开放招募",
         "coverImageUrl": "https://example.com/recruitment-cover.jpg",
         "fieldsSchema": [
           {
             "key": "name",
             "label": "姓名",
             "type": "text",
             "required": true
           },
           {
             "key": "phone",
             "label": "手机号",
             "type": "phone",
             "required": true
           },
           {
             "key": "email",
             "label": "邮箱",
             "type": "email",
             "required": true
           },
           {
             "key": "group_1",
             "label": "意向组别(1)",
             "type": "user_group_select",
             "required": true,
             "options": [
               {
                 "label": "机械组",
                 "value": "11"
               },
               {
                 "label": "电控组",
                 "value": "12"
               }
             ]
           },
           {
             "key": "group_2",
             "label": "意向组别(2)",
             "type": "user_group_select",
             "required": true,
             "options": [
               {
                 "label": "机械组",
                 "value": "11"
               },
               {
                 "label": "电控组",
                 "value": "12"
               }
             ]
           }
         ],
         "maxRegistrations": 120,
         "startTime": "2026-04-20T09:00:00+08:00",
         "endTime": "2026-04-27T18:00:00+08:00",
         "status": 1
       }
     }
    }
    ```
  - `submitted` 状态示例：
    ```json
    {
      "code": 200,
      "message": "获取报名信息页数据成功",
      "data": {
        "pageMode": "submitted",
        "registrationSummary": {
          "id": 12,
          "formId": 3,
          "formTitle": "2026 春季招新报名表",
          "group1": {
            "id": 11,
            "name": "机械组"
          },
          "group1Status": 1,
          "group2": {
            "id": 12,
            "name": "电控组"
          },
          "group2Status": 0,
          "status": 0,
          "canEdit": false,
          "canCancel": false,
          "submittedAt": "2026-04-13T20:10:00+08:00",
          "updatedAt": "2026-04-13T20:10:00+08:00"
        }
      }
    }
    ```
  - `unavailable` 状态示例：
    ```json
    {
      "code": 200,
      "message": "获取报名信息页数据成功",
      "data": {
        "pageMode": "unavailable",
        "unavailableReason": "当前账号暂无纳新报名资格"
      }
    }
    ```
  - 常见失败：
    - `401`：未登录、登录态失效

### 用户前台报名

POST http://127.0.0.1:8080/api/recruitment/registrations 提交报名
  - 用途：用户前台 `/dashboard/users/registrations` 页面提交当前活动报名表
  - 鉴权：要求已登录；未登录时返回 `401`
  - 请求体：`multipart/form-data`
    - 固定字段：`formId`
    - 其余字段直接使用 `fieldsSchema[].key` 作为表单字段名
    - `file` 字段单文件提交，`image` 字段多文件提交
  - 请求示例：
    - `formId=3`
    - `name=张三`
    - `phone=13800138000`
    - `email=zhangsan@example.com`
    - `group_1=11`
    - `group_2=12`
    - `direction=embedded`
    - `resume=@张三简历.pdf`
    - `portfolio=@作品图1.png`
    - `portfolio=@作品图2.png`
  - 服务端校验：
    - 支持 `text`、`textarea`、`number`、`select`、`radio`、`checkbox`、`date`、`phone`、`email`、`user_group_select`、`file`、`image`
    - `required`、选项合法性、手机号/邮箱格式、文件大小/类型、图片数量均按 `fieldsSchema` 校验
    - `group_1`、`group_2` 必须都落在当前 `user_groups.show=1` 的分组集合中，且两个值不能重复
    - 同一用户对同一张报名表重复提交时返回 `409`
  - 成功响应示例：
    ```json
    {
      "code": 200,
      "message": "提交报名成功",
      "data": {
        "id": 12,
        "formId": 3,
        "status": 0,
        "submittedAt": "2026-04-13T20:10:00+08:00"
      }
    }
    ```
  - 常见失败：
    - `400`：字段缺失、字段格式不合法、文件大小或类型不合法
    - `401`：未登录、登录态失效
    - `404`：当前暂无开放中的报名表
    - `409`：重复报名、报名人数已满、报名尚未开始、报名已结束、或后台存在多张已发布报名表

PATCH http://127.0.0.1:8080/api/recruitment/registrations/:id 修改本人报名
  - 鉴权：要求已登录，且报名记录必须属于当前用户
  - 请求体：与首次提交相同的 `multipart/form-data` 字段（不需要再次传 `formId`）
  - 仅当两个意向组均尚未进入审核时允许修改；更新后审核状态保持待审核，并清理被新文件替换的旧上传文件
  - 常见失败：`403` 操作他人记录；`404` 记录或报名表不存在；`409` 已进入审核，无法修改

DELETE http://127.0.0.1:8080/api/recruitment/registrations/:id 取消本人报名
  - 鉴权和可操作阶段与修改接口相同
  - 当前实现会物理删除尚未审核的报名记录及其上传文件，之后用户可以重新提交
  - 常见失败：`403` 操作他人记录；`404` 记录不存在；`409` 已进入审核，无法取消

GET http://127.0.0.1:8080/api/admin/registrations 获取报名列表
  - 用途：后台报名列表页查询报名记录
  - 鉴权：要求管理员权限
  - 查询参数：
    - `page`：可选，页码，从 `1` 开始，默认 `1`
    - `pageSize`：可选，每页条数，默认 `10`，最大 `100`
    - `keyword`：可选，按姓名 / 手机号 / 邮箱 / 报名表标题模糊搜索
    - `status`：可选，`0=待审核`、`1=已通过`、`2=已拒绝`、`3=已取消`
    - `formId`：可选，按报名表筛选
  - 权限规则：
    - `super_admin` 与 `adminScope=global` 的全局管理员可查看全部报名记录
    - 有效管理组中的组长或组内管理员，只能查看 `group_1` 或 `group_2` 命中其唯一 `managementGroupId` 的报名记录
  - 返回说明：
    - `summary` 返回当前关键字 / 报名表筛选条件下的状态统计
    - `items` 仅返回固定通用列，不返回 `formData`
    - `canApprove` / `canReject` 表示当前管理员对该记录是否仍有可执行的审核动作
    - `pagination` 返回当前完整筛选条件（包含 `status`）下的分页信息
  - 成功响应示例：
    ```json
    {
      "code": 200,
      "message": "获取报名列表成功",
      "data": {
        "summary": {
          "total": 24,
          "pending": 9,
          "approved": 8,
          "rejected": 5,
          "cancelled": 2
        },
        "items": [
          {
            "id": 12,
            "formId": 3,
            "formTitle": "2026 春季招新报名表",
            "contactName": "张三",
            "contactPhone": "13800138000",
            "contactEmail": "zhangsan@example.com",
            "group1": {
              "id": 11,
              "name": "机械组"
            },
            "group1Status": 0,
            "group2": {
              "id": 12,
              "name": "电控组"
            },
            "group2Status": 0,
            "status": 0,
            "canApprove": true,
            "canReject": true,
            "submittedAt": "2026-04-13T20:10:00+08:00",
            "updatedAt": "2026-04-13T20:10:00+08:00"
          }
        ],
        "pagination": {
          "page": 1,
          "pageSize": 10,
          "total": 24,
          "totalPages": 3
        }
      }
    }
    ```
  - 常见失败：
    - `400`：筛选参数不合法
    - `403`：当前账号无管理员权限

GET http://127.0.0.1:8080/api/admin/registrations/:id 获取报名详情
  - 用途：后台从报名列表打开详情抽屉
  - 鉴权：要求管理员权限
  - 返回说明：
    - 返回固定元信息、`formData` 和当前报名表的 `fieldsSchema`
    - `formData` 中普通字段存规范化值
    - `file` 字段返回单个对象，`image` 字段返回对象数组
    - 文件对象结构为 `{ file_name, file_url, file_size }`
    - `reviewer1/reviewer2`、`reviewedAt1/reviewedAt2`、`reviewRemark1/reviewRemark2` 分别对应两个意向组别槽位
    - `interviews` 返回各意向组的面试结果；`finalStatus` 为 `0=待定`、`1=已录取`、`2=未录取`
    - `finalGroup`、`finalizedAt`、`finalizer` 仅在结果真正确定后返回；`canInterview1/2` 表示当前账号能否录入对应组的面试结果
  - 成功响应示例：
    ```json
    {
      "code": 200,
      "message": "获取报名详情成功",
      "data": {
        "id": 12,
        "formId": 3,
        "formTitle": "2026 春季招新报名表",
        "contactName": "张三",
        "contactPhone": "13800138000",
        "contactEmail": "zhangsan@example.com",
        "group1": {
          "id": 11,
          "name": "机械组"
        },
        "group1Status": 1,
        "group2": {
          "id": 12,
          "name": "电控组"
        },
        "group2Status": 2,
        "status": 0,
        "reviewer1": {
          "id": 2,
          "name": "Alice",
          "email": "alice@example.com"
        },
        "reviewedAt1": "2026-04-13T21:00:00+08:00",
        "reviewRemark1": "",
        "reviewer2": {
          "id": 3,
          "name": "Bob",
          "email": "bob@example.com"
        },
        "reviewedAt2": "2026-04-13T21:10:00+08:00",
        "reviewRemark2": "本轮名额已满",
        "canApprove": false,
        "canReject": false,
        "submittedAt": "2026-04-13T20:10:00+08:00",
        "updatedAt": "2026-04-13T20:10:00+08:00",
        "fieldsSchema": [
          {
            "key": "name",
            "label": "姓名",
            "type": "text",
            "required": true
          },
          {
            "key": "resume",
            "label": "简历",
            "type": "file",
            "required": false
          },
          {
            "key": "portfolio",
            "label": "作品图",
            "type": "image",
            "required": false
          }
        ],
        "formData": {
          "name": "张三",
          "group_1": "11",
          "group_2": "12",
          "resume": {
            "file_name": "张三简历.pdf",
            "file_url": "/api/admin/registrations/12/files/resume/0",
            "file_size": 1048576
          },
          "portfolio": [
            {
              "file_name": "作品图1.png",
              "file_url": "/api/admin/registrations/12/files/portfolio/0",
              "file_size": 845612
            }
          ]
        }
      }
    }
    ```
  - 常见失败：
    - `400`：报名记录 ID 非法
    - `403`：当前账号无管理员权限
    - `404`：报名记录不存在

GET http://127.0.0.1:8080/api/admin/registrations/:id/files/:fieldKey/:index 访问报名文件
  - 用途：后台详情抽屉访问上传文件
  - 鉴权：要求管理员权限
  - 返回规则：
    - `image` 字段文件以 `inline` 方式返回，可直接预览
    - 其他文件以下载附件方式返回
    - 文件实际存储目录为运行目录下 `upload/recruitment/{formId}/{userId}/{fieldKey}/`
  - 常见失败：
    - `400`：报名记录 ID、字段 key 或文件索引不合法
    - `403`：当前账号无管理员权限
    - `404`：报名记录不存在，或文件不存在

POST http://127.0.0.1:8080/api/admin/registrations/:id/review 审核报名
  - 用途：后台报名列表页 / 详情抽屉执行“通过 / 拒绝”动作
  - 鉴权：要求管理员权限
  - 权限规则：
    - `super_admin` 与全局管理员会一次性处理该记录当前全部待审核槽位
    - 有效管理组中的组长或组内管理员，只会处理属于其唯一管理组且仍待审核的槽位
  - 请求体：
    ```json
    {
      "decision": "approve",
      "remark": "综合评估通过"
    }
    ```
  - 字段说明：
    - `decision`：必填，`approve` 或 `reject`
    - `remark`：选填，本轮前端未提供备注输入框，但接口已预留
  - 状态规则：
    - 若两个槽位中任一仍为 `pending`，总 `status` 保持 `0`
    - 两个槽位都有结果后，只要至少一个槽位通过，总 `status=1`
    - 两个槽位都拒绝时，总 `status=2`
    - 两个槽位的线上审核结果彼此独立，可以同时都为 `approve`
    - 线上审核只决定是否进入对应组面试，不会修改报名人的用户组成员关系
  - 成功响应：返回更新后的报名详情，结构同 `GET /api/admin/registrations/:id`
  - 常见失败：
    - `400`：报名记录 ID 不合法、`decision` 不合法
    - `403`：当前账号无管理员权限，或无权审核该报名记录
    - `404`：报名记录不存在
    - `409`：已取消的报名不支持审核，或当前报名没有可审核的意向组别

DELETE http://127.0.0.1:8080/api/admin/registrations/:id/review 撤销线上审核
  - 权限范围与提交审核相同，只清空当前管理员可管理槽位的审核状态、审核人、时间和备注
 - 若被撤销的线上审核已经产生最终录取，服务端会清空对应最终结果；用户所属组别由独立的组别管理流程维护
  - 已取消或没有可撤销结果时返回 `409`

PATCH http://127.0.0.1:8080/api/admin/registrations/:id/interviews/:groupId 更新面试结果
  - 请求体：`{ "status": "pending|passed|failed", "remark": "可选备注" }`
  - 只有对应意向组线上审核已通过，且当前管理员对该组有审核权限时才可操作
  - 第一志愿面试通过时立即优先录取第一志愿；第一志愿未通过且第二志愿通过时录取第二志愿；两个志愿均未通过时最终未录取；其余组合保持待定
  - 面试结果仅更新报名记录；用户选择的意向组和用户当前所属组互相独立
  - `finalizedAt` 和 `finalizer` 只在最终状态为已录取或未录取时写入，待定状态保持为空

DELETE http://127.0.0.1:8080/api/admin/registrations/:id 删除报名
  - 用途：后台报名列表页 / 详情抽屉硬删除报名记录
  - 鉴权：要求管理员权限
  - 权限规则：
    - `super_admin` 与全局管理员可删除所有报名记录
    - 组长或组内管理员仅可删除其唯一管理组可见的报名记录
  - 删除行为：
    - 直接物理删除 `registrations` 表中的记录
    - 若报名中包含上传文件，服务端会同步清理运行目录下 `upload/recruitment/...` 对应文件
    - 删除后不可恢复
  - 成功响应：
    ```json
    {
      "code": 200,
      "message": "删除报名记录成功",
      "data": null
    }
    ```
  - 常见失败：
    - `400`：报名记录 ID 不合法
    - `403`：当前账号无管理员权限，或无权删除该报名记录
    - `404`：报名记录不存在


## 用户后台API列表
