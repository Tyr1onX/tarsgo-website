#!/usr/bin/env python3
"""Build responsive WebP derivatives from the preserved 2024 robot originals.

Requires Pillow with WebP support. This is an asset-preparation tool only; the
website has no Python or Pillow runtime dependency.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps, features


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "source-assets/robot-gallery/2024/originals"
OUTPUT_DIR = ROOT / "public/assets/images/Robot/2024"
MANIFEST_PATH = ROOT / "source-assets/robot-gallery/2024/manifest.json"
WIDTHS = (720, 1440, 2400)
QUALITY = 84
METHOD = 6

PHOTOS = (
    ("hero-01", "1号英雄.JPG", "1号英雄机器人", "英雄"),
    ("hero-01-backup", "1号英雄（备车）.JPG", "1号英雄机器人（备车）", "英雄"),
    ("engineering-02", "2号工程.JPG", "2号工程机器人", "工程"),
    ("infantry-04", "4号步兵.JPG", "4号步兵机器人", "步兵"),
    ("radar-09", "9号雷达.JPG", "9号雷达系统", "雷达"),
    ("infantry-03", "3号步兵.JPG", "3号步兵机器人", "步兵"),
    ("infantry-05-backup", "5号步兵（备车）.JPG", "5号步兵机器人（备车）", "步兵"),
    ("sentinel-07", "7号哨兵.JPG", "7号哨兵机器人", "哨兵"),
    ("infantry-05", "5号步兵.JPG", "5号步兵机器人", "步兵"),
    ("dart-08", "8号飞镖.JPG", "8号飞镖系统", "飞镖"),
    ("air-06", "6号无人机.JPG", "6号空中机器人", "空中"),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    if not features.check("webp"):
        raise SystemExit("当前 Pillow 未启用 WebP 编码支持")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_photos = []

    for photo_id, filename, name, category in PHOTOS:
        source = SOURCE_DIR / filename
        if not source.is_file():
            raise SystemExit(f"找不到原始照片：{source}")

        with Image.open(source) as opened:
            icc_profile = opened.info.get("icc_profile")
            image = ImageOps.exif_transpose(opened).convert("RGB")
            original_width, original_height = image.size

            assets = []
            for requested_width in WIDTHS:
                width = min(requested_width, original_width)
                height = round(original_height * width / original_width)
                derivative = image if width == original_width else image.resize(
                    (width, height), Image.Resampling.LANCZOS
                )
                output = OUTPUT_DIR / f"{photo_id}-{requested_width}.webp"
                derivative.save(
                    output,
                    format="WEBP",
                    quality=QUALITY,
                    method=METHOD,
                    icc_profile=icc_profile,
                )
                assets.append({
                    "width": width,
                    "height": height,
                    "path": output.relative_to(ROOT).as_posix(),
                    "bytes": output.stat().st_size,
                })

        manifest_photos.append({
            "id": photo_id,
            "name": name,
            "category": category,
            "originalFilename": filename,
            "originalPath": f"originals/{filename}",
            "originalSha256": sha256(source),
            "originalBytes": source.stat().st_size,
            "originalWidth": original_width,
            "originalHeight": original_height,
            "assets": assets,
        })

    manifest = {
        "season": 2024,
        "sourceArchive": "source-assets/robot-gallery/2024/originals/",
        "conversion": {
            "format": "WebP",
            "pillowVersion": Image.__version__ if hasattr(Image, "__version__") else None,
            "quality": QUALITY,
            "method": METHOD,
            "widths": list(WIDTHS),
            "exif": "orientation applied; metadata omitted from derivatives",
            "iccProfile": "preserved when present",
        },
        "photos": manifest_photos,
    }
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"已处理 {len(manifest_photos)} 张照片；清单：{MANIFEST_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
