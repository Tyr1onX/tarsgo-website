"""Extract an original image-generated terrain sheet into seamless RPG ground sprites.

Run: python3 scripts/generate-pixel-ground.py
Only Python's standard library is required. The source artwork lives in
scripts/assets/pixel-ground-source.png; no generated rectangles replace it.
"""
from pathlib import Path
import struct
import zlib
import math

PATCH = 128
TILE = 32
MATERIALS = ("grass", "brick", "stone", "deep water", "soil", "flower bed", "wood", "sand", "shallow water", "submerged stone")
SOURCE = Path(__file__).parent / "assets/pixel-ground-source.png"
DESTINATION = Path(__file__).resolve().parents[1] / "internal/frontend/app/assets/pixel-jijia/ground-tiles.png"


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
    centers = ((99,162,76),(215,189,166),(155,161,182),(47,177,192))
    targets = ((94,145,86),(199,179,150),(166,165,160),(48,115,139))
    contrast = (.89,.94,.89,.9)[material]
    return tuple(max(0,min(255,round((v-center)*contrast+target))) for v,center,target in zip(rgb,centers[material],targets[material]))

def clamp(rgb):
    return tuple(max(0,min(255,round(v))) for v in rgb)

def set_cluster(pixels,x,y,pattern,palette):
    for j,row in enumerate(pattern):
        for i,key in enumerate(row):
            if key!=".":pixels[((y+j)%PATCH)*PATCH+(x+i)%PATCH]=palette[int(key)]

def material_patch(material,base,variant):
    # Native source pixels provide the grain and clustered tonal variation.
    grass,brick,stone,water=base
    if material<4:return [color_grade(material,c) for c in base[material]]
    if material==8:return [clamp((r*.8+65,g*.66+54,b*.65+49)) for r,g,b in water]
    if material==9:
        return [clamp(tuple(a*.53+b*.47 for a,b in zip(color_grade(2,c),color_grade(3,d)))) for c,d in zip(stone,water)]
    if material in (4,5,7):
        # Soil and sand are separate authored surfaces, using real source
        # texture luminance rather than independent per-pixel random noise.
        centers=(124,94,65) if material!=7 else (201,181,138)
        out=[]
        for y in range(PATCH):
            for x in range(PATCH):
                r,g,b=grass[((y*2+variant*17)%PATCH)*PATCH+(x*2+variant*23)%PATCH]
                grain=(r*.27+g*.54+b*.19-125)*(.56 if material==7 else .79)
                out.append(clamp(tuple(c+grain for c in centers)))
        dark,mid,light=((92,70,52),(152,115,77),(178,138,91)) if material!=7 else ((167,147,115),(214,192,149),(231,215,176))
        for x,y in [(11,17),(39,49),(76,13),(95,81),(24,98),(61,103),(113,43),(82,60),(9,66)]:
            x=(x+variant*17)%PATCH;y=(y+variant*11)%PATCH
            set_cluster(out,x,y,[".22..","2110.","011..",".0..."],(dark,mid,light))
        if material==5:
            # Small, independently painted leaf and blossom clusters.
            pal=((51,83,46),(81,125,58),(128,163,75),(193,136,154),(240,195,183),(246,224,158))
            for x,y in [(17,25),(46,77),(82,30),(105,92),(29,108),(113,12)]:
                set_cluster(out,(x+variant*19)%PATCH,(y+variant*13)%PATCH,
                    ["..44...",".4354..","..44.2.","..1.21.",".21210.","2101..."],pal)
        return out
    # Planks have staggered joints, grain lines and knots, not a tinted stone grid.
    out=[]
    for y in range(PATCH):
        board=y//16;dy=y%16
        for x in range(PATCH):
            joint=(x+(board%2)*32)%64
            r,g,b=grass[(y%PATCH)*PATCH+(x%PATCH)]
            grain=(r*.3+g*.5+b*.2-125)*.22
            center=(164+((board*7+variant*3)%13)-6,125+((board*5)%9)-4,85+((board*3)%7)-3)
            if dy==0 or joint==0:color=(97,73,54)
            elif dy==1 or joint==1:color=(205,162,110)
            elif dy==15:color=(124,91,64)
            else:color=clamp(tuple(c+grain+4*math.sin((x+board*11)*.14+dy*.8) for c in center))
            out.append(color)
    for x,y in [(24,7),(88,27),(43,51),(108,73),(18,103),(75,121)]:
        set_cluster(out,(x+variant*8)%PATCH,y,["...000...","..01110..",".0122210.","..01110..","...000..."],((113,80,53),(143,103,67),(185,143,94)))
    return out

