"""Prepare independent explorer animation cells from the original authored character.

The face, hair and costume identity are retained from the original pixel art.
Action-specific limb silhouettes, poses and their local pixel clusters are
authored here offline; the game only samples the exported transparent atlas.
No drawing library or runtime dependency is required.
"""
from pathlib import Path
import math
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "scripts/assets/pixel-explorer-source.png"
DEST = ROOT / "public/assets/pixel-jijia/explorer-actions-v3.png"
W, H = 40, 54
DIRS = ("down", "left", "right", "up")
# Keep the source artwork's four walk cells; other rows have independent poses.
ACTIONS = ("walk", "idle", "run", "sit", "stand", "observe", "wade", "swim", "enter", "exit", "cast", "wait", "bite", "reel", "catch", "turn", "swim-turn")
FRAMES = 6
INK = (43, 34, 32, 255)
HAIR = (65, 43, 36, 255)
COAT = (48, 65, 53, 255)
COAT_LIGHT = (76, 91, 68, 255)
COAT_SHADE = (35, 49, 42, 255)
SHIRT = (211, 200, 159, 255)
SKIN = (237, 195, 156, 255)
SKIN_SHADE = (169, 113, 86, 255)
PANTS = (60, 47, 43, 255)
PANTS_LIGHT = (87, 66, 55, 255)
BOOT = (100, 68, 45, 255)
BOOT_LIGHT = (157, 112, 72, 255)
STRAP = (166, 116, 69, 255)
WATER = (113, 181, 183, 255)
CLEAR = (0,0,0,0)

def read_png(path):
    data=path.read_bytes(); at=8; parts=[]
    while at<len(data):
        n=int.from_bytes(data[at:at+4],"big");kind=data[at+4:at+8];v=data[at+8:at+8+n];at+=n+12
        if kind==b"IHDR":
            width,height,depth,color,_,_,interlace=struct.unpack(">IIBBBBB",v)
            assert (depth,color,interlace)==(8,6,0)
        elif kind==b"IDAT": parts.append(v)
    raw=zlib.decompress(b"".join(parts));stride=width*4;last=bytearray(stride);rows=[]
    for y in range(height):
        f=raw[y*(stride+1)];r=bytearray(raw[y*(stride+1)+1:(y+1)*(stride+1)])
        if f:
            for x in range(stride):
                a=r[x-4] if x>=4 else 0;b=last[x];c=last[x-4] if x>=4 else 0
                if f==1:k=a
                elif f==2:k=b
                elif f==3:k=(a+b)//2
                else:
                    t=a+b-c;k=min((a,b,c),key=lambda q:abs(t-q))
                r[x]=(r[x]+k)&255
        rows.append([tuple(r[x:x+4]) for x in range(0,stride,4)]);last=r
    return rows

def chunk(k,d):
    return struct.pack(">I",len(d))+k+d+struct.pack(">I",zlib.crc32(k+d)&0xffffffff)

source=read_png(SOURCE)
def original(direction,frame):
    n=DIRS.index(direction)
    return [r[frame*W:(frame+1)*W] for r in source[n*H:(n+1)*H]]

def blank():return [[CLEAR]*W for _ in range(H)]
def dot(p,x,y,c):
    if 0<=x<W and 0<=y<H:p[y][x]=c
def rect(p,x,y,w,h,c):
    for j in range(y,y+h):
        for i in range(x,x+w):dot(p,i,j,c)
def poly(p,points,color):
    # Integer scan conversion: every edge is a deliberately hard pixel boundary.
    for y in range(max(0,min(y for _,y in points)),min(H,max(y for _,y in points)+1)):
        for x in range(max(0,min(x for x,_ in points)),min(W,max(x for x,_ in points)+1)):
            inside=False
            for (a,b),(c,d) in zip(points,points[1:]+points[:1]):
                if (b>y+.5)!=(d>y+.5) and x+.5<(c-a)*(y+.5-b)/(d-b)+a:inside=not inside
            if inside:dot(p,x,y,color)
