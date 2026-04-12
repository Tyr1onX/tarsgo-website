# API列表
important：
 - API格式为 {请求类型} {请求地址} {API描述} {测试用账号密码（可选）}
 -示例： GET http://127.0.0.1:3000 测试API 账号：123 密码：123

## 登录/注册

说明：
 - 身份验证采用 JWT Token，通过 HttpOnly Cookie 下发
 - 所有响应格式统一为 `{ "code": int, "message": string, "data": object }`
 - 后端地址：`http://127.0.0.1:8080`
 - 前端开发地址默认是 `http://127.0.0.1:5173`，若端口冲突可能自动切到 `http://127.0.0.1:5180`

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

POST http://127.0.0.1:8080/api/register/email 邮箱注册
 - 说明：
   - 若系统当前存在“启用中的默认分组”，注册成功后会自动把新账号加入该默认分组
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

### GitHub 三方登录

GET http://127.0.0.1:8080/api/login/github GitHub 登录入口
 - 前端跳转到此地址，后端 302 重定向到 GitHub OAuth 授权页面
 - GitHub 授权完成后回调到后端回调地址

GET http://127.0.0.1:8080/api/register/github/oauth/callback GitHub OAuth 回调
 - GitHub 授权成功后回调此地址，携带 code 参数
 - 后端用 code 换取 access_token，获取 GitHub 用户信息
 - 如果该 GitHub 账号未绑定本站账户，自动创建新账户
 - 若因为 GitHub 首次登录而新建账号，且系统存在“启用中的默认分组”，则会自动加入默认分组
 - 成功后通过 Set-Cookie 下发 JWT，然后 302 重定向到前端管理员后台

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
         "email": "admin@tarsgo.local",
         "phone": null,
         "role": {
           "id": 1,
           "name": "super_admin",
           "displayName": "超级管理员"
         }
       }
     }
   }
   ```
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
 - `admin` 与 `super_admin` 可访问后台用户管理接口
 - `admin` 仅可创建/编辑/重置 `user`
 - `super_admin` 可创建/编辑 `admin` 与 `user`
 - 所有 `super_admin` 账号只允许查看，不允许修改、停用或重置密码

GET http://127.0.0.1:8080/api/admin/users 获取用户分页列表
 - 用途：加载 `/admin/users` 列表、统计卡和分页信息
 - 查询参数：
   - `page`：页码，默认 `1`
   - `pageSize`：每页条数，默认 `10`，最大 `100`
   - `keyword`：模糊匹配 `name / email / phone / real_name / nickname`
   - `role`：角色标识，如 `super_admin`、`admin`、`user`
   - `status`：账号状态，`1=启用`，`0=停用`
 - 排序：默认 `created_at DESC`
 - 列表项新增字段：
   - `groups`：该用户所属全部分组，元素结构为 `{ id, name, memberRole }`
   - `memberRole`：组内角色，`0=普通成员`，`1=组长`
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
               "id": 11,
               "name": "新注册用户",
               "memberRole": 0
             },
             {
               "id": 12,
               "name": "试用观察组",
               "memberRole": 1
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
         "githubBound": 5
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
   - `groups`：展示用户所属全部分组，元素结构为 `{ id, name, memberRole, status }`
   - `status`：分组自身状态，`1=启用`，`0=停用`
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
         {
           "id": 11,
           "name": "新注册用户",
           "memberRole": 0,
           "status": 1
         },
         {
           "id": 12,
           "name": "试用观察组",
           "memberRole": 1,
           "status": 0
         }
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

POST http://127.0.0.1:8080/api/admin/users 创建用户账号
 - 用途：后台直接创建邮箱密码账号
 - 说明：
   - 不支持后台写入 `github_id` 或手工绑定 GitHub
   - 创建后默认立即启用
   - 当新建账号角色为 `user` 且系统存在“启用中的默认分组”时，服务端会自动把该账号加入默认分组；若当前没有默认分组则跳过，不报错
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
     "birthday": "1999-03-12"
   }
   ```
 - 成功响应：返回新建后的完整用户详情
 - 常见失败：
   - `400`：请求参数不合法、生日格式错误、角色不存在
   - `403`：当前账号无权创建该角色
   - `409`：该邮箱已存在

PATCH http://127.0.0.1:8080/api/admin/users/:id 更新用户
 - 用途：更新用户资料、邮箱、角色和状态
 - 说明：
   - `status=0` 表示停用，不做物理删除
   - 邮箱允许修改，但必须保持唯一
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
 - `admin` 与 `super_admin` 可访问用户组后台接口
 - 用户组接口服务于 `/admin/user-groups`
 - 同一时间只允许一个“启用中的默认分组”；如果某个分组被设置为默认且状态为启用，服务端会在同一事务内清空其它分组的默认标记
 - 邮箱注册、GitHub 首次建号、后台创建 `role=user` 三条链路都会尝试自动加入当前启用中的默认分组；若不存在默认分组则跳过
 - `user` 与 `admin` 可以加入分组，`super_admin` 永远不能加入分组
 - Round 1 成员详情不分页，成员排序为 `role DESC, joined_at ASC`

GET http://127.0.0.1:8080/api/admin/user-groups 获取用户组分页列表
 - 用途：加载用户分组页的统计卡、卡片列表和分页器
 - 查询参数：
   - `page`：页码，默认 `1`
   - `pageSize`：每页条数，默认 `10`，最大 `100`
   - `keyword`：模糊匹配 `name / description`
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
           "tags": ["新注册", "默认分流"],
           "isDefault": true,
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
       },
       "pagination": {
         "page": 1,
         "pageSize": 9,
         "total": 4,
         "totalPages": 1
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
       "tags": ["新注册", "默认分流"],
       "isDefault": true,
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
   - `role`：组内角色，`0=普通成员`，`1=组长`
   - `leaders`：由当前成员中所有 `role=1` 的账号名称聚合而成，因此同一分组允许多名组长

POST http://127.0.0.1:8080/api/admin/user-groups 创建用户组
 - 用途：创建新的用户组卡片
 - 请求体：
   ```json
   {
     "name": "企业客户",
     "description": "付费企业客户与重点服务对象",
     "tags": ["企业", "重点服务"],
     "isDefault": false,
     "status": 1
   }
   ```
 - 成功响应：返回创建后的完整用户组详情
 - 常见失败：
   - `400`：请求参数不合法、分组名称为空、状态值不合法
   - `403`：当前账号无管理员权限
   - `409`：分组名称已存在

PATCH http://127.0.0.1:8080/api/admin/user-groups/:id 更新用户组
 - 用途：编辑分组基础信息、启停状态与默认标记
 - 说明：
   - 当 `isDefault=true` 且 `status=1` 时，服务端会自动清空其它分组的默认标记
   - 当 `status=0` 时，即使请求体中传入 `isDefault=true`，最终也不会保留默认标记
 - 请求体：
   ```json
   {
     "name": "企业客户",
     "description": "已签约企业客户",
     "tags": ["企业", "签约"],
     "isDefault": true,
     "status": 1
   }
   ```
 - 成功响应：返回更新后的完整用户组详情
 - 常见失败：
   - `400`：请求参数不合法、分组名称为空、状态值不合法
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
 - 用途：为成员管理抽屉提供“可加入当前分组”的候选账号搜索结果
 - 查询参数：
   - `groupId`：目标用户组 ID，必填
   - `keyword`：按用户名或邮箱模糊搜索，选填
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
   - `role`：组内角色，`0=普通成员`，`1=组长`
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
 - 用途：普通成员与组长互转
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


### 报名列表


## 用户后台API列表

