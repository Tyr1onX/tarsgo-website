# #718 最终构建工程验收

基线 c2b090e；同步 main b80a865。前端生产构建（pnpm build）以本地 HTTP 服务提供；Chrome Headless 通过 CDP 实际鼠标、键盘、触控输入，不直接修改裁判状态，不加速比赛时间。此轮本地为访客，API 401 夹具，不冒充真实登录；此前 c2b090e 的 CI #46120398151 已成功，包含真实登录浏览器与 85 项数据库测试。新 Head 的 CI 结果以 PR 检查为准。

## 最终教学画面与连续录像

| 阶段 | 桌面 1280×800 | 手机模拟 390×844 |
|---|---|---|
| 场外实体控制台 | [桌面](desktop/00-console.jpg) | [手机](mobile/00-console.jpg) |
| 目录 | [桌面](desktop/01-catalog.jpg) | [手机](mobile/01-catalog.jpg) |
| 1 规则介绍 | [桌面](desktop/02-introduction.jpg) | [手机](mobile/02-introduction.jpg) |
| 2 实体定位 | [桌面](desktop/03-entity.jpg) | [手机](mobile/03-entity.jpg) |
| 3 动态演示、双方争夺暂停 | [桌面](desktop/04-contest.jpg) | [手机](mobile/04-contest.jpg) |
| 3 红方临时控制 | [桌面](desktop/05-demo-capture.jpg) | [手机](mobile/05-demo-capture.jpg) |
| 3 撤离 | [桌面](desktop/06-demo-withdraw.jpg) | [手机](mobile/06-demo-withdraw.jpg) |
| 4 准备接管 | [桌面](desktop/07-practice-ready.jpg) | [手机](mobile/07-practice-ready.jpg) |
| 4 实际操作 | [桌面](desktop/08-practice-driving.jpg) | [手机](mobile/08-practice-driving.jpg) |
| 4 占领成功 | [桌面](desktop/09-practice-capture.jpg) | [手机](mobile/09-practice-capture.jpg) |
| 5 结果反馈 | [桌面](desktop/10-result.jpg) | [手机](mobile/10-result.jpg) |

- [连续浏览器录像 MP4](desktop/teaching.mp4)：CDP Page.startScreencast 实际采集 1426 帧，按原时间戳编码为 1152×720、15fps、56.6秒；覆盖目录至实践结果，非截图拼接，无音轨。
- [横屏规则介绍](mobile/12-landscape-introduction.jpg)、[横屏结果](mobile/11-landscape-result.jpg)（844×390）；[正常比赛](desktop/11-match.jpg)。
- [桌面原始状态及布局记录](desktop/trace.json)、[移动端原始状态及布局记录](mobile/trace.json)。

桌面实际演示/实践各出现一次红方临时控制及蓝方完全控制事件，前哨始终蓝方拥有、1000 HP；五阶段完成，退出教学后实际开始正常比赛。移动端以触控摇杆独立完成同一闭环，并检查横屏规则介绍及结果（横屏未完整重新驾驶）。实际裁判与同一 canvas/renderer 保持，未切换独立教学场景。八章目录仅一个开放按钮。暂停期间进度/时间不变，继续恢复。桌面计分栏各队三指标横向排布；手机采用队名与三指标紧凑两层排布，390px 视口五位血量数字较紧凑但无视觉重叠，实际操作中摇杆、按钮、准星、教学说明可见。尚未在实体 iOS/Android 上验证，不以模拟视口替代真机。

## 比赛准备阶段驾驶

根因：赛前旧 render 将墙钟间隔直接截断为 50ms，低帧率下剩余时长丢失；按下/释放前未推进上一段输入时间。修复只在 ready 阶段按真实时间积分，以 ≤50ms 子步调用原有运动与瞄准。正式比赛固定步长裁判、运动函数、速度参数不变。

[原始对照](preparation-movement.json)：Chrome headless、1184×800、每组重新加载相应生产构建、接管同一红方 03 步兵，从相同出生点同向 W 约 1 秒。RAF 门控 0/50/100ms，实际平均帧率按帧间隔计算；距离为实际渲染相机坐标差，延迟/渲染耗时不等同硬件端到端延迟或 GPU 完成时间。

| RAF 门控 | c2b090e 距离 / 实际 FPS | 修复距离 / 实际 FPS |
|---|---|---|
| 0ms | 1.742m / 25.2 | 2.005m / 27.0 |
| 50ms | 1.135m / 13.7 | 2.001m / 12.8 |
| 100ms | 0.361m / 7.6 | 1.989m / 7.7 |

六组比赛时间均保持 420s；修复后低帧率与正常组距离差约 0.8%，为单次受控对照而非统计置信结论。观察者修复保持原实现；历史观察者对照见上级目录。

## 学习效果与发布

规则依据与课程标准见 [现有规则审计中的八章建设主线](../../rmuc-2027-referee-coverage.md)。规则引用以 PDF V1.0.0（SHA256 见规则审计）及 11-27 留存官方答疑记录为依据，未修改既有裁判结算规则。真实零基础体验者未参加本次测试，未取得独立学习与复述结论，不能认定已完成发布验收。真实用户需按文档试学方案另行组织。未合并、未部署。
