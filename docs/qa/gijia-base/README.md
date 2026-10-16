# 吉甲基地 · 信息架构与入口说明

吉甲基地是官网面向公众的参与空间；当前唯一开放的互动功能是每日通信。官网内容仍按「了解吉甲、参与吉甲、管理吉甲」组织，但不要求首页机械地拆成三个大区块。

## 三个空间

| 空间 | 承载内容 | 当前入口 |
| --- | --- | --- |
| 了解吉甲 | 战队介绍、机器人、赛事荣誉、团队历程、纳新与低空微专业 | 首页六个图像专题、现有栏目与页脚链接 |
| 参与吉甲 | 吉甲基地及当前开放的互动内容 | 主导航「吉甲基地」和首页横向基地专题 |
| 管理吉甲 | 个人工作台、成员管理和后台事务 | 登录后的顶部个人身份菜单 |

## 首页视觉与内容入口

- 首页六个主要入口恢复到 PR #77 之前的真实照片拼贴布局；基准取自提交 `b1f95a8`（PR #76），没有凭印象重绘。保留原入口和链接：认识吉甲、机器人展示、加入吉甲、赛事与荣誉、团队历程、低空微专业。
- 复用原首页已经使用的素材与图像裁切关系，不更换或修改原照片。桌面以不等宽拼贴形成错位节奏，平板调整为三列，窄屏转单列。
- 吉甲基地作为六图之后的横向专题区域融入首页，以低对比同心圆／雷达图形和「从每日通信开始」引导参与；不再使用右侧大型独立卡片。
- 首页不放个人工作台大卡片。工作台进入顶部身份菜单；访客在顶部看到登录入口。
- 低空微专业的持久顶部金色按钮已移除，链接仍保留在首页真实内容入口、页脚和其原有页面。

## 吉甲基地与身份状态

- `/base` 对访客公开。访客看到欢迎介绍、每日通信说明和登录引导，不出现个人侧栏或空白个人热力图。
- 已登录用户进入 `/base` 后直接打开个人每日通信工作空间，包含左侧侧栏、签到终端和年度热力图；侧栏当前只显示「每日通信」。
- `/daily-signal` 旧地址兼容并重定向至 `/base`。工作台保留每日通信快捷入口。
- 顶部保留 TARS-Go 战队品牌标识。只有账号状态明确为已分配、且唯一组别名称匹配现有组标时，才显示对应正式组标：机械、电控、视觉、AI、运营。未分组、待确认、未知组别和历史多组账号使用普通身份样式。组标文件与几何没有改动。
- 账号切换时立即清除旧账号的基地记录和组标，重新读取当前会话；异步返回的旧账号资料不能覆盖新账号。
- 首页、基地和身份菜单都复用既有路由、主题和权限规则，没有添加规则竞技场、基地档案等不可用入口。

## 视觉、响应式与无障碍

- 延续白金与黑金两种主题、现有字体与内容宽度。首页专题区使用已有表面和边框 token；雷达装饰保持静止，交互动效只用于短距离的箭头反馈。
- 小屏首页将六个真实照片入口纵向呈现，基地专题不压缩图片网格；基地侧栏使用折叠导航，不挤压通信内容。
- 导航和个人菜单支持键盘打开、方向键移动、Home/End 跳转、Escape 关闭并恢复焦点；控件有可见焦点和明确状态。关闭账号菜单或切换断点时，焦点保持在可见位置。
- 尊重 `prefers-reduced-motion`；核心文案、状态与可访问名称不依赖动画。

## 功能边界与待确认事项

本轮只是导航、身份展示和公开界面层的结构优化。每日通信的保存接口、签到日期、隐私规则、情绪保存与删除、数据库和部署均未修改。正式功能的产品边界与数据规则见[每日通信 P1 说明](../daily-signal/p1-implementation.md)。

目前产品规格中已有以下决定：任何访客均可浏览，登录用户才能写入；以服务端 `Asia/Shanghai` 日期为日界线；历史情绪仅本人可见，管理员也不能读取他人情绪。仍应在扩大使用范围前确认：