def main():
    width,height,source=read_rgb_png(SOURCE)
    assert (width,height)==(512,512)
    W=PATCH*3
    edge_y=PATCH*len(MATERIALS)
    H=edge_y+3*TILE
    atlas=bytearray(W*H*4)
    def put(x,y,rgb,alpha=255):
        at=(y*W+x)*4;atlas[at:at+4]=bytes((*rgb,alpha))
    source_variants=[]
    for variant in range(3):
        bases=[]
        for i in range(4):
            qx,qy=(i%2)*256,(i//2)*256
            ox,oy=((11,17),(21,10),(13,15),(9,21))[i]
            # Masonry joints must keep the same register across every patch.
            # Grass and water may shift their natural motifs freely.
            shift=0 if i in (1,2) else variant
            if i==2: ox,oy=0,0
            bases.append(make_tile(source,width,qx+(ox+shift*17)%53,qy+(oy+shift*19)%53))
        source_variants.append(bases)
    for material in range(len(MATERIALS)):
        variants=[material_patch(material,bases,i) for i,bases in enumerate(source_variants)]
        if material in (1,2):
            # Preserve actual stone/brick seams while varying only the interior patina.
            for i in range(1,3):
                for y in range(1,PATCH-1):
                    for x in range(1,PATCH-1):
                        at=y*PATCH+x;rgb=variants[0][at]
                        n=math.sin(x*.041+i)*math.sin(y*.052+i)*2.5
                        variants[i][at]=clamp(tuple(v+n for v in rgb))
        base=variants[0]
        # All variants share exact periodic border pixels, including at corners.
        for y in range(PATCH):
            c=tuple(round((a+b)/2) for a,b in zip(base[y*PATCH],base[y*PATCH+PATCH-1]))
            base[y*PATCH]=base[y*PATCH+PATCH-1]=c
        for x in range(PATCH):
            c=tuple(round((a+b)/2) for a,b in zip(base[x],base[(PATCH-1)*PATCH+x]))
            base[x]=base[(PATCH-1)*PATCH+x]=c
        for variant,pixels in enumerate(variants):
            for y in range(PATCH):
                for x in range(PATCH):
                    i=y*PATCH+x;distance=min(x,y,PATCH-1-x,PATCH-1-y)
                    if variant and distance<10:
                        f=smooth(distance/10);pixels[i]=tuple(round(a*(1-f)+b*f) for a,b in zip(base[i],pixels[i]))
                    put(variant*PATCH+x,material*PATCH+y,pixels[i])
        if material==0:continue
        for side in range(4):
            idx=(material-1)*4+side;left=idx%12*TILE;top=edge_y+idx//12*TILE
            for t in range(TILE):
                # Irregular stepped transition takes actual colour from the material.
                thickness=3+(base[(t*11+material*19)%len(base)][0]%3)
                for d in range(thickness):
                    x,y=(t,d) if side==0 else (t,TILE-1-d) if side==1 else (d,t) if side==2 else (TILE-1-d,t)
                    rgb=shade(base[((t*7)%PATCH)*PATCH+(d*13+material*9)%PATCH],.66 if d==0 else 1.1 if d==1 else .96)
                    put(left+x,top+y,rgb,215 if d<2 else max(45,155-d*19))
    raw=b"".join(b"\0"+atlas[y*W*4:(y+1)*W*4] for y in range(H))
    output=b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",W,H,8,6,0,0,0))+chunk(b"IDAT",zlib.compress(raw,9))+chunk(b"IEND",b"")
    DESTINATION.write_bytes(output)
    print(f"{DESTINATION.name}: {W}×{H}, {len(MATERIALS)} textures, {len(output)} bytes")
if __name__=="__main__":main()
