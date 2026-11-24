// Native half-world-pixel artwork. Frames are rasterized once, not upscaled
// from the former 13px silhouette. All components share a ground anchor.
export const ANIMAL_WIDTH = 64;
export const ANIMAL_HEIGHT = 56;
export const ANIMAL_FRAMES = 8;
export type AnimalPose = "idle" | "forage" | "run" | "alert" | "shelter" | "sleep" | "hop" | "fly" | "perch" | "swim" | "dart" | "walk" | "jump" | "land" | "climb" | "turn" | "groom" | "takeoff" | "surface";
type Species = "sparrow" | "squirrel" | "fish";
type Color = [number,number,number];
type Point = [number,number];
const outline:Color=[65,49,45];
const russet:Color=[157,88,46], chest:Color=[225,190,139], dark:Color=[106,65,43];
const fur:Color=[192,116,62], tail:Color=[175,102,56];
const bird:Color=[137,113,86], feather:Color=[104,83,66], cream:Color=[220,205,172];
const black:Color=[38,37,35], shine:Color=[250,232,192];
const shift=(c:Color,n:number):Color=>[c[0]+n,c[1]+n,c[2]+n];
const fract=(x:number,y:number)=>((Math.imul(x+13,73856093)^Math.imul(y+7,19349663))>>>0)%11;

