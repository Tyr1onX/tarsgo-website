import type { Direction, Place } from "./pixel-jijia-world";

export type Palette = { roof: string; roofDark: string; wall: string; trim: string; accent: string };
export const PALETTES: Palette[] = [
  { roof: "#b96c46", roofDark: "#704338", wall: "#e7c7a0", trim: "#715348", accent: "#c5deca" },
  { roof: "#617da2", roofDark: "#41516c", wall: "#ead7b8", trim: "#6f604e", accent: "#f6d38b" },
  { roof: "#6c9aa4", roofDark: "#395b73", wall: "#d9e5db", trim: "#637d80", accent: "#a8e9db" },
  { roof: "#8e6c97", roofDark: "#584964", wall: "#e8dcc8", trim: "#695d74", accent: "#d4e7f4" },
  { roof: "#b98652", roofDark: "#72523d", wall: "#f0dbb7", trim: "#8e6a4d", accent: "#f8e2aa" },
  { roof: "#7e7ca5", roofDark: "#494965", wall: "#dedde8", trim: "#62698c", accent: "#c4e1fd" },
];

export function block(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string) {
  c.fillStyle = fill;
  c.fillRect(Math.round(x), Math.round(y), Math.ceil(w), Math.ceil(h));
}

export function seed(x: number, y: number) {
  let n = Math.imul(x + 73, 374761393) ^ Math.imul(y + 109, 668265263);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return (n ^ n >>> 16) >>> 0;
}

export function tile(c: CanvasRenderingContext2D, kind: "grass" | "flower" | "soil" | "stone" | "plank" | "water", x: number, y: number, size = 16) {
  const n = seed(Math.floor(x / 16), Math.floor(y / 16));
  const base = {
    grass: ["#65935d", "#729e62", "#7ca76b"], flower: ["#65935d", "#729e62", "#7ca76b"],
    soil: ["#c9a76e", "#d6b27d", "#deb989"],
    stone: ["#b4a9a1", "#c3b6ab", "#d0bfb0"],
    plank: ["#a8754f", "#b88456", "#c29362"],
    water: ["#368c9b", "#49a1ab", "#66bac3"],
  }[kind];
  block(c, x, y, size, size, base[n % base.length]);
  if (kind === "stone") {
    block(c, x + 1, y + 1, size - 2, size - 2, base[(n + 1) % 3]);
    block(c, x, y + size - 2, size, 2, "#988c88");
    block(c, x + (n % 7) + 4, y + 2, 1, 5, "#e1d2c4");
  } else if (kind === "plank") {
    block(c, x, y + 6, size, 2, "#79523c");
    block(c, x + (n % 8), y + 2, 2, 4, "#d7a575");
    block(c, x + (n % 8) + 5, y + 10, 2, 3, "#704e3b");
  } else if (kind === "soil") {
    block(c, x + n % 11, y + (n >>> 6) % 11, 3, 2, "#e8c899");
    block(c, x + (n >>> 4) % 10, y + 12, 3, 2, "#b68f5f");
  } else if (kind === "water") {
    block(c, x + (n % 8), y + (n >>> 5) % 10, 6, 2, "#b5e6d9");
    block(c, x + (n >>> 4) % 10, y + 12, 4, 1, "#287989");
  } else {
    if (n % 5 === 0) {
      block(c, x + n % 10 + 1, y + 4, 2, 6, "#386d53");
      block(c, x + n % 10 - 1, y + 6, 2, 3, "#a0ba78");
    }
    if ((kind === "flower" && n % 7 === 0) || (kind === "grass" && n % 71 === 0)) {
      const fx = x + 3 + n % 9, fy = y + 4 + (n >>> 5) % 8;
      block(c, fx, fy, 4, 4, "#f5cf9c");
      block(c, fx + 1, fy + 1, 2, 2, n % 2 ? "#f8e1ca" : "#e498ab");
    }
  }
}

