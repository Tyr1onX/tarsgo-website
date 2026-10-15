# 报名系统数据库 Schema v1

> 数据库：MySQL 8.0+
> 字符集：utf8mb4
> 引擎：InnoDB

---

## 1. 角色表 `roles`

定义系统中的用户角色，与用户表构成一对多关系。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | BIGINT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| `name` | VARCHAR(50) | NOT NULL, UNIQUE | 角色标识，如 `super_admin`、`admin`、`user` |
| `display_name` | VARCHAR(100) | NOT NULL | 角色显示名称，如「超级管理员」「普通管理员」「普通用户」 |
| `description` | VARCHAR(255) | DEFAULT NULL | 角色描述 |
| `sort_order` | INT | NOT NULL DEFAULT 0 | 排序权重，数值越小越靠前 |
| `created_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### 预置数据

| name | display_name | description |
|------|-------------|-------------|
| `super_admin` | 超级管理员 | 拥有所有权限，可管理其他管理员 |
| `admin` | 普通管理员 | 可管理报名表和报名信息 |
| `user` | 普通用户 | 仅可填写和查看自己的报名 |

---

## 2. 用户表 `users`

存储所有用户的认证信息和个人资料。支持邮箱+密码登录和 GitHub OAuth 登录。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | BIGINT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| `role_id` | BIGINT UNSIGNED | NOT NULL, FK → `roles.id` | 所属角色 |
| `admin_scope` | VARCHAR(20) | NOT NULL DEFAULT 'none' | 管理范围：`none`、`group`、`global` |
| `management_group_id` | BIGINT UNSIGNED | DEFAULT NULL | 组内管理员负责的唯一用户组；必须与组内管理成员关系一致 |
| **认证字段** ||||
| `email` | VARCHAR(255) | NOT NULL, UNIQUE | 邮箱，同时用于登录和联系 |
| `password_hash` | VARCHAR(255) | DEFAULT NULL | 密码哈希（bcrypt），GitHub 登录用户可为空 |
| `github_id` | VARCHAR(100) | DEFAULT NULL, UNIQUE | GitHub 用户 ID，用于 OAuth 登录绑定 |
| `github_username` | VARCHAR(100) | DEFAULT NULL | GitHub 用户名，用于展示 |
| **个人信息** ||||
| `nickname` | VARCHAR(100) | DEFAULT NULL | 昵称 |
| `avatar_url` | VARCHAR(500) | DEFAULT NULL | 头像 URL |
| `phone` | VARCHAR(20) | DEFAULT NULL | 手机号 |
| `real_name` | VARCHAR(100) | DEFAULT NULL | 真实姓名 |
| `gender` | TINYINT | DEFAULT 0 | 性别：0=未知，1=男，2=女 |
| `birthday` | DATE | DEFAULT NULL | 出生日期 |
| **状态字段** ||||
| `status` | TINYINT | NOT NULL DEFAULT 1 | 账号状态：0=禁用，1=正常 |
| `last_login_at` | DATETIME | DEFAULT NULL | 最后登录时间 |
| `created_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | 注册时间 |
| `updated_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### 索引

| 索引名 | 字段 | 类型 | 说明 |
|--------|------|------|------|
| `uk_email` | `email` | UNIQUE | 邮箱唯一 |
| `uk_github_id` | `github_id` | UNIQUE | GitHub ID 唯一（允许 NULL） |
| `idx_role_id` | `role_id` | INDEX | 按角色查询 |
| `idx_admin_scope` | `admin_scope` | INDEX | 按管理范围筛选 |
| `idx_management_group_id` | `management_group_id` | INDEX | 查询某组的管理账号 |
| `idx_phone` | `phone` | INDEX | 按手机号查询 |
| `idx_status` | `status` | INDEX | 按状态筛选 |

---

## 3. 报名表配置表 `registration_forms`

每条记录代表一个管理员创建的报名表，字段配置以 JSON Schema 方式存储。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | BIGINT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| `creator_id` | BIGINT UNSIGNED | NOT NULL, FK → `users.id` | 创建者（管理员） |
| **基本信息** ||||
| `title` | VARCHAR(200) | NOT NULL | 报名表标题 |
| `description` | TEXT | DEFAULT NULL | 报名表描述/说明 |
| `cover_image_url` | VARCHAR(500) | DEFAULT NULL | 封面图 URL |
| **字段配置** ||||
| `fields_schema` | JSON | NOT NULL | 表单字段定义，详见下方 JSON 结构 |
| **报名限制** ||||
| `max_registrations` | INT | DEFAULT NULL | 报名人数上限，NULL 表示不限 |
| `start_time` | DATETIME | DEFAULT NULL | 报名开始时间，NULL 表示创建即开始 |
| `end_time` | DATETIME | DEFAULT NULL | 报名截止时间，NULL 表示不限 |
| **状态** ||||
| `status` | TINYINT | NOT NULL DEFAULT 0 | 报名表状态：0=草稿，1=已发布，2=已关闭 |
| `created_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### 索引

