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
W,H=64,56
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
        if roller:shade+=.50 if (i+phase)%3==0 else 0
        faces.append(([rings[0][i],rings[0][j],rings[1][j],rings[1][i]],color,shade))
    for end in (0,1):
        faces.append((rings[end],color,.82 if end else .95))

def chassis(frame):
    f=[]
    # Each visible side has the large roller profile and two sloped armor panels.
    # Back-side symmetry and transverse arrangement are provisional.
    for side in (-1,1):
        cylinder(f,0,side*9.8,5.7,6.0,3.3,"y",TYRE,frame,True)
        cylinder(f,0,side*11.6,5.7,3.6,.8,"y",RIM)
        cylinder(f,0,side*12.1,5.7,1.7,.5,"y",DARK)
    for side in (-1,1):
        for end in (-1,1):
            # The end silhouette is a pair of narrow roller strips, not a track.
            for offset in (-1.3,1.3):
                cylinder(f,side*17.1,end*5.8+offset,4.2,4.0,1.9,"x",TYRE,frame,True)
                cylinder(f,side*18.3,end*5.8+offset,4.2,2.1,.5,"x",RIM)
        box(f,side*14,0,4.2,9,18,2.3,METAL)
    box(f,0,0,4.4,29,16,3,DARK)
    box(f,0,0,7.4,27,16,4.6,METAL)
    box(f,0,0,12,28,15,1.4,LIGHT)
    for side in (-1,1):
        for x in (-10.1,10.1):
            # Angled plates retain the visible sloping top/bottom profile.
            # Panel front and recessed inset use the same plane.
            def panel(w,h,c,depth):
                y=side*(9.1+depth)
                v=[(x-w/2,y,4.7),(x+w/2,y,4.7),(x+w/2-1,side*(7.9+depth),4.7+h),(x-w/2-1,side*(7.9+depth),4.7+h)]
                f.append((v,c,1.0 if side==1 else .87))
            panel(9.2,9.4,LIGHT,.75)
            panel(7.7,8.1,PANEL,.90)
            panel(5.2,5.9,METAL,1.05)
            panel(4.0,4.7,DARK,1.20)
    # Long raised rectangular rail prominent below the head in the drawing.
    box(f,0,0,13.4,23,7,3.5,METAL)
    box(f,0,-.3,16.9,22,6,1,LIGHT)
    for x in (-10.8,10.8):box(f,x,0,13.2,1.4,7.5,4.7,LIGHT)
    cylinder(f,0,0,17.8,3.2,1.5,"z",DARK)
    return f

def head():
    f=[]
    # Elevated upright head and horizontal box; visual only.
    box(f,0,0,17.9,4.8,4.8,7.8,METAL)
    cylinder(f,0,0,22.8,3.3,5.5,"x",DARK)
    cylinder(f,0,0,22.8,2.3,6.1,"x",LIGHT)
    box(f,0,-3.8,24.0,6.5,13,4.8,PANEL)
    box(f,0,-3.8,28.8,6.4,12,1,LIGHT)
    box(f,0,5.0,24.6,2.8,5.3,1.8,METAL)
    box(f,0,-9.5,24.3,6.3,1.5,4.3,DARK)
    return f

def project(p,theta):
    x,y,z=p;rx=x*math.cos(theta)-y*math.sin(theta);ry=x*math.sin(theta)+y*math.cos(theta)
    return (W/2+rx,39+ry*.58-z,ry+z*.58)

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
    for faces in (chassis(0),chassis(1),head()):
        cells=[paint(faces,i*math.pi/4) for i in range(8)]
        rows.extend([sum((c[y] for c in cells),[]) for y in range(H)])
    raw=b"".join(b"\0"+bytes(v for p in r for v in p) for r in rows)
    data=b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",W*8,H*3,8,6,0,0,0))+chunk(b"IDAT",zlib.compress(raw,9))+chunk(b"IEND",b"")
    dst=ROOT/"public/assets/pixel-jijia/robot-guodong-study.png"
    dst.write_bytes(data)
    print(dst.name,len(data))
if __name__=="__main__":main()