export function drawTree(c: CanvasRenderingContext2D, x: number, y: number, type = 0) {
  // The root (x, y) is the collision point; foliage is painted above it.
  const palettes = [
    ["#386b4d", "#578954", "#7baa65", "#a2c577"],
    ["#935767", "#d288a0", "#edb3c3", "#ffe0d8"],
    ["#8e4e35", "#c47742", "#e3a552", "#f3d07e"],
    ["#375761", "#598c82", "#8cb3ad", "#d6e5da"],
  ];
  const colors = palettes[type % 4];
  block(c, x - 15, y - 2, 33, 7, "#31583f66");
  block(c, x - 4, y - 27, 10, 27, "#634636");
  block(c, x - 1, y - 23, 3, 20, "#b18459");
  const foliage = [[-18,-45,16,23],[-5,-56,25,34],[17,-39,16,23],[-24,-28,22,23],[1,-34,24,22],[-8,-48,20,27],[13,-53,13,28]];
  foliage.forEach(([dx,dy,w,h],i) => {
    block(c,x+dx+2,y+dy+4,w,h,colors[0]);
    block(c,x+dx,y+dy,w,h,colors[i%3===0?1:2]);
    block(c,x+dx+3,y+dy+2,Math.max(4,w-9),4,colors[3]);
    if (i%2) block(c,x+dx+6,y+dy+9,5,3,colors[1]);
  });
}

export function drawFlower(c: CanvasRenderingContext2D, x: number, y: number, variant = 0) {
  block(c,x-10,y,20,5,"#466a3c");
  for(let i=0;i<3;i++) {
    const fx=x-9+i*8,fy=y-4-(i%2)*3;
    block(c,fx+3,fy+4,2,6,"#467d4d");
    block(c,fx,fy,7,7,variant%2?"#ed9ba8":"#f7c977");
    block(c,fx+2,fy+2,3,3,"#fff0c4");
  }
}

export function drawFence(c:CanvasRenderingContext2D,x:number,y:number,segments:number) {
  for(let i=0;i<segments;i++){
    const xx=x+i*16;
    block(c,xx+1,y+7,17,4,"#745039");
    block(c,xx+1,y+17,17,4,"#865a40");
    block(c,xx+5,y+1,7,30,"#794b31");
    block(c,xx+6,y+3,5,23,"#d2a06d");
    block(c,xx+7,y,3,3,"#f1d29c");
  }
}

export function drawBench(c:CanvasRenderingContext2D,x:number,y:number) {
  block(c,x+2,y+18,42,5,"#654735");
  block(c,x+2,y+5,42,10,"#b77f4d");
  block(c,x+5,y+4,36,3,"#dfac70");
  block(c,x+6,y+24,5,10,"#5a4d45");
  block(c,x+35,y+24,5,10,"#5a4d45");
}

export function drawLantern(c:CanvasRenderingContext2D,x:number,y:number) {
  block(c,x+8,y+13,4,38,"#574c47");
  block(c,x+5,y+49,10,4,"#574c47");
  block(c,x+1,y+4,19,16,"#4c4c4c");
  block(c,x+4,y+6,13,10,"#f5c881");
  block(c,x+7,y+7,6,7,"#ffeec1");
  block(c,x+3,y+2,15,4,"#8a5c43");
}

export function drawSign(c:CanvasRenderingContext2D,x:number,y:number,word:string) {
  block(c,x+4,y+42,6,20,"#714b36");
  block(c,x+56,y+42,6,20,"#714b36");
  block(c,x,y,68,45,"#694432");
  block(c,x+4,y+4,60,37,"#e4bd87");
  block(c,x+7,y+7,54,31,"#f8dfac");
  c.fillStyle="#735037";
  c.textAlign="center";
  c.font="bold 12px system-ui";
  c.fillText(word,x+34,y+26);
  c.textAlign="left";
}