1. 每日通信数据的长期保留期限，以及账号注销与正式删除请求的处理口径。
2. 是否始终保持仅本人查看个人历史情绪，以及未来是否需要不含情绪的匿名聚合。
3. 是否支持撤回签到日期；当前保留日期、只允许删除自愿填写的历史情绪。
4. 未来若扩展互动内容，是否沿用「所有人可浏览、账号写入、个人记录隔离」的边界。
5. 当前日界线已确定为北京时间；若未来主要面向海外成员，是否仍保持该统一时区（当前功能继续按北京时间执行）。

以上事项没有在本轮改变；也没有新增任何公共情绪聚合、积分、排行榜或考勤。

## 浏览器验证

验证使用本地隔离站点和内存模拟接口，用户、组别、签到日期和情绪均为虚构数据；没有连接生产服务或数据库。

2026-10-16 在 Google Chrome 155.0.8059.82 中完成手动验收与可复现的浏览器检查：

- 通过 Git 历史检出 `b1f95a8`，与当前首页在 1440px 和 390px 宽度下对照；六个入口和六张原照片一致。当前首页多出融入式基地横向专题。
- 桌面端 1440×1200、移动端 390×1900 查看首页；白金与黑金两套主题均呈现正常。基地访客页另在 390×844 白金验收，已登录空间在 1440×1000 黑金验收。
- 访客页面没有基地侧栏或个人档案；已登录成员显示侧栏、今日信号与个人热力图。移动登录导航显示虚构机械组徽章且触控区域不小于 44×44px。
- 在真实账号切换流程中从虚构机械组切至 AI 组，重新进入 `/base` 后身份徽章和当前情绪状态已更新。历史多组账号展示普通成员身份，不错误选用单个组标。
- 热力图悬停已保存情绪、无情绪和空白日期时，日期详情均为 108px，保留行均为 48px；页面总高度和 `scrollY` 不变。桌面个人菜单方向键与 Escape、移动菜单 Escape 关闭和焦点恢复均通过。
- `/daily-signal?from=legacy#archive` 跳转到 `/base?from=legacy#archive`。首页及基地检查未发现脚本运行错误；访客端用于识别未登录状态的预期 401 请求单独排除。
- 在 `prefers-reduced-motion: reduce` 模式下确认命中减少动态效果样式；首页和访客基地均无文档横向溢出。

| 场景 | 截图 |
| --- | --- |
| PR #77 前首页 · 桌面白金 | [homepage-before-pr77-desktop.jpg](./screenshots/homepage-before-pr77-desktop.jpg) |
| PR #77 前首页 · 移动白金 | [homepage-before-pr77-mobile.jpg](./screenshots/homepage-before-pr77-mobile.jpg) |
| 当前首页 · 桌面白金 | [homepage-after-desktop-platinum.jpg](./screenshots/homepage-after-desktop-platinum.jpg) |
| 当前首页 · 桌面黑金 | [homepage-after-desktop-black-gold.jpg](./screenshots/homepage-after-desktop-black-gold.jpg) |
| 当前首页 · 移动黑金 | [homepage-after-mobile-black-gold.jpg](./screenshots/homepage-after-mobile-black-gold.jpg) |
| 移动顶部身份与机械组标（虚构账号） | [homepage-after-mobile-member-identity.jpg](./screenshots/homepage-after-mobile-member-identity.jpg) |
| 基地访客页 · 移动白金 | [base-guest-mobile-platinum.jpg](./screenshots/base-guest-mobile-platinum.jpg) |
| 每日通信工作空间 · 桌面黑金（虚构账号） | [base-member-desktop-black-gold.jpg](./screenshots/base-member-desktop-black-gold.jpg) |

这些是本地浏览器截图，不代表生产环境验收；本轮未连接生产，也未部署。

## 导航与基地视觉精修（2026-10-16）

