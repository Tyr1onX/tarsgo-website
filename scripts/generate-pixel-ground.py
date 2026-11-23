"""Reproducible, seam-aware pixel ground for Pixel Jijia.

Create original structured flagstone, brick-path, grass and water textures.
No runtime or Python third-party dependencies.
Usage: python3 scripts/generate-pixel-ground.py
"""
from pathlib import Path
import random
import struct
import zlib

PATCH = 64
STEP = 16
VARIANTS = 3
MATERIALS = ("grass", "soil", "stone", "water")
WIDTH, HEIGHT = PATCH * VARIANTS, PATCH * len(MATERIALS) + STEP
canvas = bytearray(WIDTH * HEIGHT * 4)

BASE = {
    "grass": (119, 158, 109),
    "soil": (208, 191, 163),
    "stone": (175, 174, 180),
    "water": (81, 157, 173),
}


def put(x, y, color, a=255):
    if 0 <= x < WIDTH and 0 <= y < HEIGHT:
        i = (y * WIDTH + x) * 4
        canvas[i:i + 4] = bytes((*color, a))


def rectangle(x, y, w, h, color, a=255):
    for yy in range(max(0, y), min(HEIGHT, y + h)):
        for xx in range(max(0, x), min(WIDTH, x + w)):
            put(xx, yy, color, a)


def tint(rgb, delta):
    return tuple(max(0, min(255, value + delta)) for value in rgb)


for material_index, kind in enumerate(MATERIALS):
    top = material_index * PATCH
    for variant in range(VARIANTS):
        left = variant * PATCH
        rng = random.Random(713 + material_index * 221 + variant * 41)
        rectangle(left, top, PATCH, PATCH, BASE[kind])

        if kind == "grass":
            # Two greens and a few clover-like tufts, with wide uninterrupted grass.
            for _ in range(14):
                x, y = rng.randrange(5, 57), rng.randrange(5, 57)
                dark = rng.choice([(103, 148, 97), (109, 151, 102), (139, 169, 119)])
                rectangle(left + x, top + y, rng.randrange(2, 6), rng.randrange(1, 3), dark)
                if rng.random() < .35:
                    put(left + x + 2, top + y - 2, (158, 182, 135))
            for _ in range(5):
                x, y = rng.randrange(7, 55), rng.randrange(8, 55)
                put(left + x, top + y + 1, (84, 136, 91))
                put(left + x + 1, top + y, (157, 186, 139))
                put(left + x + 2, top + y + 2, (95, 141, 89))
            if variant != 1:
                x, y = rng.randrange(9, 52), rng.randrange(9, 52)
                put(left + x, top + y, (232, 196, 150))
                put(left + x + 1, top + y - 1, (248, 215, 170))
                put(left + x + 2, top + y, (232, 196, 150))
                put(left + x + 1, top + y + 1, (104, 142, 94))

        elif kind in ("soil", "stone"):
            # Repeating mortar geometry gives an intentional rhythm; variants only
            # change sparse wear marks, so cross-patch joints always align.
            if kind == "soil":
                mortar, brick, width, height = (164, 147, 126), (212, 192, 162), 32, 16
            else:
                mortar, brick, width, height = (130, 130, 142), (181, 181, 188), 32, 32
            rectangle(left, top, PATCH, PATCH, mortar)
            for row in range(PATCH // height):
                offset = 0 if row % 2 == 0 else -(width // 2)
                for col in range(-1, PATCH // width + 2):
                    x = col * width + offset
                    y = row * height
                    # Shared geometry across variants; random tints are only interior details.
                    base = tint(brick, ((col * 5 + row * 7) % 5 - 2) * 2)
                    # Clip to 64x64 patch so other material strips never receive pixels.
                    for yy in range(max(0, y + 2), min(PATCH, y + height - 1)):
                        for xx in range(max(0, x + 1), min(PATCH, x + width - 1)):
                            color = base
                            if yy == y + 2:
                                color = tint(base, 13)
                            elif yy == y + height - 2:
                                color = tint(base, -11)
                            elif xx == x + 1:
                                color = tint(base, -9)
                            put(left + xx, top + yy, color)
            # Modest pixel wear / subtle chipped corners within stones, not pixel snow.
            for _ in range(13 if kind == "soil" else 10):
                x, y = rng.randrange(4, 60), rng.randrange(4, 60)
                i = (top + y) * WIDTH * 4 + (left + x) * 4
                if tuple(canvas[i:i + 3]) == mortar:
                    continue
                color = tint(tuple(canvas[i:i + 3]), rng.choice((-14, -9, 10, 15)))
                rectangle(left + x, top + y, rng.randrange(1, 4), 1, color)

        else:
            # Turquoise bands with spaced original 2-3px highlights.
            for _ in range(12):
                x, y = rng.randrange(5, 53), rng.randrange(5, 59)
                length = rng.randrange(4, 12)
                color = rng.choice([(95, 172, 184), (111, 190, 197), (63, 136, 158)])
                rectangle(left + x, top + y, length, 2, color)
                if rng.random() < .5:
                    rectangle(left + x + 2, top + y - 1, length - 3, 1, (143, 206, 206))

        # All patch variations have exactly the same outer pixel frame.
        # This avoids a hard seam when adjacent map chunks choose different variants.
        if kind in ("grass", "water"):
            for i in range(PATCH):
                put(left + i, top, BASE[kind])
                put(left + i, top + PATCH - 1, BASE[kind])
                put(left, top + i, BASE[kind])
                put(left + PATCH - 1, top + i, BASE[kind])


# Overlay sprites with transparent backgrounds: 3 terrains x 4 facing edges.
# They appear only where material type changes, never between equal tiles.
EDGE_COLORS = {
    "soil": ((159, 142, 117), (232, 215, 187)),
    "stone": ((122, 120, 133), (202, 201, 204)),
    "water": ((46, 118, 145), (143, 202, 207)),
}
for kind_index, kind in enumerate(MATERIALS[1:]):
    outer, inner = EDGE_COLORS[kind]
    for side in range(4):
        left = (kind_index * 4 + side) * STEP
        top = PATCH * len(MATERIALS)
        for t in range(STEP):
            # Four discrete orientations: top, bottom, left, right.
            if side == 0:
                points = ((t, 0), (t, 1))
            elif side == 1:
                points = ((t, STEP - 1), (t, STEP - 2))
            elif side == 2:
                points = ((0, t), (1, t))
            else:
                points = ((STEP - 1, t), (STEP - 2, t))
            for n, (x, y) in enumerate(points):
                put(left + x, top + y, outer if n == 0 else inner, 225 if n == 0 else 115)


def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


raw = b"".join(b"\0" + bytes(canvas[y * WIDTH * 4:(y + 1) * WIDTH * 4]) for y in range(HEIGHT))
image = (
    b"\x89PNG\r\n\x1a\n"
    + chunk(b"IHDR", struct.pack(">IIBBBBB", WIDTH, HEIGHT, 8, 6, 0, 0, 0))
    + chunk(b"IDAT", zlib.compress(raw, 9))
    + chunk(b"IEND", b"")
)
output = Path(__file__).resolve().parents[1] / "public/assets/pixel-jijia/ground-tiles.png"
output.write_bytes(image)
print(f"Generated {output.name}: {WIDTH}x{HEIGHT}, {len(image)} bytes")