export function drawBuilding(c:CanvasRenderingContext2D,p:Place,index:number) {
  const x=p.x*16,y=p.y*16,w=p.width*16,h=p.height*16;
  const {roof,roofDark,wall,trim,accent}=PALETTES[index];
  // Ground-level body and eaves, built from one consistent set of reusable pixels.
  block(c,x+9,y+h-7,w-7,17,"#33462e66");
  block(c,x+2,y+58,w-4,h-59,"#4d3f3c");
  block(c,x+7,y+62,w-14,h-70,wall);
  for(let yy=y+67;yy<y+h-6;yy+=16){
    block(c,x+9,yy,w-18,2,"#c8a17f");
    for(let xx=x+19;xx<x+w-12;xx+=38)block(c,xx,yy+2,2,11,"#cfb196");
  }
  block(c,x+3,y+8,w-6,70,roofDark);
  block(c,x+7,y+9,w-14,63,roof);
  block(c,x-3,y+73,w+6,8,roofDark);
  block(c,x-2,y+79,w+4,4,"#ebc89a");
  for(let row=0;row<5;row++){
    const yy=y+14+row*11;
    block(c,x+11,yy,w-22,3,roofDark);
    for(let xx=x+13+(row%2)*11;xx<x+w-16;xx+=22){
      block(c,xx,yy+3,3,4,"#dca175");
      if((xx+row)%3===0)block(c,xx+9,yy+5,5,2,"#ffe0ac");
    }
  }
  // Three dormer windows
  for(let k=0;k<3;k++){
    const xx=x+32+(w-64)/3*k;
    block(c,xx,y+38,23,21,roofDark);
    block(c,xx+3,y+41,17,14,"#d4debd");
    block(c,xx+6,y+43,11,9,"#8ab8bd");
    block(c,xx+11,y+43,2,12,"#fff1d4");
  }
  // A modular facade: a door and two windows.
  for(const offset of [30,w-71]){
    const yy=y+h-63,xx=x+offset;
    block(c,xx-5,yy-4,46,42,trim);
    block(c,xx,yy,36,29,"#355b62");
    block(c,xx+3,yy+3,30,21,"#9dcbd0");
    block(c,xx+15,yy+3,3,24,"#f5deb1");
    block(c,xx-8,yy+34,54,5,"#d2ac80");
  }
  const dx=x+w/2-24,dy=y+h-73;
  block(c,dx-6,dy-5,60,79,trim);
  block(c,dx,dy,48,70,"#6b5649");
  block(c,dx+5,dy+4,17,61,"#5a8c94");
  block(c,dx+26,dy+4,17,61,"#5a8c94");
  block(c,dx+20,dy+6,6,60,"#f5deb2");
  block(c,dx+16,dy+38,4,5,accent);
  block(c,dx+29,dy+38,4,5,accent);
  block(c,dx-14,y+h+1,76,6,"#e8d0a4");
  block(c,dx-19,y+h+7,86,6,"#c79e77");
  // Wall-mounted identity plaque, with distinctive insignias for each building.
  const bw=Math.min(w-56,188),bx=x+(w-bw)/2;
  block(c,bx-4,y+86,bw+8,29,roofDark);
  block(c,bx,y+88,bw,24,"#33423d");
  c.font="bold 13px system-ui";
  c.textAlign="center";
  c.fillStyle="#ffe6b0";
  c.fillText(p.title,x+w/2,y+105);
  c.textAlign="left";
  if(index===1){
    block(c,x+w/2-10,y+22,20,13,"#f4c963");
    block(c,x+w/2-5,y+35,10,12,"#f4c963");
  }
  if(index===4){
    block(c,x+4,y+h-62,54,44,roofDark);
    block(c,x+8,y+h-58,46,36,"#f4d2a0");
    for(let i=0;i<3;i++)block(c,x+13+i*13,y+h-48,7,18,"#af7359");
  }
  for(const xx of [x+25,x+w-31])drawFlower(c,xx,y+h+9,index);
}

export function drawPlayer(c:CanvasRenderingContext2D,x:number,y:number,direction:Direction,walking:boolean,time:number) {
  const step=walking?Math.floor(time*9)%2:0;
  const bob=walking?Math.sin(time*16)*1.2:0;
  const xx=Math.round(x-12),yy=Math.round(y-28-bob);
  block(c,xx+4,yy+27,22,5,"#28423666");
  // Hair, head, eyes, backpack, jacket, feet, all directions share consistent proportions.
  block(c,xx+5,yy+2,20,14,"#4c3935");
  block(c,xx+8,yy,15,5,"#6d4c3b");
  block(c,xx+7,yy+11,17,11,"#f7c99c");
  block(c,xx+4,yy+19,21,11,"#3f7b72");
  block(c,xx+8,yy+21,14,7,"#7dc3a8");
  block(c,xx+6,yy+29+(step?1:0),7,5,"#514c5e");
  block(c,xx+18,yy+29+(step?0:1),7,5,"#514c5e");
  if(direction!=="up"){
    const lx=direction==="left"?xx+9:xx+19;
    block(c,lx,yy+15,2,2,"#413b38");
    if(direction==="down")block(c,xx+11,yy+15,2,2,"#413b38");
  }else {
    block(c,xx+10,yy+13,11,8,"#654736");
  }
  block(c,xx+11,yy-7,10,5,"#f4d26b");
  block(c,xx+14,yy-10,4,3,"#fff2b5");
}