| 索引名 | 字段 | 类型 | 说明 |
|--------|------|------|------|
| `idx_creator_id` | `creator_id` | INDEX | 按创建者查询 |
| `idx_status` | `status` | INDEX | 按状态筛选 |
| `idx_start_time` | `start_time` | INDEX | 按开始时间排序/筛选 |
| `idx_end_time` | `end_time` | INDEX | 按截止时间排序/筛选 |

### `fields_schema` JSON 结构定义

`fields_schema` 为一个 JSON 数组，每个元素描述一个表单字段：

```json
[
  {
    "key": "name",
    "label": "姓名",
    "type": "text",
    "required": true,
    "placeholder": "请输入您的姓名",
    "validation": {
      "max_length": 50
    }
  },
  {
    "key": "gender",
    "label": "性别",
    "type": "radio",
    "required": true,
    "options": [
      { "label": "男", "value": "male" },
      { "label": "女", "value": "female" }
    ]
  },
  {
    "key": "resume",
    "label": "简历",
    "type": "file",
    "required": false,
    "file_config": {
      "max_size_mb": 10,
      "allowed_types": ["pdf", "doc", "docx"]
    }
  }
]
```

#### 支持的字段类型 `type`

| 类型值 | 说明 | 专属配置 |
|--------|------|----------|
| `text` | 单行文本输入 | `validation.max_length`, `validation.pattern`（正则） |
| `textarea` | 多行文本输入 | `validation.max_length` |
| `number` | 数字输入 | `validation.min`, `validation.max`, `validation.decimal_places` |
| `radio` | 单选 | `options: [{label, value}]` |
| `checkbox` | 多选 | `options: [{label, value}]` |
| `select` | 下拉选择 | `options: [{label, value}]` |
| `date` | 日期选择 | `validation.min_date`, `validation.max_date` |
| `phone` | 手机号输入 | 内置手机号格式校验 |
| `email` | 邮箱输入 | 内置邮箱格式校验 |
| `user_group_select` | 系统锁定意向组别下拉 | 选项由 `user_groups.show=1` 的分组实时生成，不允许手工维护 |
| `file` | 文件上传 | `file_config.max_size_mb`, `file_config.allowed_types` |
| `image` | 图片上传 | `file_config.max_size_mb`, `file_config.max_count` |

#### 字段通用属性

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `key` | string | 是 | 字段唯一标识，用于数据存储的 JSON key |
| `label` | string | 是 | 字段显示标签 |
| `type` | string | 是 | 字段类型，见上表 |
| `required` | boolean | 是 | 是否必填 |
| `placeholder` | string | 否 | 输入提示文本 |
| `description` | string | 否 | 字段说明/帮助文本 |
| `default_value` | any | 否 | 默认值 |
| `validation` | object | 否 | 校验规则，不同类型有不同的校验项 |

#### 系统锁定字段

| key | label | type | 规则 |
|-----|-------|------|------|
| `name` | 姓名 | `text` | 必填，不可删除，不可改类型 |
| `phone` | 手机号 | `phone` | 必填，不可删除，不可改类型 |
| `email` | 邮箱 | `email` | 必填，不可删除，不可改类型 |
| `group_1` | 意向组别(1) | `user_group_select` | 必填，不可删除，不可改类型，选项来自 `user_groups.show=1` |
| `group_2` | 意向组别(2) | `user_group_select` | 必填，不可删除，不可改类型，选项来自 `user_groups.show=1` |

---

## 4. 报名信息表 `registrations`

