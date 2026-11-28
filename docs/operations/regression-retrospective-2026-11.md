# 网站近期 Bug 与返工复盘（2026-10-19—2026-11-19）

## 统计口径

依据 GitHub 仓库 `Tyr1onX/tarsgo-website` 的 PR 创建日期与合并记录，2026-10-19 至 2026-11-19（UTC 日期）共有 **392 个已合并 PR**：`feat` 162、`fix` 138、`refactor` 40、`perf` 34、`chore` 7、`docs` 6、`test` 3、`ci` 1、`revert` 1。**PR 数量不是 Bug 数量；`fix` 不等于线上故障，后续 PR 也不一定说明上一轮实现有错。**

按 PR 正文、差异说明、已提交回归与当前仓库规则核对；线上行为仅在 PR 留有实测记录时引用。未系统重放每个历史版本，也未把 PR 描述中的“待验证”算作通过。

## 有明确证据的缺陷与补救链

| 场景 | 发生了什么 | 根因证据 | 后续验证资产 |
| --- | --- | --- | --- |
| 飞书回调 `#342 → #353 → #354` | 将签名时间戳预先解释为 Unix 整数秒，生产合法回调返回 401 | #353 的脱敏实测确认实际请求不是整数秒；#354 对照官方验签协议，改为直接使用原始字符串验签，去掉未经协议支持的时间窗假设 | `handler/feishu_timestamp_test.go` 覆盖原始签名、篡改、缺失签名头；应以真实飞书回调完成端到端验收 |
| 飞书跨入口评分 `#354 → #355 → #356` | 飞书评分已成功，但从网站直接批改后飞书状态仍旧；“批改下一份”按钮另被表单字段假设拒绝 | #355：网站 Review 未调用飞书同步；#356：独立按钮并不保证携带 `action.name` | 针对两个实际入口的同一结果回归，真实外部触发另核验 |
| 生产 Release 下载 `#352 → #360 → #370` | 匿名 Release 下载间歇性 504，改成 `gh` 后又遇到非 Actions 部署环境未登录，随后切回认证 CLI | 各次 PR 中有真实 HTTP 504、凭据与执行环境不一致记录 | 现有 `scripts/tests/test-production-ops.sh` 覆盖下载失败、校验和/提交匹配与回滚；修改部署脚本前须在目标运行环境确认认证方式 |
| 运营公开 API `#411 → #412` | 前端期望数组，Go 空切片返回 JSON `null`，未登录页面异常 | #412 明确复现 `board.updates.length` 读取 `null` | `handler/operations_public_mariadb_test.go` 加入空列表 `[]` 契约断言 |
| B 站多页采集 `#411 → #413` | 第二页遭遇 HTTP 412 时第一成功页也被丢弃 | 收集逻辑将部分成功当成整批失败，而非返回已获取数据和错误 | 分页成功再失败的 HTTP 与隔离数据库测试；不绕过平台限制 |
| 长期请假权限 `#423 → #424` | 新增“一次性”授权时将历史无时段的 `approved` 全部视为失效，原有长期授权用户不能继续使用 | #423 明确改变旧权限语义，#424 根据历史状态恢复长期/临时两种区分 | `service/leave/access_test.go` 等覆盖旧数据、一次性消耗和长期授权 |
| 培训资料访问 `#484 → #485` | 直接沿用工作台门槛，注册但未入组的新用户看不到本来面向其开放的资料 | 误用 `workbenchAccess` 表达“登录后可读” | 登录、无组别、已有成员及其他受保护路由的权限回归 |
| 培训文档图像 `#489 → #501` | 编辑器保存了宽度/对齐元数据，但阅读页重新解析 Markdown 时强制图片满宽 | 编辑与阅读两套渲染路径未复用同一图片元数据解释规则 | `training-documentation.test.mjs` 检查持久化后的展示规则；仍需真实浏览器视觉验收 |
| 运营操作权限 `#461 → #487 → #500` | 普通运营成员曾获得管理作品/分工/删除等过宽操作，另一方面未指派环节的运营成员又不能更新状态 | “管理事项”“更新进度”“参考负责人”三种职责被混用作授权 | `operations_permissions_test.go` 现按超级管理员/运营组/其他组和管理/更新动作校验，禁止在状态接口注入其他字段 |
| 培训成绩 `#447 → #466` | 历史成员进入排名、未批改提交遗漏，“没有成绩”和“有效零分”含义混淆 | 先后澄清“实际参训”资格、已提交待批改、逾期零分、历史 NULL 待核实与晚加入边界 | `training-assessment-summary.test.mjs` 已建立业务口径回归 |

