"""Offline pixel-art study of 果冻（立头）.pdf, SHA256 prefix 5e8a1ea1acf8e5ed.

The reference is a single orthographic view, not a 3D CAD assembly.
Visible features: low wide chassis, two sloped panels, central large
roller wheel, narrow paired end rollers, horizontal rail and raised
upright head. Rear/depth/hidden wheel arrangement and colours are provisional.
All coordinates are illustrative pixel-art units, NOT real robot dimensions.
No runtime geometry or third-party dependencies.
"""
from pathlib import Path
import math
import struct
import zlib

ROOT=Path(__file__).resolve().parents[1]
W,H=128,112
INK=(26,33,33)
METAL=(101,111,110)
LIGHT=(177,184,174)
PANEL=(47,58,59)
TYRE=(39,44,43)
RIM=(147,154,148)
DARK=(45,54,53)
CLEAR=(0,0,0,0)

def box(faces,x,y,z,w,d,h,color):
    a,b=x-w/2,x+w/2;c,e=y-d/2,y+d/2
    v=[(a,c,z),(b,c,z),(b,e,z),(a,e,z),(a,c,z+h),(b,c,z+h),(b,e,z+h),(a,e,z+h)]
    for face,shade in [((0,3,2,1),.52),((0,1,5,4),.79),((1,2,6,5),.71),((2,3,7,6),.88),((3,0,4,7),1.04),((4,5,6,7),1.18)]:
        faces.append(([v[i] for i in face],color,shade))

def cylinder(faces,x,y,z,r,d,axis,color,phase=0,roller=False):
    count=12
    def vertex(a,end):
        p,q=math.cos(a)*r,math.sin(a)*r
        if axis=="x":return(x+end*d/2,y+p,z+q)
        if axis=="y":return(x+p,y+end*d/2,z+q)
        return(x+p,y+q,z+end*d/2)
    rings=[[vertex(i*math.tau/count,end) for i in range(count)] for end in (-1,1)]
    for i in range(count):
        j=(i+1)%count;shade=.72+.30*max(0,math.sin((i+.5)*math.tau/count))
        if roller:shade+=.42 if (i+phase)%4==0 else 0
        faces.append(([rings[0][i],rings[0][j],rings[1][j],rings[1][i]],color,shade))
    for end in (0,1):
        faces.append((rings[end],color,.82 if end else .95))

def chassis(frame):
    f=[]
    # Relative visual measurements from the single side elevation:
    # approximately 40 wide, 10.5 high chassis, 24 high overall.
    # Hidden depth and symmetric far-side wheels are provisional.
    for side in (-1,1):
        cylinder(f,0,side*9.5,5.0,5.2,3.4,"y",TYRE,frame,True)
        cylinder(f,0,side*11.3,5.0,3.65,.7,"y",RIM)
        cylinder(f,0,side*11.8,5.0,2.65,.5,"y",DARK)
        cylinder(f,0,side*12.1,5.0,1.35,.5,"y",LIGHT)
    for end in (-1,1):
        for side in (-1,1):
            # Twin narrow rollers remain distinct at either end.
            for offset in (-1.25,1.25):
                cylinder(f,end*(17.4+offset),side*7.8,4.6,4.3,1.1,"x",TYRE,frame,True)
                cylinder(f,end*(17.9+offset),side*7.8,4.6,2.0,.5,"x",RIM)
        box(f,end*15.2,0,2.6,9.4,18,1.5,METAL)
        box(f,end*13,0,4.1,5.2,14,4.8,DARK)
    # Open low frame, with the central hub not hidden by a full-height block.
    box(f,0,0,3.1,30,13,1.4,DARK)
    box(f,0,0,8.0,25,12,1.6,DARK)
    box(f,0,0,9.6,25,12,.9,METAL)
    for side in (-1,1):
        box(f,0,side*9.1,3.0,39,1.3,1.2,METAL)
        for x in (-10,10):
            def panel(w,h,c,depth):
                z=2.1+(8.4-h)/2
                y=side*(10.45+depth)
                shift=(1.5 if x<0 else -1.5)*h/8.4
                v=[(x-w/2,y,z),(x+w/2,y,z),
                   (x+w/2+shift,side*(9.0+depth),z+h),
                   (x-w/2+shift,side*(9.0+depth),z+h)]
                f.append((v,c,1.0 if side==1 else .87))
            panel(8.5,8.4,LIGHT,.55)
            panel(7.3,7.1,METAL,.78)
            panel(5.0,4.7,DARK,.98)
            panel(4.1,3.8,PANEL,1.18)
    # The elevated horizontal rail and its end caps are a separate silhouette.
    box(f,0,0,10.5,6.5,5,1.8,DARK)
    box(f,0,0,12.3,17.5,7,2.8,METAL)
    box(f,0,0,15.1,17.5,6.6,.7,LIGHT)
    for x in (-8.9,8.9):box(f,x,0,12.1,1.3,7.3,3.9,LIGHT)
    for side in (-1,1):box(f,0,side*3.6,13,14.5,.7,1.5,PANEL)
    cylinder(f,0,0,15.8,3.0,1.1,"z",DARK)
    return f

