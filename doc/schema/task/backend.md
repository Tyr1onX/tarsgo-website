# 后端设计需求列表
important：
 - 所有的API列表请查看doc\schema\task\api.md文档

## 管理员后台

Round 1：
1. 首先查看API文档，明确目前登录注册所需要的接口信息
2. 查看 doc\schema\register_info 目录，这里有两种登录方式的配置文件，可以写在.env文件里
2. 实现登录、注册功能，并在前端进行对接，前端页面没有适配的字段，UI等需要你进行改动适配。
3. 测试用账户请创建 账户名admin@tarsgo.local 密码123456
4. 使用chrome-devtools进行调试，确保两功能均没问题

## 用户数据页
Round 1：
1. 请查看doc\schema\schema_v1.md文档中的用户表 `users`，然后完全重构用户数据页UI，根据这张表，写出你觉得应该有的管理功能，前端跟后端完成对接

## 用户分组页
Round 1：
1. 请查看doc\schema\schema_v1.md文档中的用户组表 `user_groups`，完成后端相关功能，并在前端后台的用户分组页面对接实际功能
2. 设置用户刚注册登录时候分配的分组应该是is_default为1的分组，如果没有is_default为1的分组，则不为用户分配分组
3. 用户数据页面中列表除了角色，还需要展示用户的组别
4. 完成本次更改后所有新产生的API都记录在API文档中