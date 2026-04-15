# 页面交互动画美化任务

## 页面统计

- 当前已注册且有实际界面的页面共 10 个。
- `/dashboard` 为跳转路由，未计入独立页面。
- `app/routes/admin/permission-groups.tsx` 当前未注册到路由，未计入页面总数。

## 处理顺序

1. `/`
2. `/login`
3. `/register`
4. `/dashboard/users`
5. `/dashboard/users/registrations`
6. `/dashboard/admin`
7. `/dashboard/admin/users`
8. `/dashboard/admin/user-groups`
9. `/dashboard/admin/form-config`
10. `/dashboard/admin/registrations`

## 页面记录

### `/`

- 状态：已完成
- 动画优化点：
  - 首屏增加统一的渐入上浮节奏，强化标题、文案和 CTA 的层次进入感。
  - 导航补充悬停下划线、按钮轻抬和移动端菜单展开过渡，统一首页交互反馈。
  - 信息卡片增加轻抬、边框提亮和柔和高光，机器人卡片、数据卡片、团队卡片风格统一。
  - 背景网格、主光晕和滚动提示改为更轻的连续动效，视觉更稳定。
- 提交记录：`47f3df0 feat: beautify home page motion`

### `/login`

- 状态：已完成
- 动画优化点：
  - 引入与首页一致的网格背景和柔和光晕，登录页视觉语言统一。
  - 登录方式切换增加滑块过渡，密码登录与验证码登录之间的切换更顺滑。
  - 返回按钮、主按钮、GitHub 按钮和测试账号卡片统一补充轻抬反馈。
  - 表单卡片、分割线和辅助信息分层渐入，页面进入节奏更清晰。
- 提交记录：待回填

### `/register`

- 状态：待处理
- 动画优化点：
- 提交记录：

### `/dashboard/users`

- 状态：待处理
- 动画优化点：
- 提交记录：

### `/dashboard/users/registrations`

- 状态：待处理
- 动画优化点：
- 提交记录：

### `/dashboard/admin`

- 状态：待处理
- 动画优化点：
- 提交记录：

### `/dashboard/admin/users`

- 状态：待处理
- 动画优化点：
- 提交记录：

### `/dashboard/admin/user-groups`

- 状态：待处理
- 动画优化点：
- 提交记录：

### `/dashboard/admin/form-config`

- 状态：待处理
- 动画优化点：
- 提交记录：

### `/dashboard/admin/registrations`

- 状态：待处理
- 动画优化点：
- 提交记录：