参考 PR：https://github.com/Tyr1onX/tarsgo-website/pulls?q=is%3Apr+is%3Amerged 。具体证据以上述编号的 PR 正文、代码差异与关联测试为准。

## 不应与 Bug 混为一谈的迭代

- **显式回滚：** #231 认证预加载实验实测没有可靠收益，#232 移除。属于有观测、有退出条件的正确回滚，不是必然可预防的失败。
- **用户目标变化：** #411、#414、#415 将运营动态先放前台、后转到介绍页、最后转入后台；#461、#465、#475、#487 连续精简运营执行路径。既有真实需求澄清，也有过度拆页造成的返工，不能全按技术缺陷计算。
- **视觉收敛：** #457—#462 的主题开关经历视觉恢复、降重绘、阴影处理和胶囊裁剪。#460 扩大画布只修复矩形截断，#462 才对准“外部像素必须透明”的要求。PR 记录多次写明未进行真实浏览器视觉验收，源码断言不能证明最终像素。
- **资料编辑工作流完善：** #489、#491、#496、#499、#501、#502 的部分修改属于逐步增加文档树、折叠和工具栏功能；其中读写不一致、组件卸载丢状态、粘性工具栏与滚动容器冲突是可用跨路径交互检查更早发现的问题。
- **部署开销收敛：** #382 跳过纯 Markdown 生产部署，#430 进一步跳过生产构建和 Release 发布，属于循证优化，不宜定性为两次修同一 Bug。
- **安全风险提醒：** #329 曾为飞书试点删除回调身份校验，PR 自己明确承认冒用管理员评分的风险。后续 #342/#354 建立签名与权限验证。以后不能将“暂时打通接口”当作永久放宽身份认证的理由。

## 共性根因：区分事实与推断

1. **已证实：跨系统/跨入口行为契约缺失。** #342/#354、#355/#356、#411/#412、#489/#501 都表现为模块各自通过测试，但组合后的输入、输出或展示语义不一致。
2. **已证实：历史业务语义没有随新功能一起回归。** #423/#424 的长期授权、#447/#466 的统计分母、#461/#500 的权限矩阵均有具体行为变化证据。
3. **已证实：外部真实环境和模拟环境存在差异。** 飞书回调、飞书应用权限（#495/#498）、Release 认证下载（#352/#360/#370）、B 站 HTTP 412 都有线上或真实接口佐证。
4. **已证实：静态结构测试无法覆盖全部浏览器视觉/交互结果。** 前端使用 `node --test`，多个 PR 明确只完成源代码断言、未做登录后浏览器验收；#460/#462 展示了该盲区。
5. **合理推断，而非完全证实：需求决策容易被切成连续的局部 PR。** 运营和培训文档的一些新入口很快被撤回或重排，但无法仅凭 PR 标题证明所有返工本可避免。治理应从一个真实主流程、角色与验收结果出发，不预先设计扩展体系。

## 本轮沉淀与使用方式

- **项目规则：** 根目录 `AGENTS.md` 的“防重复返工与回归约束”，将变更链检查、权限/数据语义、跨入口回归、真实外部协议、浏览器验收和变更状态区分写成统一要求。
- **自动化复用：** 优先复用已有 `production-ops.yml` 的 Go、前端、隔离 MariaDB、生产脚本检查，以及历史 PR 已补充的具体回归测试。没有证据表明需要第二套测试框架或每次 PR 都运行昂贵的全站端到端套件。
- **条件触发的真实验收：** 第三方回调与数据同步必须检查真实、脱敏的协议样本和目标授权；视觉/拖拽/滚动变更必须使用浏览器核对关键交互。无法执行时说明未验证，不能宣称成功。
- **每次重复修复：** 先核对前一 PR 的假设和证据，给旧代码可复现且新代码通过的最小回归，再对准根因修复；替换的旧逻辑应同步删除。

## 下次复盘判断是否真的有效

仅追踪三个有意义的信号，避免建立额外埋点系统：

1. 同一模块合并后 7 天内，是否又出现修复同一行为的 PR（人工区分新增需求与回归）。
2. 生产问题是否首次发生于“CI 通过、但真实浏览器/第三方入口未经验证”的边界。
3. 同一问题是否已经存在回归测试或规则却仍再次发生：若有，直接修正规则执行或测试覆盖，而不是新建另一套规范。

不把 PR 数量、修复标题数或 CI 通过率单独当作质量结论。

## 2026-11-28 补充：历史数据库结构核查

