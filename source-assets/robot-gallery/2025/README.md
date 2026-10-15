# 2025 赛季机器人原始定妆照

`originals/` 保存本次提供的 9 张 JPG 原文件，不经过重编码或裁切。`manifest.json` 记录原文件名、SHA-256、尺寸及其 WebP 衍生资源，便于核对素材来源。

网页图片位于 `public/assets/images/Robot/2025/`，包含 720、1440、2400 像素三档 WebP。展厅以 `object-fit: contain` 显示完整摄影画面，保留原始摄影背景。

从仓库根目录重新生成网页资源：

```sh
python3 scripts/optimize_robot_gallery_assets.py 2025
```

脚本需要本机 Python Pillow 且启用 WebP 支持；它仅用于素材准备，不属于网站运行时。衍生图使用 WebP quality 84、method 6，并对原片应用 EXIF 方向、保留可用的 ICC 色彩配置。原始 JPG 保持不变。
