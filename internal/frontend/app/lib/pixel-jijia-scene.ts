import { PLACES, TILE, TREES, WORLD_HEIGHT, WORLD_WIDTH, type Direction, type Position } from "./pixel-jijia-world";
import { block, seed, tile, drawTree, drawFlower, drawFence, drawBench, drawLantern, drawBuilding, drawPlayer, drawSign } from "./pixel-jijia-art";

const p = (value: number) => Math.round(value * TILE);

function fillTiles(c: CanvasRenderingContext2D, kind: "grass" | "flower" | "soil" | "stone" | "plank" | "water", x: number, y: number, width: number, height: number) {
  for (let ty = y; ty < y + height; ty++) for (let tx = x; tx < x + width; tx++) {
    tile(c, kind, p(tx), p(ty));
  }
}

function pond(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  fillTiles(c, "stone", x - 1, y - 1, w + 2, h + 2);
  fillTiles(c, "water", x, y, w, h);
  for (let k = 0; k < 9; k++) {
    const fx = p(x) + 6 + (seed(k, x) % (p(w) - 18));
    const fy = p(y) + 7 + (seed(k, y) % (p(h) - 15));
    block(c, fx, fy, 8, 2, "#d7f5dc");
  }
}

function fountain(c:CanvasRenderingContext2D) {
  const x=p(48),y=p(31.5);
  block(c,x-42,y-31,84,68,"#947d65");
  block(c,x-38,y-37,76,68,"#ead1a4");
  block(c,x-34,y-29,68,51,"#4a9eaa");
  block(c,x-30,y-24,60,41,"#66c6c8");
  block(c,x-27,y-20,54,29,"#8bd9cc");
  block(c,x-8,y-35,16,35,"#7d9384");
  block(c,x-4,y-48,8,15,"#a6c2a0");
  block(c,x-2,y-54,4,8,"#f6e2a3");
  for (const dx of [-22,21]){
    block(c,x+dx,y-17,2,12,"#d6f4de");
    block(c,x+dx+2,y-9,6,2,"#f7f4cc");
  }
  block(c,x-35,y+26,70,14,"#b48e66");
  c.fillStyle="#fff0b8";c.font="bold 12px monospace";
  c.textAlign="center";c.fillText("TARSGO",x,y+36);c.textAlign="left";
}

function signposts(c: CanvasRenderingContext2D) {
  const signs: [number,number,string][] = [
    [40,21,"吉甲小镇"],[35,37,"向梦想出发"],[56,43,"一起探索"],
  ];
  for (const [x,y,label] of signs) drawSign(c,p(x),p(y),label);
}

function createGround(c: CanvasRenderingContext2D) {
  fillTiles(c,"grass",0,0,WORLD_WIDTH,WORLD_HEIGHT);
  // The connected pathways are the navigation skeleton, not a concrete plaza.
  for(const [x,y,w,h] of [
    [0,28,96,7],[44,17,8,40],[18,19,7,28],[73,19,7,28],[18,47,61,7],
  ]) {
    fillTiles(c,"soil",x,y,w,h);
    block(c,p(x),p(y),p(w),3,"#e2c893");
    block(c,p(x),p(y+h)-3,p(w),3,"#b78b5c");
  }
  fillTiles(c,"stone",32,23,32,23);
  // Warm edging and garden pockets bring the six buildings together.
  block(c,p(32)-5,p(23)-5,p(32)+10,5,"#ead09d");
  block(c,p(32)-5,p(46),p(32)+10,5,"#c4a16d");
  for(const [x,y,w,h] of [
    [1,1,35,7],[60,1,35,7],[1,38,7,22],[88,38,7,22],
    [28,10,8,12],[60,10,7,12],[28,42,8,13],[60,42,7,13],
  ]) fillTiles(c,"flower",x,y,w,h);
  pond(c,3,28,9,6);
  pond(c,84,28,9,6);
  for(const [x,y] of [[10,23],[86,23],[9,44],[87,44],[31,25],[64,25],[31,42],[64,42]]) {
    drawFence(c,p(x),p(y),4);
  }
  // Field flowers around the plazas (the collider set remains unchanged).
  for(let i=0;i<65;i++){
    const x=3+seed(i,47)%90,y=3+seed(i,91)%58;
    if((x>36&&x<60)||(y>24&&y<40)) continue;
    drawFlower(c,p(x),p(y),i);
  }
}

function placeDecorations(c:CanvasRenderingContext2D) {
  TREES.forEach((position,i)=>drawTree(c,p(position.x),p(position.y),i%4));
  for(const [x,y] of [[29,22],[65,22],[29,44],[65,44],[8,23],[88,23]])drawLantern(c,p(x),p(y));
  for(const [x,y] of [[34,26],[58,26],[34,42],[58,42],[27,16],[67,16],[27,49],[67,49]])drawBench(c,p(x),p(y));
  for(const [x,y] of [[15,25],[82,25],[36,42],[60,42],[38,26],[56,26]])drawFlower(c,p(x),p(y),x%3);
  signposts(c);
  const travelers:[number,number,Direction][]=[
    [17,26,"down"],[78,26,"left"],[31,38,"right"],[66,39,"up"],
    [57,26,"down"],[24,38,"left"],[43,22,"right"],[54,22,"up"],[57,44,"left"],
  ];
  travelers.forEach(([x,y,d],i)=>{
    c.save();
    c.globalAlpha=0.85;
    drawPlayer(c,p(x),p(y),d,false,i*3);
    c.restore();
  });
  fountain(c);
}

export function renderTown(): HTMLCanvasElement {
  const canvas=document.createElement("canvas");
  canvas.width=WORLD_WIDTH*TILE;
  canvas.height=WORLD_HEIGHT*TILE;
  const c=canvas.getContext("2d");
  if(!c)throw new Error("地图画布不可用");
  c.imageSmoothingEnabled=false;
  createGround(c);
  PLACES.forEach((place,index)=>drawBuilding(c,place,index));
  placeDecorations(c);
  return canvas;
}

export function renderExplorer(
  ctx:CanvasRenderingContext2D,player:Position,direction:Direction,
  walking:boolean,elapsed:number,camera:Position,
) {
  drawPlayer(ctx,player.x*TILE-camera.x,player.y*TILE-camera.y,direction,walking,elapsed);
}
