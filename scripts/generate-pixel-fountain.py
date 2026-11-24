"""Paint a native 192px fountain using the campus's authored stone and water textures.
The sprite is a layered stone basin, rim, pedestal, upper bowl and individual
water streams. It is exported into the existing building atlas, not a runtime drawing.
"""
from pathlib import Path
import importlib.util
import math,json,struct,zlib
ROOT=Path(__file__).resolve().parents[1]
def load_script(name):
 spec=importlib.util.spec_from_file_location(name,ROOT/"scripts"/(name+".py"));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
g=load_script("generate-pixel-ground")
e=load_script("generate-pixel-explorer")
_,_,source=g.read_rgb_png(g.SOURCE)
N=192
CLEAR=(0,0,0,0)
p=[[CLEAR]*N for _ in range(N)]
def dot(x,y,c):
 x,y=round(x),round(y)
 if 0<=x<N and 0<=y<N:p[y][x]=tuple(c)+(255,) if len(c)==3 else tuple(c)
def rgb(c,n=0):return tuple(max(0,min(255,round(v+n))) for v in c)
def material(x,y,base,water=False):
 ox,oy=(256,256) if water else (0,256)
 # Sample interior of original art instead of adding uncorrelated pixel noise.
 a,b,c=g.pixel(source,512,ox+12+x%40,oy+12+y%40)
 l=(a*.25+b*.55+c*.2)-(143 if water else 160)
 return rgb(base,l*(.48 if water else .28))
def oval(cx,cy,rx,ry,base,edge=None,water=False):
 for y in range(round(cy-ry)-1,round(cy+ry)+2):
  for x in range(round(cx-rx)-1,round(cx+rx)+2):
   d=((x-cx)/rx)**2+((y-cy)/ry)**2
   if d>1:continue
   light=(1-(y-cy)/ry)*6-(x-cx)/rx*5
   c=edge if edge and d>.94 else material(x,y,rgb(base,light),water)
   dot(x,y,c)
