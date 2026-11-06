# 招新面试流程浏览器验收

验收日期：2026-10-15
验收环境：本机隔离验收站点 `http://127.0.0.1:8182`，专用数据库 `tarsgo_acceptance`，本地模拟邮箱。使用 `.test` 虚构账号和 `[TEST]` 测试资料；没有访问生产数据，也没有发送真实邮件。

## 验收范围与结果

通过真实浏览器逐步操作学生端和管理员端，检查页面布局、视觉层级、按钮可达性、状态反馈及操作流程。桌面端分别查看黑金与白金主题；重点移动页面以 390px 视口查看。

| 流程 | 实际操作 | 结果 |
| --- | --- | --- |
| 学生报名进度 | 提交虚构报名，查看等待初筛状态 | 正常显示，可在两种主题下查看 |
| 面试确认与预约 | 管理员完成初筛后，学生确认参加、选择测试场次并预约 | 操作完成，预约状态和场次信息有反馈 |
| 管理员工作台与今日名单 | 查看工作台、空列表状态和今日已预约名单 | 桌面两种主题与 390px 移动布局均可访问；筛选、名单和操作入口可用 |
| 候选人详情 | 打开详情抽屉并滚动至底部 | 详情内容可在抽屉内滚动；顶部标题和关闭操作保持可见，底部结果操作可触达 |
| 面试结果 | 分别登记通过、拒绝，查看已处理队列 | 保存成功；通过、拒绝状态均反映在候选人和已处理列表中 |
| 取消与关闭 | 关闭详情抽屉并使用 Escape | 抽屉可关闭；Escape 关闭后焦点回到页面 body，没有恢复到打开抽屉的触发控件 |

面试场次 A 的验收夹具原日期为 `2027-10-15`，因此初始“今日面试”列表为空。为实际检查名单和结果登记流程，本轮通过超级管理员页面暂时将该测试场次改为验收日 `2026-10-15`；完成名单与面试结果验收后，已通过页面保存恢复到原日期，并在页面确认 `面试场次已更新`。截图中 `today-list` 和结果登记场景展示的是临时测试日期下的状态。

## 体验观察

### 效果良好

- 黑金和白金主题都保持清楚的标题、状态提示、筛选区域和候选人列表层级。
- 学生预约完成后可看到已确认状态、所选场次和地点；页面反馈明确。
- 390px 下筛选和候选人内容按窄屏布局排列；列表、详情可通过页面或抽屉纵向滚动访问。
- 候选人详情抽屉在窄屏占满可用高度，滚动后仍能看到标题与关闭入口，底部的通过/拒绝按钮可以实际操作。
- 通过与拒绝保存后，候选人状态和已处理列表随之更新；界面明确说明保存结果不会发送邮件。邮件状态仍是待发送，本次没有打开邮件内容或触发发送。

### 问题与建议

1. **键盘关闭后的焦点位置**：在候选人详情抽屉中按 Escape 后抽屉关闭，但焦点落到 `body`，没有回到打开抽屉的“查看报名资料”按钮。建议在关闭后将焦点还给触发控件，便于键盘用户继续浏览列表。
2. **今日名单依赖场次日期**：固定验收场次日期在未来一年，初次进入时今日名单为空。业务行为符合日期筛选，但测试夹具不适合直接演示今日名单；建议测试数据使用相对当前日期的场次，或在验收步骤中明确调整并恢复日期。
3. **移动端列表需要纵向滚动**：390px 下页面信息较长，筛选和完整表格不会同时落在首屏内。当前可纵向滚动，按钮仍能到达；后续可考虑让筛选区更紧凑或提供更明显的列表定位反馈。

本次覆盖桌面主题与 390px 移动端的指定面试流程；没有开展全站弹窗盘点，也没有对 768px/1024px 或浏览器 125%/150%/200% 缩放作完整矩阵验收。

## 截图

以下文件均为隔离验收站点的真实浏览器截图，按页面状态、主题和视口命名。全页截图带有 `fullpage` 后缀。

| 页面 | 黑金 | 白金 | 移动端 390px |
| --- | --- | --- | --- |
| 学生报名与进度 | [报名表](screenshots/student-registration-form-dark-desktop.jpg)、[等待初筛](screenshots/student-progress-pending-screening-dark-desktop.jpg) | [等待初筛](screenshots/student-progress-pending-screening-light-desktop.jpg) | — |
| 学生面试确认 | [桌面](screenshots/student-interview-confirm-dark-desktop.jpg) | [桌面](screenshots/student-interview-confirm-light-desktop.jpg) | [白金确认](screenshots/student-interview-confirm-light-mobile-390.jpg) |
| 学生选择场次 | — | — | [场次选择](screenshots/student-interview-session-picker-light-mobile-390.jpg)、[已选场次](screenshots/student-interview-session-selected-light-mobile-390.jpg) |
| 学生预约完成 | [桌面](screenshots/student-interview-booked-dark-desktop.jpg)、[移动全页](screenshots/student-interview-booked-dark-mobile-390-fullpage.jpg) | [桌面](screenshots/student-interview-booked-light-desktop.jpg)、[移动首屏](screenshots/student-interview-booked-light-mobile-390.jpg) | [黑金首屏](screenshots/student-interview-booked-dark-mobile-390.jpg) |
| 管理员工作台 | [桌面](screenshots/admin-workbench-dark-desktop.jpg) | [桌面](screenshots/admin-workbench-light-desktop.jpg) | — |
| 今日面试为空 | [桌面](screenshots/admin-interviews-today-empty-dark-desktop.jpg) | [桌面](screenshots/admin-interviews-today-empty-light-desktop.jpg) | — |
| 今日面试名单 | [桌面](screenshots/admin-interviews-today-list-dark-desktop.jpg) | [桌面](screenshots/admin-interviews-today-list-light-desktop.jpg) | [首屏](screenshots/admin-interviews-today-list-dark-mobile-390.jpg)、[全页](screenshots/admin-interviews-today-list-dark-mobile-390-fullpage.jpg) |
| 候选人详情抽屉 | [桌面](screenshots/admin-candidate-interview-detail-dark-desktop.jpg) | [桌面](screenshots/admin-candidate-interview-detail-light-desktop.jpg) | [详情](screenshots/admin-candidate-detail-dark-mobile-390.jpg)、[详情底部与操作](screenshots/admin-candidate-detail-bottom-dark-mobile-390.jpg) |
| 面试结果：通过 | [桌面](screenshots/admin-result-admitted-dark-desktop.jpg)、[底部操作](screenshots/admin-result-admitted-bottom-dark-desktop.jpg)、[移动全页](screenshots/admin-result-admitted-dark-mobile-390-fullpage.jpg) | — | [结果表单](screenshots/admin-interview-result-form-dark-mobile-390.jpg) |
| 面试结果：拒绝 | [桌面](screenshots/admin-result-rejected-dark-desktop.jpg) | — | — |
| 已处理队列 | [桌面](screenshots/admin-interviews-processed-dark-desktop.jpg) | [桌面](screenshots/admin-interviews-processed-light-desktop.jpg) | [首屏](screenshots/admin-interviews-processed-light-mobile-390.jpg)、[全页](screenshots/admin-interviews-processed-light-mobile-390-fullpage.jpg) |

## 测试数据与部署

- 学生和管理员操作均使用带 `[TEST]` 标记的虚构信息；专用验收数据库中保留本轮新增的测试报名、通过/拒绝结果记录，方便查看截图对应状态。
- 已恢复临时调整的测试场次日期；未执行验收数据重置，也未清理模拟邮箱或既有测试资料。
- 没有修改业务代码或数据库结构；没有部署生产。
