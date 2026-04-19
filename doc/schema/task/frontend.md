# 前端设计需求列表
important：
 - 请严格遵循doc\schema\task\principle.md的前端设计准则

## 官网页面

Round 1：
1. 删除前端项目中的welcome页面，然后联网深度查找吉林大学吉甲大师、大疆Robomaster相关的内容，我需要为吉甲大师做一个官网首页
2. 首页导航栏最右侧有登录与注册按钮，点击后跳转到登录/注册页面

## 统一工作台页面
router：/dashboard

### 侧边栏规则
1. 所有前后台页面统一挂在 `/dashboard/**` 下
2. 访问 `/dashboard` 时，前端直接 `replace` 到 `/dashboard/users`
3. 普通用户只显示“用户功能”分区
4. `super_admin` 与 `admin` 登录后同时显示“用户功能”与“管理功能”两个分区，两区之间使用分隔线分隔
5. “用户功能”分区承载普通用户入口；“管理功能”分区承载管理员入口

## 管理员工作台页面
router：/dashboard/admin

Round 1：
1. 联网深度查找吉林大学吉甲大师、大疆Robomaster相关的内容，我需要为吉甲大师做一个后台管理页面
2. Sidebar 需要保留管理员功能入口，并与普通用户入口融合到统一工作台中
3. 管理员首页改为“数据面板”，只展示 demo，不对接实际统计功能

### 管理员菜单
1. 数据面板：`/dashboard/admin`
2. 用户数据：`/dashboard/admin/users`
3. 用户分组：`/dashboard/admin/user-groups`
4. 表单配置：`/dashboard/admin/form-config`
5. 报名列表：`/dashboard/admin/registrations`

## 用户工作台页面
router：/dashboard/users

Round 1：
1. 联网深度查找吉林大学吉甲大师、大疆Robomaster相关的内容，我需要为吉甲大师做一个用户前台页面
2. Sidebar 中的用户功能分区需要有“主页”、“纳新报名”
3. 根据你的经验，写出每个项页面的 demo，不需要对接任何功能

### 用户菜单
1. 用户主页：`/dashboard/users`
2. 纳新报名：`/dashboard/users/registrations`