def stroke(p,points,color,width=1):
    for (x0,y0),(x1,y1) in zip(points,points[1:]):
        steps=max(1,abs(x1-x0),abs(y1-y0))
        for n in range(steps+1):
            x=round(x0+(x1-x0)*n/steps);y=round(y0+(y1-y0)*n/steps)
            rect(p,x-width//2,y-width//2,width,width,color)
def paste(p,im,x0,y0,x1,y1,dx=0,dy=0):
    for y in range(y0,y1):
        for x in range(x0,x1):
            c=im[y][x]
            if c[3]>127:dot(p,x+dx,y+dy,(c[0],c[1],c[2],255))
def flip(p):return [list(reversed(row)) for row in p]

def limb(p,a,b,c,light,shade=COAT_SHADE,wide=4):
    # Folded sleeve or trouser leg. Use stepped edges and two lit textile clusters.
    stroke(p,[a,b,c],INK,wide+2);stroke(p,[a,b,c],shade,wide)
    stroke(p,[a,b],light,max(1,wide-2))
    dot(p,b[0]-1,b[1]-1,light)
def hand(p,x,y):
    rect(p,x-2,y-1,5,4,INK);rect(p,x-1,y,3,2,SKIN);dot(p,x+1,y+2,SKIN_SHADE);dot(p,x-1,y,SHIRT)
def boot(p,x,y,sign):
    pts=[(x-3,y-4),(x+2,y-4),(x+3,y-2),(x+3+sign,y),(x+2+sign,y+2),(x-3,y+2),(x-4,y)]
    poly(p,pts,INK);rect(p,x-2,y-3,4,3,BOOT)
    rect(p,x-2+sign,y-2,3,1,BOOT_LIGHT);rect(p,x-2,y+1,5,1,PANTS_LIGHT)

def head(p,direction,dy=0,dx=0,frame=0):
    paste(p,original(direction,frame%4),0,0,W,28,dx,dy)

def front_body(p,direction,cy,frame,action,lean=0):
    back=direction=="up"; center=20+lean
    # Trouser seat / hips before sleeves and torso so limbs never hide the strap.
    poly(p,[(center-6,cy+9),(center+6,cy+9),(center+7,cy+17),(center-7,cy+17)],INK)
    rect(p,center-5,cy+11,10,5,PANTS);rect(p,center-4,cy+12,4,2,PANTS_LIGHT)
    if action=="run":
        strides=[(-5,4),(0,7),(5,4),(5,-4),(0,-7),(-5,-4)]
        stride,other=strides[frame]
        for dx,shift in [(-4,stride),(4,other)]:
            a=(center+dx,cy+13);b=(center+dx+shift//2,cy+18);c=(center+dx+shift//2,cy+23-(abs(shift)//3))
            limb(p,a,b,c,PANTS_LIGHT,PANTS,4);boot(p,c[0],c[1]+1,1 if shift>0 else -1)
    elif action in ("sit","stand"):
        k=[0,1,2,3,4,5][frame]
        fold=k if action=="sit" else 5-k
        for dx in [-5,5]:
            a=(center+dx,cy+13);b=(center+dx+(-1 if dx<0 else 1)*fold//2,cy+17);c=(b[0],cy+22-fold)
            limb(p,a,b,c,PANTS_LIGHT,PANTS,4);boot(p,c[0],c[1],-1 if dx<0 else 1)
    elif action in ("swim","enter","exit"):
        # Actual swimming leg silhouette extends horizontally behind shoulders.
        kick=[0,2,3,1,-2,-3][frame]
        for dx,dy in [(-4,kick),(4,-kick)]:
            a=(center+dx,cy+13);b=(center+dx,cy+17+dy//2);c=(center+dx+dy//2,cy+20+dy)
            limb(p,a,b,c,PANTS_LIGHT,PANTS,3)
    else:
        step=[0,2,3,0,-2,-3][frame] if action=="wade" else 0
        for dx,shift in [(-4,step),(4,-step)]:
            a=(center+dx,cy+13);b=(center+dx,cy+18);c=(center+dx,cy+23-shift//2)
            limb(p,a,b,c,PANTS_LIGHT,PANTS,4);boot(p,c[0],c[1],-1 if dx<0 else 1)
    # Coat's pixel silhouette and folds. Original costume colours, independent shape.
    poly(p,[(center-4,cy-1),(center+4,cy-1),(center+8,cy+3),(center+7,cy+12),(center+5,cy+16),(center-6,cy+16),(center-8,cy+11),(center-8,cy+3)],INK)
    poly(p,[(center-4,cy),(center+4,cy),(center+6,cy+3),(center+5,cy+13),(center-5,cy+14),(center-7,cy+4)],COAT)
    stroke(p,[(center-5,cy+2),(center-6,cy+7),(center-5,cy+11)],COAT_LIGHT,2)
    if not back:
        poly(p,[(center-3,cy),(center+3,cy),(center+2,cy+6),(center,cy+10),(center-2,cy+6)],SHIRT)
        stroke(p,[(center+5,cy+1),(center-4,cy+12)],INK,3);stroke(p,[(center+5,cy+1),(center-4,cy+12)],STRAP,2)
    else:
        stroke(p,[(center+4,cy+1),(center-4,cy+13)],STRAP,2)
        rect(p,center-5,cy+7,6,7,INK);rect(p,center-4,cy+8,4,5,BOOT);rect(p,center-4,cy+8,3,1,BOOT_LIGHT)
    # Different arm silhouettes: reach, catch, fold, and water strokes.
    if action=="swim":
        reach=[(0,-9),(3,-5),(6,1),(7,5),(3,8),(-1,1)][frame]
        for sign,delta in [(-1,reach),(1,(-reach[0],-reach[1]))]:
            a=(center+sign*7,cy+3);b=(center+sign*(9+abs(delta[0])//2),cy+2+delta[1]//2);c=(center+sign*(9+abs(delta[0])),cy+4+delta[1])
            limb(p,a,b,c,COAT_LIGHT,COAT_SHADE,3);hand(p,*c)
    elif action in ("cast","wait","bite","reel","catch","observe"):
        if action=="cast": reach=[(-8,-4),(-10,-10),(-8,-12),(0,-9),(9,-1),(10,3)][frame]
        elif action=="reel":reach=[(9,4),(8,2),(5,-1),(2,-4),(-3,-5),(-4,-1)][frame]
        elif action=="catch":reach=[(7,4),(7,1),(5,-3),(4,-4),(4,-3),(5,0)][frame]
        elif action=="bite":reach=[(9,5),(10,3),(7,1),(9,3),(10,5),(8,4)][frame]
        elif action=="observe":reach=[(7,9),(7,5),(7,0),(6,-4),(6,-4),(7,2)][frame]
        else: reach=(9,5)
        a=(center+6,cy+4);b=(center+8,cy+6);c=(center+reach[0],cy+reach[1])
        limb(p,a,b,c,COAT_LIGHT,COAT_SHADE,4);hand(p,*c)
        a=(center-6,cy+4);b=(center-8,cy+9);c=(center-4,cy+10)
        limb(p,a,b,c,COAT_LIGHT,COAT_SHADE,4);hand(p,*c)
    else:
        swing=[-4,0,4,4,0,-4][frame] if action in ("run","wade") else 0
        for sign in (-1,1):
            a=(center+sign*6,cy+3);b=(center+sign*8,cy+7+sign*swing//2);c=(center+sign*8,cy+11+sign*swing)
            limb(p,a,b,c,COAT_LIGHT,COAT_SHADE,4);hand(p,*c)

def side_body(p,cy,frame,action,lean):
    # Draw facing right; left uses a mirror of the authored silhouette.
    center=20+lean; swing=[-7,-3,6,7,3,-6][frame]
    if action=="run":
        # Alternating wide stride and a true flight phase, not vertical translation.
        for sign in (-1,1):
            shift=swing*sign
            a=(center-1,cy+13);b=(center+shift,cy+18-abs(shift)//3);c=(center+shift+(2 if shift>0 else -2),cy+22-abs(shift)//2)
            limb(p,a,b,c,PANTS_LIGHT if sign>0 else PANTS,PANTS,4);boot(p,c[0],c[1],1)
    elif action=="swim":
        kick=[-3,-1,2,4,2,-1][frame]
        for i in range(2):
            a=(center-4,cy+11);b=(center-9,cy+14+(kick if i==0 else -kick));c=(center-14,cy+15+(kick if i==0 else -kick))
            limb(p,a,b,c,PANTS_LIGHT if i else PANTS,PANTS,4);boot(p,c[0],c[1],-1)
    elif action in ("sit","stand"):
        fold=frame if action=="sit" else 5-frame
        for i in range(2):
            a=(center-1+i,cy+13);b=(center+fold+i,cy+17);c=(center+fold+i,cy+22-fold)
            limb(p,a,b,c,PANTS_LIGHT,PANTS,4);boot(p,c[0],c[1],1)
    else:
        step=[-3,0,3,3,0,-3][frame] if action=="wade" else 0
        for sign in (-1,1):
            a=(center-1,cy+13);b=(center+sign*step,cy+18);c=(center+sign*step,cy+22)
            limb(p,a,b,c,PANTS_LIGHT,PANTS,4);boot(p,c[0],c[1],1)
    poly(p,[(center-7,cy+1),(center+2,cy-1),(center+5,cy+4),(center+4,cy+10),(center+2,cy+16),(center-6,cy+15),(center-8,cy+8)],INK)
    poly(p,[(center-6,cy+2),(center+1,cy),(center+3,cy+4),(center+2,cy+13),(center-5,cy+14),(center-7,cy+8)],COAT)
    stroke(p,[(center+1,cy+1),(center+1,cy+7),(center-1,cy+12)],COAT_LIGHT,2)
    stroke(p,[(center-2,cy+1),(center-7,cy+12)],STRAP,2)
    rect(p,center-9,cy+7,5,7,INK);rect(p,center-8,cy+8,3,5,BOOT);rect(p,center-8,cy+8,3,1,BOOT_LIGHT)
    if action=="swim":
        reach=[(12,-5),(15,0),(12,5),(7,9),(-1,8),(6,1)][frame]
        for delta in [(reach[0],reach[1]),(4,3)]:
            a=(center,cy+4);b=(center+delta[0]//2,cy+delta[1]//2+2);c=(center+delta[0],cy+delta[1])
            limb(p,a,b,c,COAT_LIGHT,COAT_SHADE,3);hand(p,*c)
    else:
        if action=="run": reach=(swing,5 if swing>0 else 8)
        elif action=="cast": reach=[(-9,-3),(-9,-9),(-5,-11),(4,-8),(11,-1),(10,5)][frame]
        elif action=="reel":reach=[(12,3),(10,1),(6,-2),(2,-6),(5,-4),(7,1)][frame]
        elif action=="catch":reach=[(10,3),(8,-1),(6,-4),(7,-5),(7,-3),(9,0)][frame]
        elif action=="bite":reach=[(11,5),(13,2),(7,1),(9,2),(12,4),(10,5)][frame]
        elif action=="wait":reach=(10,5)
        elif action=="observe":reach=[(4,10),(6,3),(7,-3),(7,-5),(7,-5),(6,1)][frame]
        else:reach=(2,11)
        a=(center,cy+4);b=(center+reach[0]//2,cy+6);c=(center+reach[0],cy+reach[1])
        limb(p,a,b,c,COAT_LIGHT,COAT_SHADE,4);hand(p,*c)

def swim_body(p,direction,frame,turn=False):
    # Independent horizontal swimming artwork. The head is ahead of the
    # chest; rear legs kick under the surface and a reaching arm is visible.
    side=direction in ("left","right")
    if side:
        kick=[-3,-1,3,4,1,-3][frame]
        for j,sign in enumerate((-1,1)):
            a=(13,37+j*2);b=(8,39+sign*kick);c=(3,41+sign*kick)
            limb(p,a,b,c,PANTS_LIGHT if j else PANTS,PANTS,4)
            boot(p,c[0]+1,c[1],-1)
        poly(p,[(7,31),(14,29),(23,30),(28,34),(27,42),(21,46),(12,44),(7,40)],INK)
        poly(p,[(9,32),(15,31),(23,32),(26,35),(24,42),(19,44),(11,42)],COAT)
        stroke(p,[(10,33),(17,32),(23,34)],COAT_LIGHT,2)
        stroke(p,[(23,32),(13,42)],STRAP,2)
        reach=[(36,30),(37,34),(34,39),(28,43),(20,40),(29,30)][frame]
        limb(p,(23,35),((23+reach[0])//2,reach[1]+1),reach,COAT_LIGHT,COAT_SHADE,4)
        hand(p,*reach)
        other=[(22,43),(20,43),(23,39),(29,32),(34,30),(35,34)][frame]
        limb(p,(18,36),((18+other[0])//2,other[1]),other,COAT_LIGHT,COAT_SHADE,3)
        hand(p,*other)
        if direction=="left":p[:]=flip(p)
        head(p,direction,4,-6 if direction=="left" else 6)
    else:
        kick=[-2,1,3,0,-2,0][frame]
        for sign in (-1,1):
            a=(20+sign*4,39);b=(20+sign*5,46);c=(20+sign*(5+kick),51-abs(kick))
            limb(p,a,b,c,PANTS_LIGHT,PANTS,4);boot(p,c[0],c[1],sign)
        poly(p,[(13,28),(27,28),(29,34),(27,44),(24,46),(16,46),(11,35)],INK)
        poly(p,[(14,30),(26,30),(27,34),(25,43),(15,44),(13,35)],COAT)
        stroke(p,[(14,31),(13,36),(15,41)],COAT_LIGHT,2)
        if direction=="down":
            rect(p,18,29,4,8,SHIRT);stroke(p,[(26,30),(16,42)],STRAP,2)
        else:stroke(p,[(25,31),(16,42)],STRAP,2)
        reaches=[(5,28),(3,34),(6,40),(11,44),(12,37),(7,29)]
        for sign,idx in [(-1,frame),(1,(frame+3)%6)]:
            x,y=reaches[idx];x=x if sign<0 else 39-x
            a=(20+sign*7,33);b=(20+sign*11,(33+y)//2);c=(x,y)
            limb(p,a,b,c,COAT_LIGHT,COAT_SHADE,4);hand(p,*c)
        head(p,direction,2,0)
    if turn:
        # A curved turning stroke shifts the near shoulder rather than
        # merely flipping an otherwise identical stationary pose.
        x=8 if direction=="left" else 31
        for k in range(3):dot(p,x+k*(1 if direction!="left" else -1),43+k%2,WATER)

def authored(direction,action,frame):
    if action=="walk":return original(direction,frame%4)
    if action in ("swim","swim-turn"):
        p=blank();swim_body(p,direction,frame,action=="swim-turn");return p
    if action=="idle":
        p=[r[:] for r in original(direction,0)]
        # Brief eyelid closure on the original face; leave hair and clothing intact.
        if frame==5 and direction!="up":
            xs=range(13,16) if direction=="left" else range(24,27) if direction=="right" else list(range(14,17))+list(range(23,26))
            for x in xs:dot(p,x,22,HAIR)
        return p
    # Pose anchors preserve the same foot coordinate. Head art remains original.
    if action in ("sit","stand"): offset=[0,2,4,6,7,8][frame if action=="sit" else 5-frame]
    elif action=="swim":offset=10
    elif action=="enter":offset=[0,3,6,9,12,14][frame]
    elif action=="exit":offset=[14,12,9,6,3,0][frame]
    elif action=="wade":offset=3
    elif action=="run":offset=[-1,-3,-2,-1,-3,-2][frame]
    else:offset=0
    # Swimming legs are deliberately horizontal in the side pose.
    actual="swim" if action in ("enter","exit") and offset>=9 else "wade" if action in ("enter","exit") else action
    side=direction in ("left","right")
    p=blank(); lean=3 if action=="run" and side else ([0,1,2,1,0,0][frame] if action=="turn" else 0)
    cy=27+offset
    if actual=="swim":
        swim_body(p,direction,frame);return p
    if side:
        side_body(p,cy,frame,actual,lean)
        if direction=="left":p=flip(p)
    else:front_body(p,direction,cy,frame,actual)
    head(p,direction,offset,(-lean if direction=="left" else lean),0)
    return p

def main():
    width=FRAMES*W;height=len(ACTIONS)*len(DIRS)*H
    atlas=bytearray(width*height*4)
    for ai,action in enumerate(ACTIONS):
        for di,direction in enumerate(DIRS):
            for frame in range(FRAMES):
                p=authored(direction,action,frame)
                for y,row in enumerate(p):
                    start=(((ai*4+di)*H+y)*width+frame*W)*4
                    atlas[start:start+W*4]=bytes(v for color in row for v in color)
    raw=b"".join(b"\0"+atlas[y*width*4:(y+1)*width*4] for y in range(height))
    output=b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",width,height,8,6,0,0,0))+chunk(b"IDAT",zlib.compress(raw,9))+chunk(b"IEND",b"")
    DEST.write_bytes(output)
    print(f"{DEST.name}: {width}×{height}, {len(ACTIONS)*4*FRAMES} independently addressable frames, {len(output)} bytes")

if __name__=="__main__":main()