- 顶部身份按「确认中、访客、已登录」分别呈现。查询期间使用固定尺寸的状态位；登录后的组别也先保留身份行，再显示正式组标，减少内容闪现与导航位移。账号切换时立即关闭个人菜单并清除旧身份，再展示新账号资料。
- 个人菜单收窄到 240px，压缩身份区和菜单项间距，保留工作台、切换账号和登出三项权限入口；菜单项仍有清晰焦点反馈和至少 40px 的操作高度。
- 首页基地专题改为文案与雷达图并列的稳定比例，增加与「错位的秩序」对应的轴线、定位点和每日通信标识。图形不使用持续动画；悬停只轻微提亮边框与雷达。六张真实照片的来源、顺序和拼贴结构未改动。
- 每日通信终端补充静态细轴与信号定位细节；鼠标悬停时轻微提亮，键盘聚焦保留主题焦点环，减少动态效果设置继续生效。
- 本轮仅涉及导航和视觉层；没有改变登录权限、签到请求、签到日期、情绪规则或数据库。

### 真实浏览器验收

在 Google Chrome 155.0.8059.82 中，通过本地生产构建预览完成检查。认证、组别及签到请求由浏览器内存拦截器提供；测试账号使用 `example.invalid` 邮箱，签到数据只存在于本次页面状态，没有连接生产服务或数据库。

- 首页 1440px 桌面端对比白金、黑金两主题，390px 移动端检查白金主题；先滚动页面以加载照片后截图。与最新 main 的首页截图对比，六个真实照片入口的素材、顺序和布局保持一致，基地专题只在其后增加横向区域。
- 基地 1440×1050 黑金桌面与 390×844 白金移动端检查；虚构成员选择「稳定运行」并签到后，今日热力图方块点亮。桌面和移动端均无文档级横向溢出。
- 人为延迟登录响应 650ms，确认访客和成员加载期间认证区宽度均稳定为 220px；访客最后显示登录/注册，成员显示头像与组标。虚构账号从机械组切到 AI 组时，旧昵称与组标在重新确认阶段消失，随后显示新账号信息。
- 桌面个人菜单通过方向键打开、菜单项焦点移动和 Escape 关闭并恢复焦点；移动主导航通过 Escape 关闭。`prefers-reduced-motion: reduce` 下终端过渡时间为 `0.01ms`。
- 浏览器未发现脚本运行异常或非预期控制台错误。访客检查中可见的 401 仅来自预期的匿名 `/api/me` 认证探测。
- 前端 82 项自动化测试通过；React Router 类型检查及生产构建通过。

| 场景 | 截图 |
| --- | --- |
| 首页 · 桌面白金（完整页面） | [visual-polish-home-desktop-platinum.jpg](./screenshots/visual-polish-home-desktop-platinum.jpg) |
| 首页 · 桌面黑金（完整页面） | [visual-polish-home-desktop-black-gold.jpg](./screenshots/visual-polish-home-desktop-black-gold.jpg) |
| 首页 · 移动白金（六张真实照片与基地专题） | [visual-polish-home-mobile-platinum.jpg](./screenshots/visual-polish-home-mobile-platinum.jpg) |
| 基地专题 · 桌面白金 | [visual-polish-base-feature-desktop-platinum.jpg](./screenshots/visual-polish-base-feature-desktop-platinum.jpg) |
| 基地专题 · 桌面黑金 | [visual-polish-base-feature-desktop-black-gold.jpg](./screenshots/visual-polish-base-feature-desktop-black-gold.jpg) |
| 个人身份菜单 · 桌面黑金 | [visual-polish-profile-menu-crop-black-gold.jpg](./screenshots/visual-polish-profile-menu-crop-black-gold.jpg) |
| 已登录每日通信 · 桌面黑金（虚构账号） | [visual-polish-base-member-desktop-black-gold.jpg](./screenshots/visual-polish-base-member-desktop-black-gold.jpg) |
| 已登录每日通信 · 移动白金（虚构账号、减少动态效果） | [visual-polish-base-member-mobile-platinum.jpg](./screenshots/visual-polish-base-member-mobile-platinum.jpg) |

截图仅用于本地视觉评审，不代表生产验收；本轮未部署。
