"""Extract an original image-generated terrain sheet into seamless RPG ground sprites.

Run: python3 scripts/generate-pixel-ground.py
Only Python's standard library is required. The source artwork lives in
scripts/assets/pixel-ground-source.png; no generated rectangles replace it.
"""
from pathlib import Path
import struct
import zlib

PATCH = 128
TILE = 16
MATERIALS = ("grass", "soil", "stone", "water")
SOURCE = Path(__file__).parent / "assets/pixel-ground-source.png"
DESTINATION = Path(__file__).resolve().parents[1] / "public/assets/pixel-jijia/ground-tiles.png"


def read_rgb_png(path):
    """Read 8-bit RGB PNGs, including all five standard row filters."""
    data = path.read_bytes()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "Expected PNG source artwork"
    chunks = []
    pos = 8
    width = height = 0
    while pos < len(data):
        size = int.from_bytes(data[pos:pos + 4], "big")
        kind = data[pos + 4:pos + 8]
        content = data[pos + 8:pos + 8 + size]
        if kind == b"IHDR":
            width, height, depth, color, _, _, _ = struct.unpack(">IIBBBBB", content)
            assert depth == 8 and color == 2, "Expected 8-bit RGB PNG"
        elif kind == b"IDAT":
            chunks.append(content)
        pos += 12 + size
    stream = zlib.decompress(b"".join(chunks))
    stride = width * 3
    rows = []
    position = 0
    last = bytearray(stride)
    for _ in range(height):
        method = stream[position]
        row = bytearray(stream[position + 1:position + 1 + stride])
        position += 1 + stride
        for i in range(stride):
            a = row[i - 3] if i >= 3 else 0
            b = last[i]
            c = last[i - 3] if i >= 3 else 0
            if method == 1:
                row[i] = (row[i] + a) & 255
            elif method == 2:
                row[i] = (row[i] + b) & 255
            elif method == 3:
                row[i] = (row[i] + (a + b) // 2) & 255
            elif method == 4:
                p = a + b - c
                nearest = min((a, b, c), key=lambda q: abs(p - q))
                # Ties follow PNG Paeth order: left, above, upper-left.
                row[i] = (row[i] + nearest) & 255
            else:
                assert method == 0, f"Unknown PNG filter {method}"
        rows.append(row)
        last = row
    return width, height, rows


def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def pixel(rows, width, x, y):
    start = x * 3
    return rows[y][start:start + 3]


def smooth(value):
    return value * value * (3 - 2 * value)


def make_tile(rows, width, ox, oy):
    """Art-derived periodic tile: join opposite edges from adjacent source pixels."""
    colors = []
    overlap = 30
    for y in range(PATCH):
        vertical = smooth((overlap - 1 - y) / (overlap - 1)) if y < overlap else 0
        for x in range(PATCH):
            horizontal = smooth((overlap - 1 - x) / (overlap - 1)) if x < overlap else 0
            samples = [
                (pixel(rows, width, ox + x, oy + y), (1 - horizontal) * (1 - vertical)),
                (pixel(rows, width, ox + x + PATCH, oy + y), horizontal * (1 - vertical)) if x < overlap else (b"\0\0\0", 0),
                (pixel(rows, width, ox + x, oy + y + PATCH), (1 - horizontal) * vertical) if y < overlap else (b"\0\0\0", 0),
                (pixel(rows, width, ox + x + PATCH, oy + y + PATCH), horizontal * vertical) if x < overlap and y < overlap else (b"\0\0\0", 0),
            ]
            colors.append(tuple(round(sum(rgb[c] * weight for rgb, weight in samples)) for c in range(3)))
    # Copy a shared 1px periodic border to opposite sides; every variant keeps it.
    for y in range(PATCH):
        a = colors[y * PATCH]
        b = colors[y * PATCH + PATCH - 1]
        center = tuple(round((u + v) / 2) for u, v in zip(a, b))
        colors[y * PATCH] = colors[y * PATCH + PATCH - 1] = center
    for x in range(PATCH):
        a = colors[x]
        b = colors[(PATCH - 1) * PATCH + x]
        center = tuple(round((u + v) / 2) for u, v in zip(a, b))
        colors[x] = colors[(PATCH - 1) * PATCH + x] = center
    return colors


def shade(rgb, factor):
    return tuple(max(0, min(255, round(v * factor))) for v in rgb)


def color_grade(material, rgb):
    # Match the quieter campus-game palette while retaining image-generated detail.
    centers = ((99, 162, 76), (215, 189, 166), (155, 161, 182), (47, 177, 192))
    targets = ((93, 142, 92), (204, 186, 165), (153, 154, 164), (66, 158, 179))
    contrast = (.78, .93, .92, .87)[material]
    return tuple(max(0, min(255, round((v - center) * contrast + target)))
                 for v, center, target in zip(rgb, centers[material], targets[material]))


def main():
    width, height, source = read_rgb_png(SOURCE)
    assert (width, height) == (512, 512), "Expected 512×512 original art source"
    W, H = PATCH * 3, PATCH * len(MATERIALS) + TILE
    atlas = bytearray(W * H * 4)

    def set_pixel(x, y, rgb, alpha=255):
        index = (y * W + x) * 4
        atlas[index:index + 4] = bytes((*rgb, alpha))

    tile_bases = []
    for material, kind in enumerate(MATERIALS):
        qx, qy = (material % 2) * 256, (material // 2) * 256
        offset_x, offset_y = ((11, 17), (21, 10), (13, 15), (9, 21))[material]
        base = make_tile(source, width, qx + 5 + offset_x, qy + 5 + offset_y)
        tile_bases.append(base)
        for variant in range(3):
            for y in range(PATCH):
                for x in range(PATCH):
                    rgb = base[y * PATCH + x]
                    if variant and 23 <= x < 105 and 23 <= y < 105:
                        start_x, start_y = ((0, 0), (70, 38), (27, 50))[variant]
                        detail = pixel(source, width, qx + start_x + x, qy + start_y + y)
                        feather = max(0, min((x - 22) / 18, (105 - x) / 18, (y - 22) / 18, (105 - y) / 18, 1))
                        strength = (.22 if kind in ("grass", "water") else .12) * feather
                        rgb = tuple(round(a * (1 - strength) + b * strength) for a, b in zip(rgb, detail))
                    set_pixel(variant * PATCH + x, material * PATCH + y, color_grade(material, rgb))

    # Material edges use tonal samples from the generated art rather than painted CSS colors.
    for material in range(1, len(MATERIALS)):
        mid = color_grade(material, tile_bases[material][PATCH * 40 + 40])
        dark = shade(mid, .74 if material < 3 else .68)
        light = shade(mid, 1.13)
        for direction in range(4):
            left = ((material - 1) * 4 + direction) * TILE
            top = PATCH * len(MATERIALS)
            for t in range(TILE):
                for line in range(2):
                    if direction == 0:
                        x, y = t, line
                    elif direction == 1:
                        x, y = t, TILE - 1 - line
                    elif direction == 2:
                        x, y = line, t
                    else:
                        x, y = TILE - 1 - line, t
                    set_pixel(left + x, top + y, dark if line == 0 else light, 225 if line == 0 else 125)

    raw = b"".join(b"\0" + atlas[y * W * 4:(y + 1) * W * 4] for y in range(H))
    output = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    DESTINATION.write_bytes(output)
    print(f"{DESTINATION.name}: {W}×{H}, {len(output)} bytes; based on {SOURCE.name}")


if __name__ == "__main__":
    main()