def stroke(points,c,width=1):
 for (x0,y0),(x1,y1) in zip(points,points[1:]):
  n=max(1,round(math.hypot(x1-x0,y1-y0)*1.5))
  for i in range(n+1):
   x=round(x0+(x1-x0)*i/n);y=round(y0+(y1-y0)*i/n)
   for dy in range(-(width//2),width-width//2):
    for dx in range(-(width//2),width-width//2):dot(x+dx,y+dy,c)
def curve(points,c,width=1):stroke(points,c,width)
def arc(cx,cy,rx,ry,a,b,c,width=1):
 curve([(cx+math.cos(a+(b-a)*i/80)*rx,cy+math.sin(a+(b-a)*i/80)*ry) for i in range(81)],c,width)
# Thin ground shadow, lower plinth and beveled stone outer wall.
oval(96,145,88,38,(77,85,76,90))
oval(96,137,85,42,(117,113,106),(70,79,76))
oval(96,133,84,42,(150,142,127),(103,102,91))
oval(96,128,84,42,(172,164,145),(92,99,91))
# Vertical masonry joints on the curved visible front; lighter bevels above.
for k in range(1,12):
 a=math.pi*k/12
 x=96+math.cos(a)*82;y=128+math.sin(a)*41
 stroke([(x,y-2),(x,y+9),(x*.99+.96,y+14)],(103,101,92),2)
 stroke([(x-2,y+1),(x-2,y+10)],(187,176,156),1)
arc(96,133,84,41,.03,math.pi-.03,(202,190,165),2)
arc(96,137,84,41,.02,math.pi-.02,(102,105,96),1)
# Wide, carved upper rim with individual radial stone blocks.
oval(96,117,86,43,(202,190,166),(106,111,100))
oval(96,118,80,38,(166,156,136),(128,126,112))
oval(96,119,73,33,(61,115,133),(74,99,104),True)
oval(96,120,68,30,(62,140,159),None,True)
arc(96,117,85,42,math.pi,2*math.pi,(232,221,194),2)
arc(96,117,84,42,0,math.pi,(165,150,128),2)
for k in range(20):
 a=math.pi*2*k/20
 x0,y0=96+math.cos(a)*84,117+math.sin(a)*41
 x1,y1=96+math.cos(a)*74,117+math.sin(a)*34
 stroke([(x0,y0),(x1,y1)],(126,125,110),1)
 stroke([(x0-1,y0-1),(x1-1,y1-1)],(221,207,178),1)
# Real water texture plus small caustic groups and reflected rim highlights.
for cx,cy,rx,ry,a,b in [(51,119,17,5,.4,2.8),(140,120,18,6,.5,2.9),(96,138,33,9,.1,2.9),(78,104,13,3,3.5,5.8),(117,103,14,4,3.5,5.9)]:
 arc(cx,cy,rx,ry,a,b,(127,196,191),1)
 arc(cx,cy+1,rx-2,ry,a+.2,b-.1,(168,215,207),1)
# Base of the central carved pedestal and fluted stone column.
oval(96,120,23,12,(106,122,119),(64,91,94))
oval(96,116,22,11,(188,178,155),(100,112,108))
oval(96,110,17,8,(212,199,175),(114,123,112))
for y in range(61,111):
 t=(y-61)/50;half=8+int((abs(t-.5)*2)**2*4)
 for x in range(96-half,96+half+1):
  light=14*(1-(x-(96-half))/(half*2))
  c=material(x,y,rgb((166,164,147),light))
  if x in (96-half,96+half):c=(101,112,104)
  elif (x-(96-half))%5==2:c=rgb(c,-14)
  dot(x,y,c)
oval(96,69,17,7,(182,176,154),(110,117,105))
oval(96,66,16,7,(217,207,183),(115,125,112))
# Raised upper basin, stone rim and turquoise water.
oval(96,63,37,16,(138,138,125),(87,106,103))
oval(96,59,37,15,(180,178,157),(108,121,112))
oval(96,55,38,16,(215,202,174),(107,124,114))
oval(96,55,31,11,(53,122,145),(89,127,132),True)
oval(96,56,28,9,(87,163,177),None,True)
arc(96,55,37,15,math.pi,2*math.pi,(239,226,196),2)
arc(96,55,37,15,.1,math.pi-.1,(172,160,138),1)
for k in range(12):
 a=k*math.pi*2/12
 stroke([(96+math.cos(a)*37,55+math.sin(a)*15),(96+math.cos(a)*32,55+math.sin(a)*12)],(131,132,114),1)
# Continuous irregular jets/cascades, shaded edges and fine water droplets.
def stream(points,w=3):
 stroke(points,(75,156,184),w+2);stroke(points,(134,207,218),w);stroke([(x-1,y) for x,y in points],(215,242,226),1)
stream([(96,55),(96,43),(94,32),(95,22),(96,16),(99,28),(100,37)],3)
stream([(96,26),(85,30),(79,38),(76,48),(77,55)],2)
stream([(97,26),(108,31),(114,40),(115,50),(114,57)],2)
for x,side in [(65,-1),(76,-1),(116,1),(127,1)]:
 pts=[(x,58),(x+side*2,69),(x+side*5,83),(x+side*7,99),(x+side*6,113)]
 stream(pts,2)
 for k in range(3):
  dot(x+side*(5+k),104+k*3,(204,236,227))
# Foam rings at splash points, placed entirely inside the visible water.
for x,y in [(59,115),(70,116),(121,116),(133,115)]:
 arc(x,y,8,3,.1,math.pi-.1,(208,237,223),1)
 for dx,dy in [(-3,-1),(0,0),(3,-2),(6,1)]:dot(x+dx,y+dy,(222,244,230))
def chunk(k,d):return struct.pack(">I",len(d))+k+d+struct.pack(">I",zlib.crc32(k+d)&0xffffffff)
def png(path,rows,w,h):
 raw=b"".join(b"\0"+bytes(v for px in row for v in px) for row in rows)
 path.write_bytes(b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",w,h,8,6,0,0,0))+chunk(b"IDAT",zlib.compress(raw,9))+chunk(b"IEND",b""))
def main():
 atlas=ROOT/"public/assets/pixel-jijia/campus-buildings-v3.png"
 meta_path=atlas.with_suffix(".json");meta=json.loads(meta_path.read_text())
 rows=e.read_png(atlas);w=len(rows[0]);old=meta["sprites"]["fountain"]
 ox,oy,ow,oh=old
 for y in range(oy,min(len(rows),oy+oh)):
  rows[y][ox:ox+ow]=[CLEAR]*ow
 # Keep the generated six building cells intact and replace only the fountain.
 rows=rows[:1024]+[[CLEAR]*w for _ in range(N)]
 for j,row in enumerate(p):rows[1024+j][0:N]=row
 meta["sprites"]["fountain"]=[0,1024,N,N]
 meta["source"]="Six image-generated campus buildings and an independently painted textured stone fountain."
 png(atlas,rows,w,len(rows));meta_path.write_text(json.dumps(meta,indent=2)+"\n")
 print("New fountain:",N,"x",N,"; atlas",w,"x",len(rows))
if __name__=="__main__":main()