核查基线：main `2196687`；本地隔离 MariaDB 的 `schema_migrations` 共 98 条、最高版本 98。随后通过既有生产 SSH 入口，使用应用数据库账号，在只读事务中以同口径执行聚合查询（单条查询上限 5 秒）。生产迁移版本同为 98；未读取个人记录、未执行写入或 DDL。

| 结构 | 隔离库实测 | 生产实测 | 当前依赖与处置 |
| --- | --- | --- | --- |
| 五张 `skill_*` 表、三张旧 `capability_*` 表 | 各 0 行；无指向这些表的外键 | 各 0 行；无指向这些表的外键 | v21/v31 创建，v49 清除；历史迁移及退役回归测试仍使用，暂不删除 |
| `registration_interviews`、旧双志愿字段 | 面试表 0 行；16 条报名中旧字段有效记录 0 条 | 面试表 0 行；旧字段有效记录 0 条 | v1/v51 及旧报名迁移仍依赖；需保持历史重放能力 |
| `registration_legacy_archives` | 0 行 | 548 行 | `recruitmentanalytics/service.go` 和 `recruitmentrecords/service.go` 仍读取；必须保留 |
| `legacy_assignment_target_archives` | 0 行 | 573 行 | v75/v76 保存历史作业受众快照；空测试库不能证明生产档案可删除 |
| `daily_signals`、`assignment_late_windows` | 表均不存在 | 表均不存在 | v79/v66 已完成退役；保留早期创建及后续清理迁移，不再重复删除 |
| `user_groups.is_default`、`users.management_group_id` | 默认组 0 行；非空管理组字段 0 行 | 默认组 0 行；非空管理组字段 7 行 | v87–v90 处理历史引用；现行认证不再依据旧管理范围字段，仍保留迁移兼容 |
| `group_capability_dimensions`、`group_capability_ratings` | 各 0 行 | 各 0 行 | 现行培训评价表，不能与 v49 的旧能力表混淆 |

以下 SQL 已在隔离库验证，并在生产以同口径完成只读核查。表不存在时记录不存在，不重新创建。生产中两个历史归档共有 1,121 行，不能删除；8 张退役学习表可列入结构退役候选，但仍需验证历史重放、上一稳定版本兼容及备份恢复。

```sql
START TRANSACTION READ ONLY;
SELECT COUNT(*), MAX(version) FROM schema_migrations;
SELECT TABLE_NAME FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('skill_review_events','skill_node_progress',
    'skill_node_assignments','skill_node_prerequisites','skill_nodes',
    'capability_manual_reviews','capability_dimension_sources','capability_dimensions',
    'registration_interviews','registration_legacy_archives',
    'legacy_assignment_target_archives','daily_signals','assignment_late_windows',
    'group_capability_dimensions','group_capability_ratings');
-- 对存在的候选表逐一执行 SELECT COUNT(*)，不要用估计行数替代。
SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA=DATABASE()
  AND REFERENCED_TABLE_NAME IN ('skill_review_events','skill_node_progress',
    'skill_node_assignments','skill_node_prerequisites','skill_nodes',
    'capability_manual_reviews','capability_dimension_sources','capability_dimensions');
SELECT COUNT(*) FROM user_groups WHERE is_default=1;
SELECT COUNT(*) FROM users WHERE management_group_id IS NOT NULL;
SELECT COUNT(*) FROM registrations
WHERE group_1 IS NOT NULL OR group_2 IS NOT NULL OR final_group_id IS NOT NULL
   OR group_1_status<>0 OR group_2_status<>0 OR status<>0 OR final_status<>0
   OR reviewer_id_1 IS NOT NULL OR reviewer_id_2 IS NOT NULL
   OR review_remark_1 IS NOT NULL OR review_remark_2 IS NOT NULL
   OR reviewed_at_1 IS NOT NULL OR reviewed_at_2 IS NOT NULL
   OR finalized_at IS NOT NULL OR finalized_by IS NOT NULL
   OR JSON_CONTAINS_PATH(form_data,'one','$.group_1','$.group_2');
ROLLBACK;
```

**删除门槛：** 生产只读计数、显式外键及应用层隐式引用均须核查；已有归档或现行业务依赖的结构必须保留。即使确认空表，也须以新迁移处理、验证从空库完整重放及已有库升级；不得删除旧迁移、修改旧版本内容或借外键级联清理业务记录。本轮已完成生产只读核查；不执行任何结构或数据删除。未验证删除后的旧版本回滚及备份恢复，不新增迁移。