存储用户提交的报名记录。表单数据以 JSON 整体存储，同时将姓名、手机号、邮箱以及两个意向组别冒泡到独立列以便查询。审核流程按“意向组别(1)”与“意向组别(2)”两个槽位分别推进，总 `status` 由双槽审核结果派生。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | BIGINT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| `form_id` | BIGINT UNSIGNED | NOT NULL, FK → `registration_forms.id` | 所属报名表 |
| `user_id` | BIGINT UNSIGNED | NOT NULL, FK → `users.id` | 报名用户 |
| **表单数据** ||||
| `form_data` | JSON | NOT NULL | 用户填写的完整表单数据（JSON 对象，key 对应 `fields_schema` 中的 key） |
| **冒泡字段**（从 `form_data` 中提取，便于查询和索引） ||||
| `contact_name` | VARCHAR(100) | DEFAULT NULL | 冒泡字段：姓名 |
| `contact_phone` | VARCHAR(20) | DEFAULT NULL | 冒泡字段：手机号 |
| `contact_email` | VARCHAR(255) | DEFAULT NULL | 冒泡字段：邮箱 |
| `group_1` | BIGINT UNSIGNED | DEFAULT NULL, FK → `user_groups.id` | 冒泡字段：意向组别(1) |
| `group_1_status` | TINYINT | NOT NULL DEFAULT 0 | 意向组别(1)审核状态：0=待审核，1=已通过，2=已拒绝 |
| `group_2` | BIGINT UNSIGNED | DEFAULT NULL, FK → `user_groups.id` | 冒泡字段：意向组别(2) |
| `group_2_status` | TINYINT | NOT NULL DEFAULT 0 | 意向组别(2)审核状态：0=待审核，1=已通过，2=已拒绝 |
| **总审核状态** ||||
| `status` | TINYINT | NOT NULL DEFAULT 0 | 报名状态：0=待审核，1=已通过，2=已拒绝，3=已取消 |
| **审核元信息** ||||
| `reviewer_id_1` | BIGINT UNSIGNED | DEFAULT NULL, FK → `users.id` | 意向组别(1)审核人 |
| `reviewed_at_1` | DATETIME | DEFAULT NULL | 意向组别(1)审核时间 |
| `review_remark_1` | VARCHAR(500) | DEFAULT NULL | 意向组别(1)审核备注 |
| `reviewer_id_2` | BIGINT UNSIGNED | DEFAULT NULL, FK → `users.id` | 意向组别(2)审核人 |
| `reviewed_at_2` | DATETIME | DEFAULT NULL | 意向组别(2)审核时间 |
| `review_remark_2` | VARCHAR(500) | DEFAULT NULL | 意向组别(2)审核备注 |
| **最终录取** ||||
| `final_group_id` | BIGINT UNSIGNED | DEFAULT NULL, FK → `user_groups.id` | 最终录取组；待定或未录取时为空 |
| `final_status` | TINYINT | NOT NULL DEFAULT 0 | 最终状态：0=待定，1=已录取，2=未录取 |
| `finalized_at` | DATETIME | DEFAULT NULL | 最终结果确认时间；待定时为空 |
| `finalized_by` | BIGINT UNSIGNED | DEFAULT NULL, FK → `users.id` | 最终结果确认人；待定时为空 |
| **时间戳** ||||
| `submitted_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | 提交时间 |
| `updated_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### 状态枚举

#### 总状态 `status`

| 值 | 标识 | 说明 |
|----|------|------|
| 0 | `pending` | 两个意向组别未全部出结果，或仅有一个槽位已审核 |
| 1 | `approved` | 两个意向组别都已有结果，且至少一个槽位通过 |
| 2 | `rejected` | 两个意向组别都已有结果，且两个槽位均拒绝 |
| 3 | `cancelled` | 已取消 |

#### 槽位状态 `group_1_status` / `group_2_status`

| 值 | 标识 | 说明 |
|----|------|------|
| 0 | `pending` | 待审核 |
| 1 | `approved` | 已通过 |
| 2 | `rejected` | 已拒绝 |

### `form_data` JSON 示例

```json
{
  "name": "张三",
  "phone": "13800138000",
  "email": "zhangsan@example.com",
  "group_1": "11",
  "group_2": "12",
  "direction": "embedded",
  "resume": {
    "file_name": "张三简历.pdf",
    "file_url": "/api/admin/registrations/12/files/resume/0",
    "file_size": 1048576
  }
}
```

### 审核与入组规则

