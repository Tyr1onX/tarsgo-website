"""Generate the seam-free 16px ground tiles used by Pixel Jijia.

No external dependencies: python3 scripts/generate-pixel-ground.py
Tile borders remain flat and equal within each terrain material.
"""
from pathlib import Path
import struct
import zlib

SIZE = 16
COLORS = {
    "grass": (136, 169, 124),
    "soil": (216, 195, 162),
    "stone": (195, 185, 173),
    "water": (104, 175, 183),
}
KINDS = ("grass", "grass", "grass", "grass", "soil", "soil", "stone", "stone", "water", "water")
pixels = [[COLORS[KINDS[x // SIZE]] for x in range(SIZE * len(KINDS))] for _ in range(SIZE)]


def dot(tile: int, x: int, y: int, color: tuple[int, int, int], w: int = 1, h: int = 1):
    assert 2 <= x and 2 <= y and x + w <= SIZE - 2 and y + h <= SIZE - 2
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            pixels[yy][tile * SIZE + xx] = color


# Grass is largely plain. Sparse detail/flowers never touch tile edges.
dot(1, 5, 9, (126, 158, 116), 2)
dot(1, 11, 5, (148, 176, 132), 2)
for tile, petals in [(2, (241, 216, 172)), (3, (220, 189, 200))]:
    dot(tile, 8, 8, (99, 143, 104), 1, 4)
    dot(tile, 6, 6, petals, 4, 3)
    dot(tile, 7, 7, (249, 234, 196), 2)

dot(5, 5, 7, (202, 179, 146), 3)
dot(5, 10, 11, (232, 210, 178), 2)
dot(7, 4, 9, (180, 171, 162), 3)
dot(7, 10, 5, (213, 204, 194), 2)
dot(9, 4, 7, (136, 205, 202), 6)
dot(9, 9, 11, (89, 158, 170), 3)

# All edges are the same color for every variation of the same terrain.
for tile, kind in enumerate(KINDS):
    base = COLORS[kind]
    for i in range(SIZE):
        assert pixels[0][tile * SIZE + i] == base
        assert pixels[-1][tile * SIZE + i] == base
        assert pixels[i][tile * SIZE] == base
        assert pixels[i][tile * SIZE + SIZE - 1] == base


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


width = SIZE * len(KINDS)
height = SIZE
raw = b"".join(b"\0" + bytes(component for pixel in row for component in pixel) for row in pixels)
png = (
    b"\x89PNG\r\n\x1a\n"
    + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    + chunk(b"IDAT", zlib.compress(raw, level=9))
    + chunk(b"IEND", b"")
)
output = Path(__file__).resolve().parents[1] / "public/assets/pixel-jijia/ground-tiles.png"
output.write_bytes(png)
print(f"{output.name}: {width}x{height} pixels, {len(png)} bytes, {len(KINDS)} tiles")
