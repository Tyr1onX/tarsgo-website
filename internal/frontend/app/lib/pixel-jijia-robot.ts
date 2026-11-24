import { groundAt, isWalkable, moveEntity, pathIsWalkable, TRAINING_FIELD, TILE, type Position } from "./pixel-jijia-world.ts";

// Visual study, not measured CAD. Native 64×56 cells, world footprint
// approximately 2.4 tiles across. Source: 果冻（立头）.pdf (5e8a1ea1acf8e5ed…).
export const GUODONG = {
  id:"guodong-study",name:"过洞步兵机器人",
  atlas:"/assets/pixel-jijia/robot-guodong-study.png",
  width:64,height:56,anchorY:39,radius:1.23,
  speed:5.2,
} as const;
export const ROBOT_PATROL = [{x:110.5,y:11.6},{x:110.5,y:8.4},{x:112.3,y:8.4},{x:112.3,y:11.6}] as const;
export type CampusRobot=Position&{heading:number;yaw:number;aim:number;distance:number;moving:boolean;waypoint:number;pause:number};
export function createCampusRobot():CampusRobot{
  return {...ROBOT_PATROL[0],heading:Math.PI/4,yaw:Math.PI/2,aim:Math.PI/2,distance:0,moving:false,waypoint:1,pause:2.2};
}
const angle=(dx:number,dy:number)=>Math.atan2(-dx,dy);
export function robotHeading(yaw:number):number{return ((Math.round(yaw/(Math.PI/4))%8)+8)%8;}
export function aimCampusRobot(robot:CampusRobot,target:Position){
  if(Math.hypot(target.x-robot.x,target.y-robot.y)>.12)robot.aim=angle(target.x-robot.x,target.y-robot.y);
}
// Use the same world obstacle footprints, with a conservative circular
// radius and a dry footprint. No special terrain or second collision map.
export function robotCanStand(x:number,y:number):boolean{
  const radius=GUODONG.radius;
  if(!isWalkable(x,y,radius))return false;
  for(let cy=Math.floor(y-radius);cy<=Math.floor(y+radius);cy++)
    for(let cx=Math.floor(x-radius);cx<=Math.floor(x+radius);cx++){
      if(groundAt(cx,cy)!==3)continue;
      const dx=Math.max(cx-x,0,x-cx-1),dy=Math.max(cy-y,0,y-cy-1);
      if(dx*dx+dy*dy<radius*radius)return false;
    }
  return true;
}
export function robotClearPath(a:Position,b:Position):boolean{
  const n=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/.25));
  for(let i=0;i<=n;i++)if(!robotCanStand(a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n))return false;
  return true;
}
export function robotBlocksPlayer(robot:CampusRobot,x:number,y:number):boolean{
  return Math.hypot(robot.x-x,robot.y-y)<GUODONG.radius+.3;
}
export function robotInReach(robot:CampusRobot,player:Position):boolean{
  const d=Math.hypot(robot.x-player.x,robot.y-player.y);
  return d>=GUODONG.radius+.3-.02&&d<2.9&&groundAt(player.x,player.y)!==3;
}
export function releaseCampusRobot(robot:CampusRobot){
  robot.pause=2.5;robot.moving=false;robot.waypoint=-1;
  let nearest=10;
  for(let i=0;i<ROBOT_PATROL.length;i++){
    const p=ROBOT_PATROL[i],d=Math.hypot(p.x-robot.x,p.y-robot.y);
    if(d<nearest&&robotClearPath(robot,p)){nearest=d;robot.waypoint=i;}
  }
}
export function tickCampusRobot(robot:CampusRobot,player:Position,dt:number,controlled:boolean,horizontal:number,vertical:number,motion:boolean,other?:Position){
  robot.moving=false;
  if(!controlled){
    if(!motion||robot.waypoint<0)return;
    if(robot.pause>0){robot.pause=Math.max(0,robot.pause-dt);robot.aim=robot.heading+Math.sin(robot.pause*.8)*.65;}
    else{
      const target=ROBOT_PATROL[robot.waypoint],dx=target.x-robot.x,dy=target.y-robot.y,d=Math.hypot(dx,dy);
      if(d<.08){robot.waypoint=(robot.waypoint+1)%ROBOT_PATROL.length;robot.pause=2.5+robot.waypoint*.4;}
      else{const ratio=Math.min(1,d/Math.max(.001,dt*2.2));horizontal=dx/d*ratio;vertical=dy/d*ratio;}
    }
  }
  if(horizontal||vertical){
    const oldX=robot.x,oldY=robot.y;
    const next=moveEntity(robot,horizontal,vertical,dt,controlled?GUODONG.speed:2.2,
      (x,y)=>robotCanStand(x,y)&&Math.hypot(x-player.x,y-player.y)>=GUODONG.radius+.3&&(!other||Math.hypot(x-other.x,y-other.y)>=GUODONG.radius*2));
    const traveled=Math.hypot(next.x-oldX,next.y-oldY);
    if(traveled>.001){
      robot.x=next.x;robot.y=next.y;robot.distance+=traveled;robot.moving=true;
      robot.heading=angle(next.x-oldX,next.y-oldY);
      if(!controlled)robot.aim=robot.heading;
    }
  }
  const delta=Math.atan2(Math.sin(robot.aim-robot.yaw),Math.cos(robot.aim-robot.yaw));
  robot.yaw+=motion?Math.max(-dt*3,Math.min(dt*3,delta)):delta;
}
export function drawCampusRobot(ctx:CanvasRenderingContext2D,robot:CampusRobot,atlas:HTMLImageElement,camera:Position,w:number,h:number,motion:boolean,controlled:boolean){
  const x=Math.round(robot.x*TILE-camera.x),y=Math.round(robot.y*TILE-camera.y);
  if(x<-36||x>w+36||y<-18||y>h+48)return;
  const {width,height,anchorY}=GUODONG,frame=motion&&robot.moving?Math.floor(robot.distance*4)%2:0;
  ctx.save();ctx.fillStyle="rgba(32,49,43,.22)";ctx.beginPath();ctx.ellipse(x,y+2,19,8,0,0,Math.PI*2);ctx.fill();
  ctx.drawImage(atlas,robotHeading(robot.heading)*width,frame*height,width,height,x-width/2,y-anchorY,width,height);
  ctx.drawImage(atlas,robotHeading(robot.yaw)*width,2*height,width,height,x-width/2,y-anchorY,width,height);
  if(controlled){ctx.fillStyle="#d8c987";ctx.fillRect(x-1,y+10,2,1);}
  ctx.restore();
}

