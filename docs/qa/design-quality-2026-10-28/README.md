# 吉甲官网设计质量审计（2026-10-28）

## 范围与依据

基线为最新 `main`：`015c0fdb96c11c304a7a900320a30bc7371b6dc3`（PR #145）。检查前阅读仓库 AGENTS、贡献指南、部署流程、`docs/performance/2026-10-16-site-audit.md`，并查阅 #104 图片指纹、#113/#114 导航性能、#145 首页拆包等 PR。已有样式变量、后台视觉规范和 QA 文档，未发现统一 DESIGN.md；本轮只补充一份根目录索引式规范，不引入设计系统依赖或检测配置。

采用 Impeccable 的可访问性、性能、主题、响应式、实现完整性五个检查维度。现有黑金/白金主题、Inter/Anton/Geist Mono 字体、页面布局、六图导航、沙粒算法、视频、页脚 BCD 沙痕不做重新设计。未以工具审美提示判断品牌对错，不给未完全覆盖的全站标注 WCAG 合规分数。

## 已验证问题与修复

| 优先级 | 问题与代码位置 | 复现证据 | 根因与修复 |
| --- | --- | --- | --- |
| P1 | 证书列表长时间空白；`app/components/events-and-honors-archive.tsx` 原列表 img | 生产 Chrome 到达证书区时触发 18 个原图请求；首张 #42 在约 9.8、19.8、49.9 秒快照中 `complete=false`，但已能读到 2150px 自然宽度；截图见 production-certificate-waiting.jpg，逐请求证据见 certificate-network.json | 列表复用完整扫描原图；WebP 尚未完整传输/解码时显示背景。#42 为 588,130 bytes，完整下载 SHA256 与仓库一致。改为 640px 最长边缩略图，继续原生 lazy/async；弹窗与原图链接保留原扫描。未添加超时、重试或占位状态。 |
| P1 | 小字对比度不足；`app/app.css` 的 `.navbar-system-theme__state`、`.robot-gallery__filter-count` | 构建前 Chrome computed style：前景 `#74817A`，主题状态卡片背景 `#171E1E`（4.16:1）、机器人数量背景 `#151A19`（4.33:1），均约 10.88px | 这两处将 dim 用在了较亮表面；改用已有 `--theme-muted`，黑金分别达到 7.33:1、7.62:1，双主题比值由测试验证。其他 dim 在 canvas 上约 4.70:1，没有全局改色。 |
| P2 | 外部头像失败显示破损图；`app/components/navbar.tsx` 的 UserAvatar | 本地合成用户 + 拦截外部头像使其失败，Chrome 截图 before-avatar-broken.jpg；naturalWidth=0 | 原组件只要有 URL 就替换掉首字母头像，未处理 error。现让既有首字母作为底层，成功图片覆盖，error 隐藏图片。URL 作为 key，使新 URL 重新加载；不增加 React 状态、effect、请求重试或通用图片框架。 |

缩略图索引由 `scripts/optimize_honor_thumbnails.py` 生成，44 张全部带 SHA256 前 8 位指纹，使用现有静态资源 immutable 策略。原本只有 348×281 的 #24 不重新压缩。源图共 9,896,942 bytes，列表派生图共 1,740,332 bytes，减少 82.42%；这是完整资源体积，不是首页或全站传输量。

同一台机器、1440×900 Chrome、本地页面、冷缓存、150ms 延迟、200,000 bytes/s 下载上限（约 1.6Mbps），从滚动到证书区计时至首行三张图全部 complete：原图 20,301ms，缩略图 3,039ms。每种方案一次，不作为生产稳定延迟或 P95；原始记录见 measure-before/after.json。

## 资源、缓存与动画的区分

- 生产 44 张原始证书均最终取得正确内容。并发 4 的命令行检查首次 43 张哈希一致，#03 出现 HTTP/2 framing 错误；仅诊断性 HTTP/1.1 重取 #03 后返回 200、58,242 bytes，哈希一致。没有据此增加浏览器重试逻辑。
- 浏览器观测到证书响应为 `image/webp`、200，CF 多为 EXPIRED，返回 `max-age=14400`。已有 #104 与缓存策略 历史提到固定 URL 缓存风险；本轮未观察到证书错误内容缓存，也没有 Cloudflare 控制台配置访问证据，不能把历史缓存问题当成本次空白根因。新缩略图使用新指纹 URL，未全站 purge。
- 证书组件没有使用首页沙粒状态；独立打开该路由也可复现下载等待。首页已存在的等待超时、低性能回退和 reduced-motion 路径继续保留，不调整算法或状态机。生产首页快照中部分图触发 fallback、部分在播放或完成，不能将不同采样时刻写成永久空白。
- 本地生产构建每组视口/主题六张导航图片均完成解码并最终 opacity=1；未发现需要修复的首页永久隐藏证据。

