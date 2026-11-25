"""Offline visual studies; reference identity and unknown views documented separately.
Geometry is illustrative pixel art, not a mechanical model.
Reuse the existing rasterizer without changing the approved first atlas.
"""
import importlib.util
import math, struct, zlib
from pathlib import Path
spec=importlib.util.spec_from_file_location("pixel",Path(__file__).with_name("generate-pixel-guodong-study.py"))
art=importlib.util.module_from_spec(spec);spec.loader.exec_module(art)
box,cyl=art.box,art.cylinder
M,L,D,T,R=art.METAL,art.LIGHT,art.DARK,art.TYRE,art.RIM
BLUE=(101,151,160)

def limb(f,a,b,width,color):
    # Flat silhouette linking two visible joints, not an articulated CAD model.
    x,y,z=a;X,Y,Z=b
    v=[(x,y-width/2,z),(X,Y-width/2,Z),(X,Y+width/2,Z),(x,y+width/2,z)]
    f.append((v,color,.91))
    f.append(([(i,j,k+1.4) for i,j,k in v],L,1.0))

def wheel_leg(frame):
    f=[]
    # Large visible wheel, narrow auxiliary rollers and prominent side linkages.
    lift=(0,.7,0,-.5)[frame]
    for side in (-1,1):
        for x in (-13,13):
            y=side*10.5
            cyl(f,x,y,4.7,4.7,3.0,"y",T,frame,True)
            cyl(f,x,y+side*1.7,4.7,2.8,.5,"y",R)
            limb(f,(x*.48,y,12+lift),(x,y,5.4),3.8,M)
            cyl(f,x*.48,y,12+lift,2.6,3.8,"y",D)
            cyl(f,x,y,5.4,1.2,4.0,"y",L)
            for q in (-1,1):cyl(f,x+q*4.4,side*9,3,2.3,2.2,"y",T,frame,True)
        box(f,0,side*8.7,7,17,2,7,M)
        box(f,0,side*10,8.3,10,.7,4.2,L)
        box(f,0,side*10.6,9,7,.5,2.8,D)
    box(f,0,0,8+lift,25,16,5,D)
    box(f,0,0,13+lift,32,17,1.4,L)
    cyl(f,0,0,14.4,5,1.7,"z",M)
    return f

def wheel_head():
    f=[]
    box(f,0,0,15.6,8,8,8,M)
    box(f,0,-3,22.5,11,10,5,D)
    box(f,0,-8.3,23,8,1,3.1,BLUE)
    box(f,0,0,27.4,11,11,1,L)
    # The tall inclined rear support is the recognizable visual silhouette.
    limb(f,(0,5,16),(0,12,31),4.2,M)
    box(f,0,12,31,7,5,1.5,L)
    box(f,0,12,32.5,5,4,3,D)
    return f

def engineering(frame):
    f=[]
    # Three near-side wheels seen in the PDF; far side mirrors provisionally.
    for side in (-1,1):
        for x in (-13,0,13):
            y=side*12
            cyl(f,x,y,3.9,4,3.6,"y",T,frame,True)
            cyl(f,x,y+side*2,3.9,2.2,.6,"y",R)
            limb(f,(x-3,side*8,10),(x,y,4.7),3.2,M)
            cyl(f,x-3,side*9,10,2.1,3,"y",L)
        box(f,0,side*9,10,27,3.2,4,M)
        for x in (-9,9):
            box(f,x,side*11,10,8,1.2,6,L);box(f,x,side*11.8,11,5,.7,4,D)
    box(f,0,0,10,31,17,5,D)
    box(f,0,0,15,31,19,2,L)
    for x in (-8,0,8):
        box(f,x,2,17,3.4,4,7,M)
        box(f,x,2,24,2.7,3,1,L)
    box(f,0,8,17,9,4,4,M)
    box(f,0,8,21,2.1,2.1,15,L)
    box(f,0,8,36,8,5,2,D)
    box(f,0,5.5,36.3,5,1.3,1.7,BLUE)
    return f

def engineering_arm():
    f=[]
    # Separate rotating upper display tray; no real-world machine mechanics.
    box(f,0,-4,16.8,9,8,3,M)
    limb(f,(0,-4,19),(0,-10,23),4,M)
    box(f,0,-14,23,10,9,2.0,L)
    box(f,0,-14,25,7,6,2.2,D)
    return f

def display_base():
    # Nonfunctional decorative silhouette, intentionally no real apparatus detail.
    f=[]
    box(f,0,0,0,37,24,2,M)
    box(f,0,0,2,32,19,1,D)
    for side in (-1,1):
        limb(f,(-11,side*7,3),(-6,side*7,19),3.0,M)
        limb(f,(11,side*7,3),(-6,side*7,19),3.0,M)
    for side in (-1,1):
        limb(f,(13,side*5,9),(-14,side*5,32),2.8,L)
    limb(f,(13,0,9),(-14,0,32),9,D)
    return f

def dart_icon():
    f=[]
    # Abstract winged exhibit icon, independent of the decorative stand.
    for side in (-1,1):
        f.append(([(0,-12,3),(side*11,1,3),(side*11,10,3),(0,7,3)],M,1.0))
    box(f,0,0,3,4,25,3,L)
    box(f,0,-10,6,3,4,1,D)
    return f

def write(name,w,h,anchor,frames,upper=None):
    art.W,art.H=w*2,h*2
    def project(p,theta):
        x,y,z=p;rx=x*math.cos(theta)-y*math.sin(theta);ry=x*math.sin(theta)+y*math.cos(theta)
        return(art.W/2+rx*2,anchor*2+ry*1.16-z*2,ry+z*.58)
    art.project=project
    rows=[]
    for f in frames+([upper] if upper else []):
        cells=[art.paint(f,i*math.pi/4) for i in range(8)]
        rows.extend([sum((c[y] for c in cells),[]) for y in range(art.H)])
    raw=b"".join(b"\0"+bytes(v for p in r for v in p) for r in rows)
    data=b"\x89PNG\r\n\x1a\n"+art.chunk(b"IHDR",struct.pack(">IIBBBBB",art.W*8,len(rows),8,6,0,0,0))+art.chunk(b"IDAT",zlib.compress(raw,9))+art.chunk(b"IEND",b"")
    dst=art.ROOT/"public/assets/pixel-jijia"/("robot-"+name+".png");dst.write_bytes(data)
    print(dst.name,len(data))
if __name__=="__main__":
    write("wheel-leg-study",68,68,52,[wheel_leg(i) for i in range(4)],wheel_head())
    write("engineering-study",76,78,60,[engineering(i) for i in range(4)],engineering_arm())
    write("dart-display-study",76,76,57,[display_base()])
    write("dart-body-study",40,40,28,[dart_icon()])