| 规则 | 说明 |
|------|------|
| 提交约束 | `group_1`、`group_2` 必须都来自当前 `user_groups.show=1` 的分组集合，且二者不能重复 |
| 全量审核人 | `super_admin` 与 `admin_scope=global` 的全局管理员可一次性审核当前记录全部待审核槽位 |
| 组内审核人 | 有效管理组中的组长或组内管理员，仅能查看唯一管理组命中的报名，并且只审核命中的待审核槽位 |
| 总状态派生 | 只要任一槽位仍为 `pending`，总状态就是 `pending`；两个槽位都有结果后，若至少一个通过则总状态为 `approved`，若两个都拒绝则总状态为 `rejected` |
| 线上审核 | 两个意向组别的线上审核结果彼此独立；通过只表示可以进入该组面试，不直接修改成员关系 |
| 最终录取 | 第一志愿面试通过优先录取第一志愿；第一志愿未通过且第二志愿通过时录取第二志愿；两组都未通过时最终未录取；其余组合保持待定 |
| 意向与所属组 | `preferred_group_id` 是该次报名的意向组快照，不会自动改写用户当前所属组；历史报名数据保持不变 |

### 索引

| 索引名 | 字段 | 类型 | 说明 |
|--------|------|------|------|
| `uk_form_user` | `form_id, user_id` | UNIQUE | 同一用户同一表单只能报名一次 |
| `idx_form_id` | `form_id` | INDEX | 按报名表查询 |
| `idx_user_id` | `user_id` | INDEX | 按用户查询 |
| `idx_status` | `status` | INDEX | 按总审核状态筛选 |
| `idx_contact_name` | `contact_name` | INDEX | 按姓名搜索 |
| `idx_contact_phone` | `contact_phone` | INDEX | 按手机号搜索 |
| `idx_contact_email` | `contact_email` | INDEX | 按邮箱搜索 |
| `idx_group_1` | `group_1` | INDEX | 按意向组别(1)筛选 |
| `idx_group_1_status` | `group_1_status` | INDEX | 按意向组别(1)审核状态筛选 |
| `idx_group_2` | `group_2` | INDEX | 按意向组别(2)筛选 |
| `idx_group_2_status` | `group_2_status` | INDEX | 按意向组别(2)审核状态筛选 |
| `idx_submitted_at` | `submitted_at` | INDEX | 按提交时间排序 |

### 报名面试表 `registration_interviews`

每条记录保存一份报名在一个意向组中的面试结果，`registration_id + group_id` 唯一。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | BIGINT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| `registration_id` | BIGINT UNSIGNED | NOT NULL, FK → `registrations.id` | 报名记录，删除报名时级联删除 |
| `group_id` | BIGINT UNSIGNED | NOT NULL, FK → `user_groups.id` | 面试组别 |
| `status` | TINYINT | NOT NULL DEFAULT 0 | 0=待定，1=通过，2=未通过 |
| `remark` | VARCHAR(500) | DEFAULT NULL | 面试备注 |
| `interviewer_id` | BIGINT UNSIGNED | DEFAULT NULL, FK → `users.id` | 操作人；重置为待定时为空 |
| `interviewed_at` | DATETIME | DEFAULT NULL | 操作时间；重置为待定时为空 |

---

## 5. 用户组表 `user_groups`

存储用户组的基本信息。每个用户组有名称、描述、分类标签与前台展示标记等属性。`show=1` 的分组会作为报名表“意向组别(1)/(2)”两个系统字段的下拉选项来源。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | BIGINT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| `name` | VARCHAR(100) | NOT NULL, UNIQUE | 用户组名称 |
| `description` | VARCHAR(500) | DEFAULT NULL | 用户组描述 |
| `logo_url` | VARCHAR(255) | DEFAULT NULL | 分组 Logo 相对地址，如 `/upload/config/group/20260418123000_xxx.png` |
| `tags` | JSON | DEFAULT NULL | 分类标签，JSON 数组，如 `["tech", "frontend"]` |
| `is_default` | TINYINT(1) | NOT NULL DEFAULT 0 | 旧默认组标记；当前运行逻辑不读取或更新此字段，保留用于兼容回滚 |
| `show` | TINYINT(1) | NOT NULL DEFAULT 1 | 是否在前台报名表中展示：0=隐藏，1=展示 |
| `status` | TINYINT | NOT NULL DEFAULT 1 | 用户组状态：0=禁用，1=启用 |
| `created_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| `updated_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新时间 |

### 状态枚举

| 值 | 标识 | 说明 |
|----|------|------|
| 0 | `disabled` | 禁用 |
| 1 | `active` | 启用（默认） |

### `tags` JSON 示例

```json
["tech", "frontend", "2026-spring"]
```

### 索引