## Impeccable 实际执行

官方 [npm README](https://github.com/pbakaus/impeccable/blob/main/README.npm.md) 支持 `npx impeccable detect <URL>`。执行当天 npm 与仓库 package.json 均为 4.8.0，平台 engine 为 0.1.18；核查官方源码快照 `d34c87e1a00989ae8dbdd7f6b30b70f23319e860` 的 CLI、detect、browser 与 telemetry 路径。

- launcher 优先使用 npm 平台可选包，否则查用户缓存并从 GitHub 下载固定版本、校验 SHA256；URL 检测使用已安装 Chrome，不需要下载浏览器。
- 使用 `npm exec --yes --ignore-scripts --package=impeccable@4.8.0 -- impeccable detect --json …`，等价于固定版本 npx 检测，并禁用 npm 生命周期脚本。没有执行 install/init/update，也没有安装技能、Hooks 或修改工程配置。
- detect 路径未发现 roll API 的使用上报调用；后续执行显式设置 `DO_NOT_TRACK=1 IMPECCABLE_NO_TELEMETRY=1`。这属于源码核查，不声称对进程做了完整网络抓包。
- 生产 URL 两次、本地生产预览 URL 一次均返回 `Error: Navigation timeout of 30000 ms exceeded`、退出码 1、stdout `[]`。这是检测未完成，不能当作零问题报告；独立 Playwright Chrome 可以进入页面并继续检查。
- 源码检测完成，退出码 2：6 条 warning（4 处侧边强调边框、2 处字体）和 2 条 advisory（滚动箭头 bounce、背景网格）。原始报告见 impeccable-source.json。它们均属于现有视觉或状态表达，未证明功能/可访问性问题；按用户约束保留，不添加规则忽略配置。

## 验证与覆盖边界

- 前端全部 `app/lib/*.test.mjs`：201 通过、3 跳过、0 失败。跳过项为既有可选机器人原始照片归档；派生资源测试仍执行。新增测试核对 44 张缩略图的完整性、指纹、体积预算和原图保留，以及两处实际主题表面的 AA 对比度。
- `pnpm typecheck`、`pnpm build`、`make backend-test`、`scripts/test-production-ops.sh`、`git diff --check` 通过。Node 26 本地有现有 module.register 废弃提示；CI 使用仓库固定 Node 22。
- 真实 Chrome 156 无头模式，本地生产构建 1440×900、390×900，黑金/白金各检查首页、认识吉甲、机器人、赛事与荣誉、团队历程、加入吉甲、低空微专业、工作台，共 32 个页面场景，无横向溢出。手机为视口仿真，未做物理手机/跨浏览器验收。
- 每种组合检查六张导航图片、44 张证书 decode、原图弹窗、左右键、Escape 关闭和焦点返回、机器人筛选、手机导航菜单 Escape 和焦点返回、主题切换。失败头像隐藏且首字母可见。构建后未捕获页面 JavaScript 异常；生产初查 Console 的 `/api/me` 401 为访客预期，故障注入头像的网络失败为测试预期。
- 截图在 screenshots/；final-browser.json 为本地构建检查结果。工作台使用本机拦截的合成用户和 API 响应，不能代替生产账号、真实数据库与提交操作验收；未写生产业务数据。字体与视频生产 Network 有成功响应，本轮没有重新编码或自托管字体，也未跑 Lighthouse，不给出全站性能分数提升。

## 潜在风险与设计建议（未作为缺陷修改）

外部字体依赖、固定 URL CDN TTL、弱网下原图预览仍需下载完整扫描，以及不同设备的动画耗时，继续按已有审计追踪。没有控制台规则和跨设备样本，不断言 CDN 配置或动画性能需要变更。控件触控尺寸与键盘焦点应随相关功能迭代复查；本轮不对全站所有后台表单和授权功能作完全合规承诺。

补充浏览器检查：四组视口/主题下实际点击六个首页入口（共 24 次），均提交正确路由并显示标题；点击到标题为 44–756ms（每个场景一次，包含 Playwright 点击调度，不是 P95，也没有前后对照）。白金桌面微专业有一次 756ms、黑金手机 About 有一次 201ms，不据此宣称所有导航达到 200ms。工作台、周报空数据页、功能公告在正确合成 API 数据下完成 12 个只读场景；同页将失败头像 URL 更换为有效图片后，图片重新显示。见 supplemental-browser.json。

发布与 PR 的实际状态以 PR 中文记录及本次最终交付为准；本文件不预写尚未发生的 CI、合并或部署结果。
