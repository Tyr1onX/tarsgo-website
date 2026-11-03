# 同源字体

从 Fontsource 官方 npm 包提取的 Latin WOFF2 子集，包版本及完整性标识见 SOURCES.json，授权文本随文件保留。Inter 提供 100–900 正体/斜体，Geist Mono 提供 100–900 正体，Anton 提供 400 正体。中文沿用系统字体；不预加载全套字体，浏览器按实际用到的字族下载。字体文件位于 internal/frontend/app/assets/fonts，由 Vite 输出带内容哈希的资源名并使用现有不可变缓存策略。更新时同时更新来源和授权。