// Arcade practice only: local health and a short abstract visual pulse, no
// physical projectile model, equipment parameters or connection to devices.
export type TrainingSession={
  opponent:CampusRobot;hp:number;opponentHp:number;cooldown:number;opponentCooldown:number;
  elapsed:number;phase:"playing"|"won"|"lost";pulse:{from:Position;to:Position;life:number;blue:boolean}|null;
};
export function inTrainingField(p:Position):boolean{
  const f=TRAINING_FIELD,r=GUODONG.radius;
  return p.x>=f.x+r&&p.x<=f.x+f.width-r&&p.y>=f.y+r&&p.y<=f.y+f.height-r;
}
export function createTraining(robot:CampusRobot,person:Position):TrainingSession|null{
  const p=[{x:132,y:8},{x:136,y:8},{x:108,y:8},{x:116,y:8}].find(p=>inTrainingField(p)&&robotCanStand(p.x,p.y)&&Math.hypot(p.x-robot.x,p.y-robot.y)>GUODONG.radius*2&&Math.hypot(p.x-person.x,p.y-person.y)>GUODONG.radius+.3);
  if(!p||!inTrainingField(robot))return null;
  return {opponent:{...createCampusRobot(),...p,waypoint:-1},hp:100,opponentHp:100,cooldown:0,opponentCooldown:2,elapsed:0,phase:"playing",pulse:null};
}
export function fireTraining(s:TrainingSession|null,robot:CampusRobot,point:Position):boolean{
  if(!s||s.phase!=="playing"||s.cooldown>0||!inTrainingField(robot))return false;
  const foe=s.opponent;
  const hit=Math.abs(point.x-foe.x)<1.55&&point.y>=foe.y-2.5&&point.y<=foe.y+.75
    &&Math.hypot(foe.x-robot.x,foe.y-robot.y)<10&&pathIsWalkable(robot,foe,true);
  s.cooldown=.65;
  if(hit){
    s.opponentHp=Math.max(0,s.opponentHp-20);
    s.pulse={from:{x:robot.x,y:robot.y},to:{x:foe.x,y:foe.y},life:.16,blue:false};
    if(!s.opponentHp)s.phase="won";
  }
  return hit;
}
export function tickTraining(s:TrainingSession,robot:CampusRobot,person:Position,dt:number,motion:boolean){
  s.cooldown=Math.max(0,s.cooldown-dt);
  if(s.pulse&&(s.pulse.life-=dt)<=0)s.pulse=null;
  if(s.phase!=="playing")return;
  s.elapsed+=dt;
  const foe=s.opponent;
  const d=Math.hypot(foe.x-robot.x,foe.y-robot.y);
  // A short, repeatable practice patrol, not a second autonomous battle engine.
  const x=foe.x>122?(Math.floor(s.elapsed/2)%2?131:133):(Math.floor(s.elapsed/2)%2?109:111);
  const dx=x-foe.x,dy=8-foe.y;
  const next=moveEntity(foe,Math.abs(dx)>.1?Math.sign(dx):0,Math.abs(dy)>.1?Math.sign(dy):0,dt,1.5,
    (x,y)=>inTrainingField({x,y})&&robotCanStand(x,y)&&Math.hypot(x-robot.x,y-robot.y)>=GUODONG.radius*2&&Math.hypot(x-person.x,y-person.y)>=GUODONG.radius+.3);
  const travel=Math.hypot(next.x-foe.x,next.y-foe.y);foe.moving=travel>.001;
  if(foe.moving){foe.heading=angle(next.x-foe.x,next.y-foe.y);foe.distance+=travel;foe.x=next.x;foe.y=next.y;}
  aimCampusRobot(foe,robot);foe.yaw=foe.aim;
  s.opponentCooldown=Math.max(0,s.opponentCooldown-dt);
  if(d<9&&s.opponentCooldown<=0&&pathIsWalkable(foe,robot,true)){
    s.opponentCooldown=1.6;s.hp=Math.max(0,s.hp-10);
    s.pulse={from:{x:foe.x,y:foe.y},to:{x:robot.x,y:robot.y},life:.16,blue:true};
    if(!s.hp)s.phase="lost";
  }
}
export function drawTrainingHealth(ctx:CanvasRenderingContext2D,robot:CampusRobot,hp:number,camera:Position,blue:boolean){
  const x=Math.round(robot.x*TILE-camera.x),y=Math.round(robot.y*TILE-camera.y)-46;
  ctx.fillStyle="#283438";ctx.fillRect(x-16,y,32,5);
  ctx.fillStyle=blue?"#6a9ec8":"#db8270";ctx.fillRect(x-15,y+1,30*hp/100,3);
}
export function drawTrainingPulse(ctx:CanvasRenderingContext2D,s:TrainingSession,camera:Position,motion:boolean){
  if(!s.pulse||!motion)return;
  const {from,to,blue}=s.pulse;
  ctx.save();ctx.strokeStyle=blue?"#a2c7e8":"#e8bd82";ctx.lineWidth=1.5;ctx.beginPath();
  ctx.moveTo(Math.round(from.x*TILE-camera.x),Math.round(from.y*TILE-camera.y-21));
  ctx.lineTo(Math.round(to.x*TILE-camera.x),Math.round(to.y*TILE-camera.y-21));ctx.stroke();
  ctx.fillStyle="#f0d6a4";ctx.fillRect(Math.round(to.x*TILE-camera.x)-2,Math.round(to.y*TILE-camera.y-21)-2,4,4);ctx.restore();
}