| 索引名 | 字段 | 类型 | 说明 |
|--------|------|------|------|
| `uk_name` | `name` | UNIQUE | 用户组名称唯一 |
| `idx_show` | `show` | INDEX | 按前台展示状态筛选 |
| `idx_status` | `status` | INDEX | 按状态筛选 |

---

## 6. 用户组成员表 `user_group_members`

记录用户与用户组的关系，同时标记普通成员、组内管理员或组长身份。业务有效状态为未分组或一个启用组；存在多条历史关系的账号进入待确认或管理员清理状态。

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| `id` | BIGINT UNSIGNED | PK, AUTO_INCREMENT | 主键 |
| `group_id` | BIGINT UNSIGNED | NOT NULL, FK → `user_groups.id` | 所属用户组 |
| `user_id` | BIGINT UNSIGNED | NOT NULL, FK → `users.id` | 成员用户 |
| `role` | TINYINT | NOT NULL DEFAULT 0 | 组内角色：0=普通成员，1=组内管理员，2=组长 |
| `joined_at` | DATETIME | NOT NULL DEFAULT CURRENT_TIMESTAMP | 加入时间 |

### 角色枚举

| 值 | 标识 | 说明 |
|----|------|------|
| 0 | `member` | 普通成员（默认） |
| 1 | `group_admin` | 组内管理员，可读成员并处理本组报名/门户内容 |
| 2 | `leader` | 组长，可管理本组成员和组内管理员 |

### 索引

| 索引名 | 字段 | 类型 | 说明 |
|--------|------|------|------|
| `uk_group_user` | `group_id, user_id` | UNIQUE | 同一用户在同一组中只能有一条记录 |
| `idx_group_id` | `group_id` | INDEX | 按用户组查询成员 |
| `idx_user_id` | `user_id` | INDEX | 按用户查询所属组 |
| `idx_role` | `role` | INDEX | 按角色筛选（如查询所有组长） |

当前唯一索引 `uk_group_user(group_id, user_id)` 只防止同一账号在同一组重复插入。生产历史上存在同一账号多组关系，因此本阶段不创建 `UNIQUE(user_id)`。服务端通过锁定用户行并在事务中替换关系来阻止新增重复关系。等启用组关系和停用组关系均完成清理后，先只读确认没有任何重复 `user_id`，再单独发布数据库迁移创建用户级唯一索引。索引创建失败时保留现有关系与应用版本，修复数据后重试；不得自动猜测保留组或删除账号、报名记录。

---

## ER 关系图

```
roles (1) ──────< (N) users
                        │
                        ├── creator_id
                        │       ▼
                        │  registration_forms
                        │       │
                        │       │ form_id
                        │       ▼
                        │  registrations ──── users (user_id, reviewer_id_1, reviewer_id_2)
                        │       │
                        │       └──── user_groups (group_1, group_2)
                        │
                        └── user_id
                                ▼
                        user_group_members >──── (1) user_groups
```

- `roles` 1:N `users` — 一个角色对应多个用户
- `users` 1:N `registration_forms` — 一个管理员可创建多个报名表
- `registration_forms` 1:N `registrations` — 一个报名表对应多条报名记录
- `users` 1:N `registrations` — 一个用户可参与多个报名表（每表限一次）
- `users` 1:N `registrations.reviewer_id_1` / `reviewer_id_2` — 一个管理员可审核多个意向槽位
- `user_groups` 1:N `registrations.group_1` / `group_2` — 报名记录引用两个意向组别
- `users` 0..1:N `user_groups` — 一个用户当前至多属于一个有效组，通过 `user_group_members` 关联；历史异常关系在清理完成前保留
- `user_groups` 1:N `user_group_members` — 一个用户组包含多个成员
- `users` 0..1 `user_group_members` — 一个用户最多一条有效所属组关系；迁移期间允许只读识别历史多组关系

---

## 冒泡字段映射规则

报名信息表中的冒泡字段通过 `fields_schema` 中字段的 `key` 值自动映射：

| 冒泡列 | 对应 form_data 中的 key |
|--------|------------------------|
| `contact_name` | `name` |
| `contact_phone` | `phone` |
| `contact_email` | `email` |
| `group_1` | `group_1` |
| `group_2` | `group_2` |

在后端写入 `registrations` 时，从 `form_data` JSON 中提取对应 key 的值，写入冒泡列。`group_1` 与 `group_2` 会转换为 `user_groups.id` 对应的外键值；若报名表的 `fields_schema` 中不包含该 key，则冒泡列为 NULL。