class Frame {
  readonly pixels=new Uint8ClampedArray(ANIMAL_WIDTH*ANIMAL_HEIGHT*4);
  dot(x:number,y:number,c:Color){
    x=Math.round(x);y=Math.round(y);
    if(x<0||y<0||x>=ANIMAL_WIDTH||y>=ANIMAL_HEIGHT)return;
    const i=(y*ANIMAL_WIDTH+x)*4;
    this.pixels[i]=c[0];this.pixels[i+1]=c[1];this.pixels[i+2]=c[2];this.pixels[i+3]=255;
  }
  line(x:number,y:number,x2:number,y2:number,c:Color){
    const n=Math.max(1,Math.ceil(Math.hypot(x2-x,y2-y)));
    for(let i=0;i<=n;i++)this.dot(x+(x2-x)*i/n,y+(y2-y)*i/n,c);
  }
  ellipse(cx:number,cy:number,rx:number,ry:number,c:Color,edge:Color=outline,texture=1){
    for(let y=Math.floor(cy-ry);y<=cy+ry;y++)for(let x=Math.floor(cx-rx);x<=cx+rx;x++){
      const dx=(x-cx)/rx,dy=(y-cy)/ry,d=dx*dx+dy*dy;
      if(d>1)continue;
      const border=((Math.abs(x-cx)+.85)/rx)**2+((Math.abs(y-cy)+.75)/ry)**2>1;
      const shade=Math.round((-dy*.5-dx*.18)*18)+(fract(x,y)-5)*texture;
      this.dot(x,y,border?edge:shift(c,shade));
    }
  }
  polygon(points:Point[],c:Color,edge:Color=outline,texture=1){
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    const minX=Math.floor(Math.min(...xs)),maxX=Math.ceil(Math.max(...xs));
    const minY=Math.floor(Math.min(...ys)),maxY=Math.ceil(Math.max(...ys));
    const inside=(x:number,y:number)=>{
      let b=false;
      for(let i=0,j=points.length-1;i<points.length;j=i++){
        const [ax,ay]=points[i],[bx,by]=points[j];
        if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)b=!b;
      }
      return b;
    };
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      if(!inside(x+.5,y+.5))continue;
      const border=!inside(x-.5,y+.5)||!inside(x+1.5,y+.5)||!inside(x+.5,y-.5)||!inside(x+.5,y+1.5);
      const shade=Math.round((.5-(y-minY)/Math.max(1,maxY-minY))*24)+(fract(x,y)-5)*texture;
      this.dot(x,y,border?edge:shift(c,shade));
    }
  }
}
function squirrelClimb(p:Frame,k:number){
  const step=Math.round(Math.sin(k*Math.PI/4)*5);
  // Vertical climbing silhouette, alternating gripping fore- and hindpaws.
  p.polygon([[29,34],[21,35],[15,40],[9,45],[6,47],[7,51],[14,54],[22,52],[30,48],[35,41],[37,33]],tail,outline,2);
  p.polygon([[12,46],[20,41],[27,39],[31,39],[27,47],[21,50],[15,50]],fur,dark,2);
  for(let i=0;i<7;i++)p.line(11+i*2,48-i*.7,16+i*2,45-i*.7,shift(tail,18-i));
  p.ellipse(33,34,9,16,russet,outline,2);
  p.ellipse(37,31,6,12,chest,shift(chest,-51),1);
  p.ellipse(33,20,9,8,fur,outline,2);
  p.ellipse(28,12,3.5,4.3,russet);p.ellipse(29,12,1.7,2.1,chest,dark);
  p.ellipse(36,11,3.8,4.5,fur);p.ellipse(36,11,1.8,2.3,chest,dark);
  p.ellipse(40,22,5.4,3.2,chest,dark);p.ellipse(45,21,2.2,1.8,black,outline,0);
  p.ellipse(37,18,2.4,2.3,black,dark,0);p.dot(37,17,shine);
  for(const [x,y,d] of [[35,25,step],[34,37,-step],[32,30,-step],[31,42,step]]){
    p.line(x,y,41,y+d,russet);p.line(x+1,y-1,40,y+d-1,fur);
    p.ellipse(43,y+d,3.6,2.3,dark);p.line(43,y+d-1,47,y+d-1,chest);p.dot(47,y+d,black);
  }
}
function squirrelTurn(p:Frame,k:number){
  const lean=Math.round(Math.sin(k*Math.PI/4)*2);
  p.polygon([[30,46],[16,42],[8,29],[8,19],[13,12],[20,9],[26,11],[33,18],[35,30],[38,41],[40,47]],tail,outline,2);
  p.polygon([[12,27],[13,18],[20,13],[26,16],[29,24],[27,34],[21,39],[17,34]],fur,dark,2);
  p.ellipse(32,41,12,11,russet,outline,2);
  p.ellipse(32,43,8,9,chest,shift(chest,-55),1);
  p.ellipse(24,49,5,3,dark);p.ellipse(40,49,5,3,dark);
  p.ellipse(32+lean,28,10,9,fur,outline,2);
  for(const sign of [-1,1]){
    const x=32+lean+sign*7;p.ellipse(x,19,3.8,4.4,fur);p.ellipse(x,19,1.9,2.4,chest,dark);
    const e=32+lean+sign*4;p.ellipse(e,27,2.1,2.3,black,dark,0);p.dot(e,26,shine);
    p.ellipse(32+sign*7,40,3,5,russet);p.dot(32+sign*7,44,chest);
  }
  p.ellipse(32+lean,32,5.7,4,chest,dark);p.ellipse(32+lean,30,2.4,1.6,black,outline,0);
  p.line(30+lean,34,34+lean,34,dark);
}
function squirrelArt(p:Frame,pose:AnimalPose,k:number){
  if(pose==="climb"){squirrelClimb(p,k);return;}
  if(pose==="turn"){squirrelTurn(p,k);return;}
  const phase=k*Math.PI/4,run=["run","walk","jump","land","turn","climb"].includes(pose),alert=pose==="alert",sleep=pose==="sleep",shelter=pose==="shelter";
  const jump=pose==="jump",walking=pose==="walk",landing=pose==="land";
  const curled=sleep||shelter,forage=pose==="forage";
  const leap=run?Math.round(Math.max(0,Math.sin(phase))*(jump?9:walking?1:landing?2:5)):0;
  const stretch=run?Math.round(Math.sin(phase)*(jump?5:walking?1:3)):0;
  const breathe=!run&&!curled&&k>=3&&k<=5?1:0;
  const y=curled?44-(k>=3&&k<=5?1:0):run?40-leap:alert?37:42-breathe;
  // Layered bushy tail with irregular fur edge, underside and highlight strands.
  const sway=run?Math.round(Math.cos(phase)*4):curled?0:Math.round(Math.sin(phase)*2);
  const rise=curled?8:run?4:0;
  const t=(x:number,y:number):Point=>[x+sway,y+rise-leap];
  p.polygon([[30,47-leap],[20,47-leap],t(11,43),t(6,36),t(4,27),t(5,20),t(7,15),t(10,14),t(11,10),t(15,11),t(18,7),t(22,8),t(26,11),t(29,16),t(31,23),t(30,29),t(26,34),t(21,36),t(23,40),[32,40-leap]],tail,outline,2);
  p.polygon([t(8,27),t(9,19),t(14,13),t(19,11),t(24,15),t(27,21),t(26,27),t(22,31),t(17,30),t(17,36),t(23,42),t(17,40),t(12,35)],fur,dark,2);
  for(let i=0;i<9;i++){
    const x=9+i*2,y0=20+(i%4)*4;
    const [sx,sy]=t(x,y0);p.line(sx,sy,sx+2,sy-4,shift(fur,22-i));
    p.line(sx+1,sy+5,sx+3,sy+2,shift(tail,-13));
  }
  if(run){
    // Opposite paws extend then tuck; silhouette changes over the whole stride.
    const front=Math.round(Math.sin(phase)*(walking?4:8)),rear=Math.round(Math.sin(phase+Math.PI)*(walking?3:7));
    const tuck=jump?Math.round(Math.max(0,Math.sin(phase))*5):0;
    const foreY=y+8-tuck,hindY=y+7-tuck;
    p.polygon([[29,y+1],[32,y+2],[30+rear,hindY-2],[32+rear,hindY+2],[27+rear,hindY+3],[25,y+4]],russet,dark,2);
    p.ellipse(30+rear,hindY,5,3,dark);
    p.polygon([[43,y],[46,y+1],[45+front,foreY-2],[48+front,foreY+1],[43+front,foreY+2],[40,y+3]],fur,dark,2);
    p.ellipse(44+front,foreY,5,2.7,russet);p.dot(47+front,foreY+1,chest);
    p.line(30+rear-2,y+8,30+rear+4,y+8,shift(dark,20));
  }else if(!curled){
    p.ellipse(33,y+9,7,3,dark);p.ellipse(46,y+9,5,2.5,russet);
    p.dot(49,y+9,chest);p.dot(50,y+9,chest);
  }
  p.ellipse(34+stretch*.3,y,curled?15:run?15+stretch:12,curled?8:run?8:11,russet,outline,2);
  p.ellipse(37+stretch*.3,y-2,curled?12:run?12+stretch:9,curled?6:7,fur,dark,2);
  p.ellipse(43+stretch*.4,y+3,curled?7:6,curled?5:7,chest,shift(chest,-65),1);
  for(let i=0;i<5;i++)p.line(29+i*2,y-5+i%2,30+i*2,y-7+i%2,shift(fur,16+i%3*6));
  const headX=curled?44:run?47+stretch:46;
  const headY=curled?y-2:landing?y-3:run?y-6:alert?y-13:forage?y-7:y-10;
  if(!curled){
    // Rounded, short squirrel ears, not rabbit-like elongated ears.
    p.ellipse(headX-6,headY-7,3.7,4.5,russet);
    p.ellipse(headX-6,headY-8,1.6,2.4,shift(chest,-23),dark);
    p.ellipse(headX+2,headY-8,4,5,fur);
    p.ellipse(headX+2,headY-8,2,3,shift(chest,-12),dark);
    p.dot(headX+1,headY-12,shift(fur,28));
  }
  p.ellipse(headX,headY,9,7,fur,outline,2);
  p.ellipse(headX+5,headY+3,6,3.5,chest,shift(dark,8),1);
  p.ellipse(headX+10,headY+2,2,2,black,outline,0);
  p.dot(headX+10,headY+1,shift(black,33));
  if(sleep||(!alert&&!run&&k===6)){
    p.line(headX+1,headY,headX+5,headY+1,black);
  }else{
    p.ellipse(headX+3,headY-1,2.5,2.6,black,dark,0);p.dot(headX+3,headY-2,shine);p.dot(headX+1,headY-3,shift(chest,-12));
  }
  p.line(headX+7,headY+5,headX+10,headY+4,dark);
  for(let i=0;i<2;i++)p.dot(headX+8+i,headY+3+i,shift(chest,-43));
  if(forage){
    const nibble=k%3===1?1:0;
    p.ellipse(headX+1,headY+9-nibble,3.5,2.2,russet);
    p.ellipse(headX+7,headY+8-nibble,2.8,2.5,dark);
    p.ellipse(headX+7,headY+7-nibble,1.7,1.6,shift(fur,-5),dark);
    p.dot(headX+7,headY+6-nibble,shine);
  }else if(alert){p.ellipse(headX-1,headY+15,3,4,russet);p.dot(headX,headY+17,chest);}
  else if(curled){p.ellipse(33,47,9,4,tail,dark,2);p.line(30,45,37,44,shift(fur,13));if(shelter){p.ellipse(25,39,7,8,tail,dark,2);p.line(22,36,25,31,shift(fur,18));}}
}
function sparrowArt(p:Frame,pose:AnimalPose,k:number){
  const flying=["fly","takeoff","land"].includes(pose),sleep=pose==="sleep",perch=pose==="perch",groom=pose==="groom";
  const hop=pose==="hop"?[0,2,5,7,5,2,0,0][k]:0;
  const peck=pose==="forage"?[0,3,8,12,12,8,3,0][k]:0;
  const y=flying?(pose==="takeoff"?43-Math.round(k*1.3):pose==="land"?34+Math.round(k*1.3):34):sleep?46:43-hop,headY=sleep?y-5:groom?y-4+Math.round(Math.sin(k*Math.PI/4)*4):pose==="alert"?y-12:y-9+peck;
  p.polygon([[20,y-2],[6,y-5],[9,y+1],[21,y+5]],feather,outline);
  if(flying){
    const envelope=pose==="takeoff"?Math.min(1,k/3):pose==="land"?Math.min(1,(7-k)/3):1;
    const wing=Math.sin(k*Math.PI/4)*envelope;
    p.polygon([[31,y],[20,y-5],[12,y+Math.round(wing*13)],[7,y+Math.round(wing*16)+5],[21,y+8],[35,y+5]],feather);
  }else if(!sleep){
    for(const x of [29,36]){
      p.line(x,y+5,x+(hop?2:0),50-hop,[151,110,72]);
      p.line(x-2,50-hop,x+3,50-hop,[175,130,83]);
    }
  }
  p.ellipse(30,y,14,9,bird,outline,1);
  p.ellipse(37,y+3,9,6,cream,shift(feather,16),1);
  p.ellipse(26,y-1,11,6,feather,outline,1);
  for(let i=0;i<5;i++){
    p.line(19+i*2,y-4,24+i*2,y+1,shift(bird,18-i*3));
    p.line(19+i*2,y-2,24+i*2,y+3,shift(feather,-9));
  }
  const hx=groom?34+Math.round(Math.sin(k*Math.PI/4)*2):41,sign=groom?-1:1;
  p.ellipse(hx,headY,8,7,bird,outline,1);
  p.ellipse(hx+3*sign,headY+3,5,3,cream,shift(feather,15),1);
  p.polygon([[hx+6*sign,headY],[hx+15*sign,headY+(peck||groom?5:2)],[hx+7*sign,headY+4]],[170,128,70],outline,1);
  p.ellipse(hx-2*sign,headY-4,5,2.5,feather,shift(feather,-12),1);
  if(sleep||(!flying&&k===7)){p.line(hx+sign,headY,hx+5*sign,headY+1,black);}
  else{p.ellipse(hx+3*sign,headY-1,2,2,black,outline,0);p.dot(hx+3*sign,headY-2,shine);}
  if(groom){
    p.polygon([[36,y-4],[27,y-9],[19,y-4],[20,y+2],[30,y+5]],bird,outline,1);
    for(let j=0;j<6;j++)p.line(20+j*2,y-3,24+j*2,y+2,shift(feather,12-j*3));
  }else if(flying){
    const envelope=pose==="takeoff"?Math.min(1,k/3):pose==="land"?Math.min(1,(7-k)/3):1;
    const wing=Math.sin(k*Math.PI/4)*envelope,tipY=y-5-Math.round(wing*18);
    if(pose==="land"&&k>3||pose==="takeoff"&&k<2)for(const x of [29,36]){
      p.line(x,y+4,x+1,y+9,[151,110,72]);p.line(x-2,y+9,x+4,y+9,[175,130,83]);
    }
    p.polygon([[33,y-3],[25,y-5],[16,tipY+4],[9,tipY],[11,tipY+8],[20,tipY+14],[30,y+4]],bird);
    for(let i=0;i<4;i++)p.line(13+i*3,tipY+6+i*2,22+i*2,y+1,shift(feather,-8+i*4));
  }else if(perch){p.line(27,50,32,50,dark);p.line(34,50,39,50,dark);}
}
function fishArt(p:Frame,pose:AnimalPose,k:number,variant:number){
  const fish:Color=variant===1?[151,126,85]:variant===2?[149,173,180]:[91,146,146];
  const fin:Color=variant===1?[176,139,90]:variant===2?[173,194,191]:[122,174,163];
  const wave=Math.round(Math.sin(k*Math.PI/4)*(pose==="dart"?7:4));
  const y=pose==="surface"?30:34;
  const body=pose==="turn"?13+Math.round(Math.cos(k*Math.PI/4)*3):variant===1?19:variant===2?16:17;
  p.polygon([[20,y],[8,y-8+wave],[10,y+wave],[6,y+9+wave],[23,y+3]],fin,[51,94,99],1);
  const bend=Math.round(wave*.52),height=variant===1?10:7;
  p.polygon([[32-body,y+bend],[21,y-height+bend],[30,y-height],[40,y-height+1],[48,y-4],[50,y],[47,y+4],[40,y+height-1],[30,y+height],[21,y+height+bend],[32-body,y+bend]],fish,[45,83,91],1);
  p.ellipse(37,y+3,12,4,[149,192,176],[82,130,133],1);
  p.polygon([[27,y-5],[30,y-12],[37,y-6]],fin,[51,94,99]);
  p.polygon([[28,y+4],[33,y+11+(k%2)],[39,y+5]],fin,[51,94,99]);
  for(let i=0;i<6;i++)for(let j=0;j<3;j++){
    const dy=Math.round(bend*(1-i/6));
    p.dot(24+i*3,y-3+j*3+(i%2)+dy,shift(fish,27));
    p.dot(25+i*3,y-2+j*3+(i%2)+dy,shift(fish,-15));
  }
  p.ellipse(43,y-1,2.5,2.5,[33,65,70],[51,94,99],0);p.dot(43,y-2,[231,241,218]);
  p.line(38,y-3,39,y+3,[75,118,121]);p.line(47,y+2,49,y+1,[45,83,91]);
}
export function animalFramePixels(species:Species,pose:AnimalPose,frame:number,variant=0){
  const p=new Frame(),k=((frame%ANIMAL_FRAMES)+ANIMAL_FRAMES)%ANIMAL_FRAMES;
  if(species==="squirrel")squirrelArt(p,pose,k);
  else if(species==="sparrow")sparrowArt(p,pose,k);
  else fishArt(p,pose,k,variant);
  return p.pixels;
}
const cache=new Map<string,HTMLCanvasElement>();
export function animalFrame(species:Species,pose:AnimalPose,frame:number,variant=0){
  const key=species+":"+pose+":"+frame+":"+variant;
  let canvas=cache.get(key);
  if(!canvas){
    canvas=document.createElement("canvas");canvas.width=ANIMAL_WIDTH;canvas.height=ANIMAL_HEIGHT;
    const ctx=canvas.getContext("2d")!,data=ctx.createImageData(ANIMAL_WIDTH,ANIMAL_HEIGHT);
    data.data.set(animalFramePixels(species,pose,frame,variant));ctx.putImageData(data,0,0);cache.set(key,canvas);
  }
  return canvas;
}
