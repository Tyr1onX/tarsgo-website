# 无引用前端代码清理

通过路由注册、import 路径、导出符号和全文引用复核，删除以下孤立代码：

- `motion-date-input.tsx` 和 `lib/server-auth.ts`，没有运行时调用方。
- `daily-signal-workspace.tsx` 及专用 calendar/reply/scroll 工具、CSS 和旧单元测试。
- 未被导入的 `dashboard-home.css`；移除 public-site 测试对已废弃组件的断言和失效 npm 测试入口。

保留 `/daily-signal`、`/base`、`/dashboard/base` 的现行跳转及其现有测试。日常通信后端 API、历史表、暂停业务引用均未删除。本批删除 1,491 行，收益主要是减少维护范围，不代表首屏资源下降。

本地 Node 22.23.4 / pnpm 9.15.4：前端 333 个测试，330 通过、3 跳过、0 失败；typecheck 和 production build 均通过。仅移除孤立文件，无路由/认证/缓存行为变更，未做浏览器耗时或生产验证。未新增导航关键路径请求、重复资源或高频操作依赖。远端 CI 和合并/部署状态以实际结果另记。
