# 2026 赛季机器人原始定妆照

`originals/` 保存用户提供的 10 张 JPG 原文件，按本轮上传文件名和顺序归档；包含 1 号英雄备车与 3 号步兵备车，它们分别作为独立机器人展示。原片没有重编码、裁切或重命名。

素材来源：用户于本轮对话提供的文件，原始位置为 `~/Downloads/吉林大学/吉林大学 机器人 原图/`。`manifest.json` 记录每张原片的文件名、SHA-256、尺寸及 WebP 衍生资源。

网页图片位于 `public/assets/images/Robot/2026/`，包含 720、1440、2400 像素三档 WebP。展厅以 `object-fit: contain` 显示完整摄影画面并保留原始摄影背景。

从仓库根目录重新生成网页资源：

```sh
python3 scripts/optimize_robot_gallery_assets.py 2026
```

脚本需要本机 Python Pillow 且启用 WebP 支持；它仅用于素材准备，不属于网站运行时。衍生图使用 WebP quality 84、method 6，并对原片应用 EXIF 方向、保留可用的 ICC 色彩配置。原始 JPG 保持不变。
