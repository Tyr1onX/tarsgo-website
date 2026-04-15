# 后端设计需求列表
important：
 - 所有的API列表请查看doc\schema\task\api.md文档

## 管理员后台
Round 1：
1. 首先查看API文档，明确目前登录注册所需要的接口信息
2. 查看 doc\schema\register_info 目录，这里有两种登录方式的配置文件，可以写在.env文件里
3. 实现登录、注册功能，并在前端进行对接，前端页面没有适配的字段，UI等需要你进行改动适配。
4. 测试用账户请创建 账户名admin@tarsgo.local 密码123456
5. 使用chrome-devtools进行调试，确保两功能均没问题

### 数据面板
可访问角色：["超级管理员","普通管理员"]
说明：
1. 页面路由统一为 `/dashboard/admin`
2. 当前阶段仅保留静态 demo，不对接真实统计接口

### 用户数据页
可访问角色：["超级管理员","普通管理员"]
Round 1：
1. 请查看doc\schema\schema_v1.md文档中的用户表 `users`，然后完全重构用户数据页UI，根据这张表，写出你觉得应该有的管理功能，前端跟后端完成对接
2. 页面路由统一为 `/dashboard/admin/users`

### 用户分组页
可访问角色：["超级管理员"]
Round 1：
1. 请查看doc\schema\schema_v1.md文档中的用户组表 `user_groups`，完成后端相关功能，并在前端后台的用户分组页面对接实际功能
2. 设置用户刚注册登录时候分配的分组应该是is_default为1的分组，如果没有is_default为1的分组，则不为用户分配分组
3. 用户数据页面中列表除了角色，还需要展示用户的组别
4. 完成本次更改后所有新产生的API都记录在API文档中
5. 页面路由统一为 `/dashboard/admin/user-groups`

### 表单配置页
可访问角色：["超级管理员"]
Round 1：
1. 请查看doc\schema\schema_v1.md文档中的报名表配置表 `registration_forms`，完成后端相关功能，并在前端后台的表单配置页面对接实际功能，其中姓名、手机号、邮箱，这三个字段为必选项
2. 用户工作台的纳新报名页面使用 `/dashboard/users/registrations`，根据表单配置中的信息自动生成表单与页面态。只有在用户登录，且后台报名表状态已开启的情况下，才展示可提交的表单页面
3. 完成本次更改后所有新产生的API都记录在API文档中
4. 页面路由统一为 `/dashboard/admin/form-config`

### 报名页面&列表页面
报名列表可访问角色：["超级管理员","普通管理员"]
Round 1：
1. 请查看doc\schema\schema_v1.md文档中的报名信息表 `registrations`
2. 报名页面中，用户填写完成信息，点击提交报名后，将用户提交信息保存在registrations表中，需要在前端后台的报名列表页面显示
3. 报名页面中，字段类型为文件上传或图片上传，上传的文件都保存在运行目录下的upload/recruitment目录下
4. 报名列表页面用表格来展示报名人员列表，其中form_data字段的信息不要展示在表格里，而是在点击表格中项的最右侧的详情按钮后，左侧展开抽屉，根据form_data来动态生成用户填写的信息进行展示
5. 所有报名人员默认是待审核阶段
6. 完成本次更改后所有新产生的API都记录在API文档中
7. 页面路由统一为 `/dashboard/admin/registrations`

## 用户工作台
Round 1：
1. 用户工作台相关UI统一挂在 `app\routes\dashboard` 与 `app\routes\users` 下
2. 登录注册完成后默认先进入 `/dashboard`，再由前端根路由重定向到 `/dashboard/users`
3. 用户工作台的纳新报名页面 `/dashboard/users/registrations` 需要承载报名表单、已报名状态、暂不可报名状态三种页面态；已报名状态展示当前进度、结果、提交时间，不回显完整表单内容
4. 完成本次更改后所有新产生的API都记录在API文档中

Round 2：
1. 用户工作台 sidebar 中的“报名信息”改为“纳新报名”
2. 仅当后台存在已发布的报名表单配置时，用户工作台才显示纳新报名入口
3. 纳新报名入口只对当前仍在默认分组中的用户显示；若用户已提交报名，则 `/dashboard/users/registrations` 仍继续展示已报名页面态

Round 3：
1. 用户在注册登录后默认进入统一工作台 `/dashboard`
2. 普通用户只显示用户功能分区；管理员账号在统一工作台中同时显示用户功能与管理功能两个 sidebar 分区