def head():
    f=[]
    # Long offset horizontal upper housing on an upright joint. The shape
    # is a visual interpretation only; the unseen thickness is provisional.
    box(f,0,2.1,16.7,4.5,8.5,1.2,METAL)
    box(f,0,4.5,17.6,3.5,4.2,5.6,METAL)
    cylinder(f,0,4.5,21.5,2.4,5.0,"x",LIGHT)
    cylinder(f,0,4.5,21.5,1.1,5.3,"x",DARK)
    box(f,0,-1.7,21.0,5.2,15.2,3.0,PANEL)
    box(f,0,-1.7,24.0,5.2,15.2,.7,LIGHT)
    box(f,0,-9.5,21.2,5.4,1.0,2.8,METAL)
    box(f,0,8.5,22.1,2.1,5.5,.9,METAL)
    return f

def project(p,theta):
    x,y,z=p;rx=x*math.cos(theta)-y*math.sin(theta);ry=x*math.sin(theta)+y*math.cos(theta)
    return (W/2+rx*2,78+ry*1.16-z*2,ry+z*.58)

def paint(faces,angle):
    colors=[[CLEAR]*W for _ in range(H)]
    depth=[[-1e9]*W for _ in range(H)]
    for vertices,color,shade in faces:
        pts=[project(p,angle) for p in vertices]
        rgb=tuple(max(0,min(255,round(c*shade))) for c in color)+(255,)
        for i in range(1,len(pts)-1):
            a,b,c=pts[0],pts[i],pts[i+1];den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
            if abs(den)<1e-6:continue
            for y in range(max(0,math.floor(min(a[1],b[1],c[1]))),min(H,math.ceil(max(a[1],b[1],c[1])))):
                for x in range(max(0,math.floor(min(a[0],b[0],c[0]))),min(W,math.ceil(max(a[0],b[0],c[0])))):
                    u=((b[1]-c[1])*(x+.5-c[0])+(c[0]-b[0])*(y+.5-c[1]))/den
                    v=((c[1]-a[1])*(x+.5-c[0])+(a[0]-c[0])*(y+.5-c[1]))/den
                    t=1-u-v
                    if min(u,v,t)<-1e-7:continue
                    d=u*a[2]+v*b[2]+t*c[2]
                    if d>=depth[y][x]:depth[y][x]=d;colors[y][x]=rgb
    # Only exterior outline; keep the hard native pixel edges.
    for y in range(1,H-1):
        for x in range(1,W-1):
            if colors[y][x][3] and any(depth[y+dy][x+dx]<-1e8 for dx,dy in ((0,1),(0,-1),(1,0),(-1,0))):
                colors[y][x]=tuple(round(c*.65) for c in colors[y][x][:3])+(255,)
    return colors

def chunk(k,d):
    return struct.pack(">I",len(d))+k+d+struct.pack(">I",zlib.crc32(k+d)&0xffffffff)
def main():
    # Columns: down, down-left, left, up-left, up, up-right, right, down-right.
    rows=[]
    for faces in (*(chassis(i) for i in range(4)),head()):
        cells=[paint(faces,i*math.pi/4) for i in range(8)]
        rows.extend([sum((c[y] for c in cells),[]) for y in range(H)])
    raw=b"".join(b"\0"+bytes(v for p in r for v in p) for r in rows)
    data=b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",W*8,H*5,8,6,0,0,0))+chunk(b"IDAT",zlib.compress(raw,9))+chunk(b"IEND",b"")
    dst=ROOT/"public/assets/pixel-jijia/robot-guodong-study.png"
    dst.write_bytes(data)
    print(dst.name,len(data))
if __name__=="__main__":main()
