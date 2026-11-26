// Native half-world-pixel artwork. Frames are rasterized once, not upscaled
// from the former 13px silhouette. All components share a ground anchor.
export const ANIMAL_WIDTH = 64;
export const ANIMAL_HEIGHT = 56;
export const ANIMAL_FRAMES = 8;
export type AnimalPose = "idle" | "forage" | "run" | "alert" | "shelter" | "sleep" | "hop" | "fly" | "perch" | "swim" | "dart" | "walk" | "jump" | "land" | "climb" | "turn" | "groom" | "takeoff" | "surface" | "sit" | "lie" | "eat" | "pet" | "observe";
type Species = "sparrow" | "squirrel" | "fish" | "cat" | "dog";
type View = "up"|"down"|"left"|"right";
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
// Cats have a long flexible trunk, pointed ears and a curling tail. Small
// dogs have a shorter trunk, a deep chest, floppy ears and a bounding gait.
// Every pose shares the original 64×56 density and foot anchor.
function companionArt(p:Frame,species:"cat"|"dog",pose:AnimalPose,k:number,variant:number,view:View){
  const cat=species==="cat",tux=cat&&variant===1;
  const coat:Color=tux?[51,55,57]:cat?[209,137,70]:[172,129,86];
  const pale:Color=tux?[232,229,211]:cat?[244,204,143]:[225,197,157];
  const mark:Color=tux?[39,43,45]:cat?[150,81,42]:[115,78,53];
  const edge:Color=tux?[35,38,42]:[76,54,45];
  const nose:Color=cat?[130,85,80]:[48,43,40];
  const moving=pose==="walk"||pose==="run",run=pose==="run";
  const sleeping=pose==="sleep",low=pose==="lie"||sleeping;
  const sitting=pose==="sit"||pose==="pet";
  const eating=pose==="eat";
  const wave=Math.sin(k*Math.PI/4),opposite=Math.sin((k+4)*Math.PI/4);
  const bounce=moving?(cat?Math.round(Math.abs(wave)*(run?2:1)):Math.round(Math.abs(wave)*(run?4:2))):0;
  const blink=sleeping||pose==="pet"&&k%4!==0||k===7&&!moving;
  const side=view==="left"||view==="right";
  const paw=(x:number,y:number,dx:number,dy:number,far=false)=>{
    p.polygon([[x-3,y-2],[x+3,y-2],[x+dx+3,y+dy-1],[x+dx+4,y+dy+1],[x+dx-4,y+dy+1],[x+dx-4,y+dy-2]],far?mark:coat,edge,1);
    p.ellipse(x+dx,y+dy,4,2,tux||!cat?pale:coat,edge,0);
  };
  if(side){
    const by=low?44:sitting?39:36-bounce;
    const hy=low?42:eating?43:sitting?(pose==="pet"?26:27):29-bounce-(pose==="observe"?2:pose==="alert"?3:0);
    const headX=(cat?45:44)-(pose==="turn"?Math.max(0,3-Math.floor(k/2)):0),tailX=cat?14:17;
    // Far legs and tail sit behind the silhouette.
    if(low){
      p.ellipse(29,49,17,3,mark,edge,0);
    }else{
      const swing=moving?Math.round(wave*(run?6:3)):0;
      paw(22,by+4,-swing,51-(by+4),true);paw(39,by+4,swing,51-(by+4),true);
    }
    if(cat){
      if(low){
        p.ellipse(16,44,10,5,coat,edge,2);p.ellipse(14,44,4,3,mark,edge);
      }else{
        const curl=pose==="pet"?Math.round(wave*3):Math.round(wave*2);
        p.polygon([[tailX+3,by+2],[tailX-4,by-1],[6,by-11],[5+curl,by-21],[9+curl,by-25],[14+curl,by-24],[15+curl,by-20],[11+curl,by-18],[12,by-10],[20,by-3]],coat,edge,2);
        if(!tux)for(let i=0;i<3;i++)p.line(8+i,by-10-i*4,12+i,by-9-i*4,mark);
      }
    }else{
      p.polygon([[19,by-1],[12,by-5],[10,by-13],[13,by-19],[19,by-20+Math.round(wave*2)],[22,by-15],[19,by-12],[17,by-14],[16,by-9],[23,by-3]],coat,edge,2);
      p.ellipse(19,by-16,3,3,pale,edge,0);
    }
    if(sitting){
      p.ellipse(25,43,cat?12:13,8,coat,edge,2);p.ellipse(36,36,cat?10:11,13,coat,edge,2);
    }else p.ellipse(30,by,cat?19:16,low?7:cat?9:11,coat,edge,2);
    if(tux)p.ellipse(38,by+4,7,low?3:6,pale,edge,1);
    else if(cat)for(let i=0;i<3;i++)p.polygon([[19+i*8,by-7],[22+i*8,by-6],[24+i*7,by+1],[21+i*8,by-2]],mark,mark,0);
    else p.ellipse(29,by+2,9,6,pale,shift(coat,-12),1);
    if(low){
      p.ellipse(39,50,8,2,pale,edge,0);p.ellipse(21,50,7,2,tux?pale:coat,edge,0);
    }else if(sitting){
      paw(24,44,0,7);paw(41,40,0,11);
    }else{
      const swing=moving?Math.round(opposite*(run?6:3)):0;
      paw(23,by+4,-swing,51-(by+4));paw(40,by+4,swing,51-(by+4));
    }
    if(cat){
      p.polygon([[headX-11,hy-2],[headX-9,hy-16],[headX-1,hy-8]],coat,edge,1);
      p.polygon([[headX+1,hy-8],[headX+8,hy-15],[headX+10,hy-2]],coat,edge,1);
      p.polygon([[headX-8,hy-12],[headX-7,hy-5],[headX-3,hy-6]],[186,128,116],edge,0);
      p.ellipse(headX,hy,11,9,coat,edge,2);
      if(tux)p.polygon([[headX+1,hy-6],[headX+7,hy-3],[headX+10,hy+4],[headX+4,hy+8],[headX-2,hy+5]],pale,edge,1);
      else {p.line(headX-5,hy-7,headX-2,hy-3,mark);p.line(headX+1,hy-7,headX+2,hy-4,mark);}
      p.ellipse(headX+6,hy+5,5,3,pale,edge,1);
      if(blink)p.line(headX+3,hy,headX+7,hy+1,edge);
      else {p.ellipse(headX+4,hy,2.7,2,[163,181,104],edge,0);p.dot(headX+5,hy,edge);p.dot(headX+4,hy-1,shine);}
      p.dot(headX+10,hy+3,nose);p.dot(headX+9,hy+4,nose);
      for(let j=0;j<2;j++){p.line(headX+8,hy+5+j,headX+14,hy+3+j*3,pale);p.line(headX+2,hy+5+j,headX-5,hy+4+j*3,pale);}
    }else{
      p.ellipse(headX,hy,12,11,coat,edge,2);
      p.polygon([[headX-9,hy-7],[headX-15,hy-6],[headX-15,hy+5],[headX-9,hy+10],[headX-5,hy+4]],mark,edge,2);
      p.ellipse(headX+8,hy+4,8,5,pale,edge,1);p.ellipse(headX+14,hy+2,3,2.5,nose,edge,0);
      if(blink)p.line(headX+2,hy-2,headX+6,hy-1,edge);
      else {p.ellipse(headX+4,hy-2,2.5,3,[79,57,43],edge,0);p.dot(headX+4,hy-3,shine);}
      if(!sleeping&&k%4<2&&pose==="pet")p.ellipse(headX+9,hy+8,2.5,2.5,[192,117,112],edge,0);
    }
  }else{
    const back=view==="up";
    const by=low?43:sitting?40:36-bounce;
    const hy=low?43:eating?42:sitting?27:28-bounce;
    const width=cat?12:15;
    const tailDir=k<4?1:-1;
    if(cat){
      p.polygon([[30,by+2],[22+tailDir*3,by-4],[21+tailDir*4,by-14],[25+tailDir*5,by-20],[30+tailDir*5,by-18],[27+tailDir*4,by-12],[29,by-2]],coat,edge,2);
    }else p.ellipse(32+Math.round(wave*4),by-9,6,8,coat,edge,2);
    p.ellipse(32,by,width,low?7:sitting?11:13,coat,edge,2);
    if(!back)p.ellipse(32,by+4,cat?7:9,low?3:7,pale,edge,1);
    else if(cat&&!tux)for(let i=0;i<3;i++)p.line(32-8+i*7,by-8,32-6+i*6,by+1,mark);
    const stride=moving?Math.round(wave*(run?4:2)):0;
    if(low){p.ellipse(23,50,7,2,tux?pale:coat,edge);p.ellipse(41,50,7,2,pale,edge);}
    else {paw(24,by+6,0,Math.max(3,51-(by+6)+stride));paw(40,by+6,0,Math.max(3,51-(by+6)-stride));}
    if(cat){
      p.polygon([[20,hy-3],[19,hy-15],[29,hy-8]],coat,edge,1);
      p.polygon([[35,hy-8],[45,hy-15],[44,hy-3]],coat,edge,1);
      if(!back){p.polygon([[21,hy-11],[23,hy-5],[26,hy-6]],[186,128,116],edge,0);p.polygon([[43,hy-11],[41,hy-5],[38,hy-6]],[186,128,116],edge,0);}
      p.ellipse(32,hy,13,10,coat,edge,2);
      if(!tux){p.line(29,hy-8,30,hy-4,mark);p.line(34,hy-8,33,hy-4,mark);}
    }else{
      p.ellipse(32,hy,14,11,coat,edge,2);
      p.ellipse(18,hy,5,10,mark,edge,2);p.ellipse(46,hy,5,10,mark,edge,2);
    }
    if(!back){
      p.ellipse(32,hy+5,cat?7:10,cat?4:6,pale,edge,1);
      for(const ex of [25,39]){
        if(blink)p.line(ex-2,hy,ex+2,hy,edge);
        else {p.ellipse(ex,hy,cat?2.8:3,cat?2.3:3,cat?[166,184,108]:[79,57,43],edge,0);p.dot(ex,hy,edge);p.dot(ex-1,hy-1,shine);}
      }
      p.ellipse(32,hy+3,cat?2:3,2,nose,edge,0);
      p.line(32,hy+5,30,hy+7,edge);p.line(32,hy+5,34,hy+7,edge);
      if(cat)for(let j=0;j<2;j++){p.line(27,hy+5+j,17,hy+3+j*3,pale);p.line(37,hy+5+j,47,hy+3+j*3,pale);}
    }else if(tux)p.ellipse(32,hy+7,5,2,pale,edge,1);
  }
  if(sleeping){const x=side?50:44,y=low?25:17;p.line(x,y,x+5,y,pale);p.line(x+5,y,x,y+4,pale);p.line(x,y+4,x+5,y+4,pale);}
  if(eating&&k%2===0){p.dot(side?56:29,49,pale);p.dot(side?59:34,48,mark);}
}
export function animalFramePixels(species:Species,pose:AnimalPose,frame:number,variant=0,view:View="right"){
  const p=new Frame(),k=((frame%ANIMAL_FRAMES)+ANIMAL_FRAMES)%ANIMAL_FRAMES;
  if(species==="squirrel")squirrelArt(p,pose,k);
  else if(species==="sparrow")sparrowArt(p,pose,k);
  else if(species==="fish")fishArt(p,pose,k,variant);
  else companionArt(p,species,pose,k,variant,view);
  return p.pixels;
}
const cache=new Map<string,HTMLCanvasElement>();
export function animalFrame(species:Species,pose:AnimalPose,frame:number,variant=0,view:View="right"){
  const key=species+":"+pose+":"+frame+":"+variant+":"+(species==="cat"||species==="dog"?view:"side");
  let canvas=cache.get(key);
  if(!canvas){
    canvas=document.createElement("canvas");canvas.width=ANIMAL_WIDTH;canvas.height=ANIMAL_HEIGHT;
    const ctx=canvas.getContext("2d")!,data=ctx.createImageData(ANIMAL_WIDTH,ANIMAL_HEIGHT);
    data.data.set(animalFramePixels(species,pose,frame,variant,view));ctx.putImageData(data,0,0);cache.set(key,canvas);
  }
  return canvas;
}
