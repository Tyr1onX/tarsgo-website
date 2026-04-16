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
        "email": "admin@tarsgo.local",
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
   - `portal.showRecruitmentEntry`：用户前台是否显示“纳新报名”入口；仅当后台存在已发布报名表，且当前用户仍属于启用中的默认分组时返回 `true`
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
 - 用途：加载 `/dashboard/admin/users` 列表、统计卡和分页信息
 - 查询参数：
- `page`：页码，默认 `1`
- `pageSize`：每页条数，默认 `10`，最大 `100`
- `keyword`：模糊匹配 `name / email / phone / real_name / nickname`
- `role`：角色标识，如 `super_admin`、`admin`、`user`
- `groupId`：按所属用户组筛选，传入用户组 ID
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
- 用户组接口服务于 `/dashboard/admin/user-groups`
- 同一时间只允许一个“启用中的默认分组”；如果某个分组被设置为默认且状态为启用，服务端会在同一事务内清空其它分组的默认标记
- 邮箱注册、GitHub 首次建号、后台创建 `role=user` 三条链路都会尝试自动加入当前启用中的默认分组；若不存在默认分组则跳过
- `show` 表示该分组是否出现在前台报名表“意向组别(1)/(2)”下拉中，`1=展示`、`0=隐藏`
- `user` 与 `admin` 可以加入分组，`super_admin` 永远不能加入分组
- Round 1 成员详情不分页，成员排序为 `role DESC, joined_at ASC`

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
    "show": 1,
    "status": 1
  }
   ```
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

GET http://127.0.0.1:8080/api/recruitment/form 获取用户前台报名信息页数据
- 用途：用户前台 `/dashboard/users/registrations` 页面在登录后拉取报名页三态数据
- 鉴权：要求已登录；未登录时返回 `401`
- 返回规则：
   - 若当前用户对已发布报名表已有报名记录，则优先返回 `pageMode=submitted`
   - `pageMode=form`：返回当前开放中的报名表，前端展示可提交表单
   - `pageMode=submitted`：返回当前用户的报名摘要，前端展示状态与提交时间
   - `pageMode=unavailable`：返回不可报名原因，前端展示不可报名状态页
   - 当当前用户不在启用中的默认分组，且没有已提交记录时，返回 `pageMode=unavailable`
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
          "status": 0,
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

GET http://127.0.0.1:8080/api/admin/registrations 获取报名列表
  - 用途：后台报名列表页查询报名记录
  - 鉴权：要求管理员权限
  - 查询参数：
    - `keyword`：可选，按姓名 / 手机号 / 邮箱 / 报名表标题模糊搜索
    - `status`：可选，`0=待审核`、`1=已通过`、`2=已拒绝`、`3=已取消`
    - `formId`：可选，按报名表筛选
  - 权限规则：
    - `super_admin` 与“没有任何组长身份的 admin”可查看全部报名记录
    - “至少担任一个用户组组长的 admin”仅可查看 `group_1` 或 `group_2` 命中其组长分组的报名记录
  - 返回说明：
    - `summary` 返回当前关键字 / 报名表筛选条件下的状态统计
    - `items` 仅返回固定通用列，不返回 `formData`
    - `canApprove` / `canReject` 表示当前管理员对该记录是否仍有可执行的审核动作
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
        ]
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
    - `super_admin` 与“没有任何组长身份的 admin”会一次性处理该记录当前全部待审核槽位
    - “至少担任一个用户组组长的 admin”只会处理当前记录中属于自己组长分组且仍待审核的槽位
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
    - 两个槽位的审核结果彼此独立，可以同时都为 `approve`
    - 两个槽位都出结果后，系统会自动将报名人加入所有审核通过的意向组别；若两个意向组别都通过，则会同时加入两个组，重复写入需幂等
    - 当报名最终进入通过状态并加入通过组别时，若用户当前仍在默认分组中，且该默认分组不属于通过组别，则会同步从默认分组移出
  - 成功响应：返回更新后的报名详情，结构同 `GET /api/admin/registrations/:id`
  - 常见失败：
    - `400`：报名记录 ID 不合法、`decision` 不合法
    - `403`：当前账号无管理员权限，或无权审核该报名记录
    - `404`：报名记录不存在
    - `409`：已取消的报名不支持审核，或当前报名没有可审核的意向组别

DELETE http://127.0.0.1:8080/api/admin/registrations/:id 删除报名
  - 用途：后台报名列表页 / 详情抽屉硬删除报名记录
  - 鉴权：要求管理员权限
  - 权限规则：
    - `super_admin` 与“没有任何组长身份的 admin”可删除所有报名记录
    - “至少担任一个用户组组长的 admin”仅可删除自己有权查看的报名记录
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

