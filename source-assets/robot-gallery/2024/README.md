# 2024 赛季机器人原始定妆照

`originals/` 保存本次提供的 11 张 JPG 原文件，不经过重编码或裁切。`manifest.json` 记录原文件名、SHA-256、尺寸及其 WebP 衍生资源，便于核对来源。

网页图片位于 `public/assets/images/Robot/2024/`，包含 720、1440、2400 像素三档 WebP。展厅始终以 `object-fit: contain` 显示完整摄影画面；原始白色摄影背景保留在照片中。

重新生成单个赛季的网页资源时，在仓库根目录执行（默认为 2024）：

```sh
python3 scripts/optimize_robot_gallery_assets.py 2024
python3 scripts/optimize_robot_gallery_assets.py 2025
```

脚本需要本机 Python Pillow 且启用 WebP 支持；该工具不属于网站运行时，也没有新增前端依赖。衍生图使用 WebP quality 84、method 6；对带方向信息的原片应用 EXIF 方向，对衍生图移除 EXIF 元数据并保留可用的 ICC 色彩配置。原始 JPG 保持不变。
