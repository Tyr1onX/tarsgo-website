# TARSGO · 吉林大学吉甲大师战队官网

吉林大学吉甲大师（TARS-Go）战队的官方网站与管理平台。

**从认识战队、报名招新，到成员培养和日常协作，使用同一套网站与账号体系。** 这里既有面向访客的公开内容，也有按身份和组别授权的成员工作台。

[访问官网](https://jijiamaster.com) · [反馈问题](https://github.com/Tyr1onX/tarsgo-website/issues) · [参与贡献](CONTRIBUTING.md)

## 功能模块

### 01 · 战队展示

面向所有访客，无需登录。

- **认识吉甲**：战队介绍、组别分工与团队实践。
- **机器人展示**：浏览 2024—2026 赛季机器人照片。
- **赛事与荣誉**：按年份查阅赛事记录、奖项与相关材料。
- **团队历程**：回顾战队发展、历史事件与影像资料。
- **加入我们**：了解五个组别与招新流程；另设低空智能感知与控制微专业专题页。

入口：[首页](https://jijiamaster.com/) · [机器人](https://jijiamaster.com/robots) · [赛事与荣誉](https://jijiamaster.com/events-and-honors) · [团队历程](https://jijiamaster.com/team-history) · [加入吉甲](https://jijiamaster.com/join)

### 02 · 招新全流程

从候选人报名到管理端处理结果，减少表格、通知和人工核对之间的割裂。

- **候选人**：在线填写报名表、查看报名状态、确认面试参与意向与预约面试场次。
- **招新管理**：配置届次和报名字段、初筛报名、管理面试场次、记录或更正面试结果。
- **结果通知**：预览并发送面试结果通知，维护各组录取通知所用的群二维码。
- **数据分析**：查看各届报名与录取趋势、组别意向变化。

相关入口：[招新页面](https://jijiamaster.com/join) · 登录后的**招新管理**与**招新数据分析**。

### 03 · 新人培养与个人成长

面向机械、电控、视觉、AI 四个技术组，复用官网账号和组别权限。

- **作业管理**：管理员按组发布作业，可面向全组或指定成员；成员提交附件，管理员批改、评分、通过或退回重做，保留提交和批改记录。
- **提问答疑**：组内提问、讨论与追问，支持公开或私密问题、附件、解决状态和 FAQ 沉淀。
- **技能树**：管理员配置技能节点、前置关系、通过标准与关联作业；成员查看所属组的路线并发起挑战，由管理员依据记录确认或撤销掌握状态。
- **我的成长**：汇总个人入组、作业、答疑、技能审核及适用的周报事件，形成可追溯的成长时间线。

> 技能树提供配置和审核能力；具体节点与标准由各组管理员建立，并非预置了一套已完成的技能课程。运营组不使用技术组作业与答疑功能。

### 04 · 成员工作台与团队运营

- **每日通信**：记录当日状态，按日历回顾个人通信记录。
- **工作周报**：填写本周完成事项、遇到的阻塞与下周计划，按周查看团队提交情况。
- **请假工作台**：维护请假资料，按权限使用请假申请、材料生成和记录查询功能。
- **账号与组别**：邮箱登录与注册、账号切换、所属组别确认；管理员按角色管理账号和相关业务。

所有成员功能均由服务端校验身份、角色和所属组别；公开页面和内部工作台相互区分。

## 技术实现

| 层次 | 技术 |
| --- | --- |
| 前端 | React 19、React Router 7、TypeScript、Tailwind CSS 4、Vite |
| 后端 | Go 1.25、Gin、GORM |
| 数据库 | MariaDB 11.4 |
| 开发与部署 | pnpm、Make、Docker Compose、GitHub Actions |

```text
internal/
  frontend/    官网与成员工作台
  backend/     API、权限、业务与数据访问
database/      本地数据库配置及迁移相关文件
public/        官网静态素材
scripts/       开发、测试及运维脚本
docs/          设计、验收、部署和素材规范
```

本仓库是**吉甲官网的主开发仓库**；历史仓库 [`Tyr1onX/TarsGo`](https://github.com/Tyr1onX/TarsGo) 不再作为新功能入口。本项目也**不是**独立的 TARS Base / `tarsgo-base`。

## 本地运行

适用于 macOS / Linux。需要 Git、Make、Docker Compose v2、Go **1.25+**、Node.js **22** 与 pnpm **9.15.4**。

```bash
git clone git@github.com:Tyr1onX/tarsgo-website.git
cd tarsgo-website
make env       # 创建本地后端配置，按需要检查 .env
make install   # 安装前后端依赖
make db-up     # 启动本地 MariaDB（默认 127.0.0.1:3307）
make backend   # 后端：http://127.0.0.1:8080
```

在另一个终端运行：

```bash
make frontend  # 前端：http://localhost:5173
```

前端开发服务会将 `/api` 和 `/upload` 代理到本地后端。`make db-down` 可停止本地数据库。Windows 另有 `scripts/start-db.ps1` 数据库启动脚本；上述 Make 流程以 macOS / Linux 为主。

**仅使用本地或隔离测试数据。** 不提交 `internal/backend/.env`、生产密钥、真实报名资料或其他个人信息。

## 参与开发

无论开发、运营、内容、设计还是测试，都可以从一个范围明确的小任务开始：

1. 在 [Issues](https://github.com/Tyr1onX/tarsgo-website/issues) 确认任务、负责人和验收标准。
2. 从最新 `main` 创建独立分支，完成修改和必要验证。
3. 提交 [Pull Request](https://github.com/Tyr1onX/tarsgo-website/pulls)，用中文说明背景、修改、验证、结果与备注；经审查后合并。

常用检查：

```bash
make backend-test
make frontend-check
# 前端单元测试按修改范围选择对应脚本：
cd internal/frontend
pnpm run test:workbench
pnpm run test:growth
pnpm run test:skills
```

文档修改无需为此启动生产环境；在 PR 中如实说明已执行和未执行的验证。完整规则参见 [贡献指南](CONTRIBUTING.md)，自动化检查见 [Actions](https://github.com/Tyr1onX/tarsgo-website/actions)。

## 文档与许可

- [验收环境](docs/acceptance-environment.md) · [生产部署与回滚](docs/production-deployment.md)
- [品牌、图片及素材使用说明](docs/brand-and-asset-rights.md)
- 代码采用 [MIT License](LICENSE)；战队名称、标志、照片、证书及第三方素材**不随代码获得 MIT 复用许可**。
