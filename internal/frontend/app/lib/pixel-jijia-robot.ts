import { groundAt, isWalkable, moveEntity, TRAINING_FIELD, TILE, type Position } from "./pixel-jijia-world.ts";

// All asset dimensions are visual studies, not measured CAD.
export type RobotModel={
  id:string;name:string;source:string;atlas:string;width:number;height:number;anchorY:number;
  nativeScale:number;wheelFrames:number;radius:number;speed:number;capability:"training"|"carry"|"display";
  route:readonly Position[];upper:boolean;
};
export const ROBOT_MODELS={
  guodong:{id:"guodong",name:"过洞步兵机器人",source:"果冻（立头）.pdf · 5e8a1ea1acf8e5ed",atlas:"/assets/pixel-jijia/robot-guodong-study.png?v=3",
    width:64,height:56,anchorY:39,nativeScale:2,wheelFrames:4,radius:1.23,speed:5.2,capability:"training",upper:true,
    route:[{x:110.5,y:11.6},{x:110.5,y:8.4},{x:112.3,y:8.4},{x:112.3,y:11.6}]},
  wheelLeg:{id:"wheel-leg",name:"轮腿机器人",source:"a7d91a5a52150f0e759f95f62792cba3.png · 59c0da53ed776c0d",atlas:"/assets/pixel-jijia/robot-wheel-leg-study.png",
    width:68,height:68,anchorY:52,nativeScale:2,wheelFrames:4,radius:1.35,speed:4.8,capability:"training",upper:true,
    route:[{x:104,y:22},{x:113,y:22},{x:113,y:20.6},{x:104,y:20.6}]},
  engineering:{id:"engineering",name:"26 工程机器人",source:"26工程线稿.pdf · 5ee7851b99aaaaac",atlas:"/assets/pixel-jijia/robot-engineering-study.png",
    width:76,height:78,anchorY:60,nativeScale:2,wheelFrames:4,radius:1.6,speed:3.8,capability:"carry",upper:true,
    route:[{x:26,y:23},{x:26,y:32},{x:29,y:32},{x:26,y:32}]},
  dartDisplay:{id:"dart-display",name:"飞镖发射装置",source:"78aff970a6ab83081b3417db60ae3de2.png · 14e02bd275340896",atlas:"/assets/pixel-jijia/robot-dart-display-study.png",
    width:76,height:76,anchorY:57,nativeScale:2,wheelFrames:1,radius:2.1,speed:0,capability:"display",upper:false,route:[{x:95,y:7}]},
} as const satisfies Record<string,RobotModel>;
export const DART_BODY={atlas:"/assets/pixel-jijia/robot-dart-body-study.png",width:40,height:40,anchorY:28,nativeScale:2};
export type CampusRobot=Position&{model:RobotModel;heading:number;yaw:number;aim:number;distance:number;moving:boolean;waypoint:number;pause:number;speed:number;parking:Position|null;demo:number};
export function createCampusRobot(model:RobotModel):CampusRobot{
  return {...model.route[0],model,heading:Math.PI/4,yaw:Math.PI/2,aim:Math.PI/2,distance:0,moving:false,waypoint:model.speed?1:-1,pause:2.2,speed:0,parking:null,demo:0};
}
export function createCampusRobots(){return Object.values(ROBOT_MODELS).map(createCampusRobot);}
export type RobotAtlases=Map<string,HTMLImageElement>;
export function nearestRobot(robots:readonly CampusRobot[],player:Position):CampusRobot|null{
  let nearest:CampusRobot|null=null,best=Infinity;
  for(const robot of robots){
    const d=Math.hypot(robot.x-player.x,robot.y-player.y);
    if(d<best&&robotInReach(robot,player)){nearest=robot;best=d;}
  }
  return nearest;
}
export function startRobotDemo(robot:CampusRobot){
  if(robot.model.capability!=="training"&&!robot.demo&&!robot.moving)robot.demo=3;
}
const angle=(dx:number,dy:number)=>Math.atan2(-dx,dy);
const angleDelta=(a:number,b:number)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const approachAngle=(a:number,b:number,step:number)=>a+Math.max(-step,Math.min(step,angleDelta(a,b)));
export function robotHeading(yaw:number):number{return ((Math.round(yaw/(Math.PI/4))%8)+8)%8;}
export function aimCampusRobot(robot:CampusRobot,target:Position){
  if(Math.hypot(target.x-robot.x,target.y-robot.y)>.12)robot.aim=angle(target.x-robot.x,target.y-robot.y);
}
// Use the same world obstacle footprints, with a conservative circular
// radius and a dry footprint. No special terrain or second collision map.
export function robotCanStand(x:number,y:number,radius:number):boolean{
  if(!isWalkable(x,y,radius))return false;
  for(let cy=Math.floor(y-radius);cy<=Math.floor(y+radius);cy++)
    for(let cx=Math.floor(x-radius);cx<=Math.floor(x+radius);cx++){
      if(groundAt(cx,cy)!==3)continue;
      const dx=Math.max(cx-x,0,x-cx-1),dy=Math.max(cy-y,0,y-cy-1);
      if(dx*dx+dy*dy<radius*radius)return false;
    }
  return true;
}
export function robotClearPath(a:Position,b:Position,radius:number):boolean{
  const n=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/.25));
  for(let i=0;i<=n;i++)if(!robotCanStand(a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n,radius))return false;
  return true;
}
export function robotBlocksPlayer(robot:CampusRobot,x:number,y:number):boolean{
  return Math.hypot(robot.x-x,robot.y-y)<robot.model.radius+.3;
}
export function robotInReach(robot:CampusRobot,player:Position):boolean{
  const d=Math.hypot(robot.x-player.x,robot.y-player.y);
  return d>=robot.model.radius+.3-.02&&d<robot.model.radius+1.65&&groundAt(player.x,player.y)!==3;
}
export function releaseCampusRobot(robot:CampusRobot){
  robot.pause=2.5;robot.moving=false;robot.speed=0;robot.waypoint=-1;robot.parking=null;
  // The court is a local activity zone. Recover from any unobstructed point
  // there, without teleporting or introducing global autonomous navigation.
  const route=robot.model.route;
  const local=route.some(p=>Math.hypot(p.x-robot.x,p.y-robot.y)<24);
  if(local){
    let nearest=Infinity;
    for(let i=0;i<robot.model.route.length;i++){
      const p=robot.model.route[i],d=Math.hypot(p.x-robot.x,p.y-robot.y);
      if(d<nearest&&robotClearPath(robot,p,robot.model.radius)){nearest=d;robot.waypoint=i;}
    }
    if(robot.waypoint>=0)return;
  }
  // A distant robot remains where the driver left it, except on a road:
  // find one nearby off-road stopping place, with the same collision data.
  if(groundAt(robot.x,robot.y)===1){
    let nearest=Infinity;
    for(const dx of [-4,-2,0,2,4])for(const dy of [-4,-2,0,2,4]){
      const p={x:robot.x+dx,y:robot.y+dy},d=Math.hypot(dx,dy);
      if(d<nearest&&groundAt(p.x,p.y)===0&&robotClearPath(robot,p,robot.model.radius)){nearest=d;robot.parking=p;}
    }
  }
}
export function tickCampusRobot(robot:CampusRobot,player:Position,dt:number,controlled:boolean,horizontal:number,vertical:number,motion:boolean,others:readonly CampusRobot[]=[]){
  robot.moving=false;
  robot.demo=Math.max(0,robot.demo-dt);
  if(!robot.model.speed)return;
  if(robot.demo>0){robot.speed=0;return;}
  if(!controlled){
    if(!motion||robot.waypoint<0&&!robot.parking)return;
    if(robot.pause>0){robot.pause=Math.max(0,robot.pause-dt);robot.aim=robot.heading+Math.sin(robot.pause*.8)*.65;}
    else{
      const target=robot.parking??robot.model.route[robot.waypoint],dx=target.x-robot.x,dy=target.y-robot.y,d=Math.hypot(dx,dy);
      if(d<.08){
        if(robot.parking){robot.parking=null;robot.waypoint=-1;}
        else {robot.waypoint=(robot.waypoint+1)%robot.model.route.length;robot.pause=2.5+robot.waypoint*.4; if(robot.model.capability==="carry")robot.demo=3;}
        robot.speed=0;
      }
      else{const ratio=Math.min(1,d/Math.max(.001,dt*2.2));horizontal=dx/d*ratio;vertical=dy/d*ratio;}
    }
  }
  if(horizontal||vertical){
    const oldX=robot.x,oldY=robot.y;
    robot.speed=controlled?Math.min(robot.model.speed,robot.speed+dt*19):2.2;
    const next=moveEntity(robot,horizontal,vertical,dt,robot.speed,
      (x,y)=>robotCanStand(x,y,robot.model.radius)&&Math.hypot(x-player.x,y-player.y)>=robot.model.radius+.3&&others.every(other=>other===robot||Math.hypot(x-other.x,y-other.y)>=robot.model.radius+other.model.radius));
    const traveled=Math.hypot(next.x-oldX,next.y-oldY);
    if(traveled>.001){
      robot.x=next.x;robot.y=next.y;robot.distance+=traveled;robot.moving=true;
      const heading=angle(next.x-oldX,next.y-oldY);
      robot.heading=motion?approachAngle(robot.heading,heading,dt*10):heading;
      if(!controlled)robot.aim=heading;
    }else robot.speed=0;
  }else robot.speed=0;
  robot.yaw=approachAngle(robot.yaw,robot.aim,dt*5);
}
export function drawCampusRobot(ctx:CanvasRenderingContext2D,robot:CampusRobot,atlases:RobotAtlases,camera:Position,w:number,h:number,motion:boolean,controlled:boolean){
  const atlas=atlases.get(robot.model.id);if(!atlas)return;
  const x=Math.round(robot.x*TILE-camera.x),y=Math.round(robot.y*TILE-camera.y);
  const {width,height,anchorY,nativeScale,wheelFrames,upper,radius}=robot.model;
  if(x<-width||x>w+width||y<-height||y>h+height)return;
  const frame=motion?Math.floor(robot.distance*6)%wheelFrames:0;
  ctx.save();ctx.fillStyle="rgba(32,49,43,.22)";ctx.beginPath();ctx.ellipse(x,y+2,radius*15.45,radius*6.5,0,0,Math.PI*2);ctx.fill();
  const sw=width*nativeScale,sh=height*nativeScale;
  ctx.drawImage(atlas,robotHeading(robot.heading+Math.PI/2)*sw,frame*sh,sw,sh,x-width/2,y-anchorY,width,height);
  if(upper){
    const demo=robot.model.capability==="carry"&&robot.demo>0&&motion?Math.sin(robot.demo*Math.PI/3)*Math.PI/2:0;
    ctx.drawImage(atlas,robotHeading(robot.yaw+demo)*sw,wheelFrames*sh,sw,sh,x-width/2,y-anchorY,width,height);
  }
  if(robot.model.capability==="carry"&&robot.demo>0){
    const lift=motion?Math.sin(robot.demo*Math.PI/3)*13:7;
    ctx.fillStyle="#9eabb0";ctx.fillRect(x-5,y-29-lift,10,9);
    ctx.fillStyle="#8ac5ce";ctx.fillRect(x-3,y-27-lift,6,4);
  }
  if(robot.model.capability==="display"){
    const icon=atlases.get("dart-body");
    if(icon){
      const t=robot.demo>0?1-robot.demo/3:0;
      const dx=motion?Math.sin(t*Math.PI)*23:0,dy=motion?Math.sin(t*Math.PI)*24:0;
      ctx.drawImage(icon,0,0,80,80,x-20+dx,y-56-dy,40,40);
    }
  }
  if(controlled){ctx.fillStyle="#d8c987";ctx.fillRect(x-1,y+10,2,1);}
  ctx.restore();
}
// Abstract arcade light tokens. No real projectile/launcher parameters.
type PracticeLight=Position&{dx:number;dy:number;left:number;blue:boolean};
type PracticeResult="hit"|"obstacle"|"miss";
type PracticeSpark=Position&{life:number;blue:boolean;kind:PracticeResult|"launch"};
export type TrainingSession={
  opponent:CampusRobot;hp:number;opponentHp:number;cooldown:number;opponentCooldown:number;
  elapsed:number;phase:"playing"|"won"|"lost";lights:PracticeLight[];sparks:PracticeSpark[];
  pending:number|null;target:Position;hitFlash:number;opponentFlash:number;lastResult:PracticeResult|null;
};
export function inTrainingField(p:Position,r:number):boolean{
  const f=TRAINING_FIELD;
  return p.x>=f.x+r&&p.x<=f.x+f.width-r&&p.y>=f.y+r&&p.y<=f.y+f.height-r;
}
export function createTraining(robot:CampusRobot,person:Position,others:readonly CampusRobot[]=[]):TrainingSession|null{
  if(robot.model.capability!=="training")return null;
  const radius=robot.model.radius;
  const p=[{x:132,y:9},{x:136,y:9},{x:108,y:9},{x:116,y:9}].find(p=>inTrainingField(p,radius)&&robotCanStand(p.x,p.y,radius)&&Math.hypot(p.x-robot.x,p.y-robot.y)>radius*2&&Math.hypot(p.x-person.x,p.y-person.y)>radius+.3&&others.every(o=>o===robot||Math.hypot(p.x-o.x,p.y-o.y)>radius+o.model.radius));
  if(!p||!inTrainingField(robot,robot.model.radius))return null;
  return {opponent:{...createCampusRobot(robot.model),...p,waypoint:-1},hp:100,opponentHp:100,cooldown:0,opponentCooldown:2,elapsed:0,phase:"playing",
    lights:[],sparks:[],pending:null,target:{...p},hitFlash:0,opponentFlash:0,lastResult:null};
}
const LIGHT_HEIGHT=20;
export function aimTraining(robot:CampusRobot,point:Position){
  aimCampusRobot(robot,{x:point.x,y:point.y+LIGHT_HEIGHT/TILE});
}
export function fireTraining(s:TrainingSession|null,robot:CampusRobot,point:Position):boolean{
  if(!s||s.phase!=="playing"||robot.model.capability!=="training"||!inTrainingField(robot,robot.model.radius))return false;
  aimTraining(robot,point);
  if(s.cooldown>0||s.pending!==null)return false;
  s.pending=robot.aim;return true;
}
function launchLight(s:TrainingSession,robot:CampusRobot,blue:boolean){
  const dx=-Math.sin(robot.yaw),dy=Math.cos(robot.yaw);
  s.lights.push({x:robot.x+dx*.45,y:robot.y+dy*.45,dx,dy,left:11,blue});
  s.sparks.push({x:robot.x+dx*.45,y:robot.y+dy*.45,life:.10,blue,kind:"launch"});
}
function updateLights(s:TrainingSession,robot:CampusRobot,dt:number){
  const f=TRAINING_FIELD;
  for(let i=s.lights.length-1;i>=0;i--){
    const shot=s.lights[i],target=shot.blue?robot:s.opponent;
    let remaining=Math.min(shot.left,dt*23),result:PracticeResult|null=null;
    while(remaining>0&&!result){
      const step=Math.min(.2,remaining);
      shot.x+=shot.dx*step;shot.y+=shot.dy*step;shot.left-=step;remaining-=step;
      if(shot.x<f.x||shot.x>f.x+f.width||shot.y<f.y||shot.y>f.y+f.height)result="miss";
      else if(!isWalkable(shot.x,shot.y,.05))result="obstacle";
      else if(Math.hypot(shot.x-target.x,shot.y-target.y)<target.model.radius*.86)result="hit";
      else if(shot.left<.001)result="miss";
    }
    if(!result)continue;
    s.lights.splice(i,1);
    s.sparks.push({x:shot.x,y:shot.y,life:.24,blue:shot.blue,kind:result});
    if(!shot.blue)s.lastResult=result;
    if(result==="hit"){
      if(shot.blue){s.hp=Math.max(0,s.hp-10);s.hitFlash=.18;}
      else{s.opponentHp=Math.max(0,s.opponentHp-25);s.opponentFlash=.18;}
      if(!s.hp||!s.opponentHp){s.phase=s.hp?"won":"lost";s.lights.length=0;s.pending=null;s.opponent.moving=false;if(!s.hp){robot.aim=robot.yaw;robot.moving=false;robot.speed=0;}return;}
    }
  }
}
const PRACTICE_POINTS=[{x:108,y:8.5},{x:112,y:9.5},{x:118,y:9.5},{x:124,y:9.5},{x:130,y:8.5},{x:136,y:9.5},{x:134,y:6.8}];
export function tickTraining(s:TrainingSession,robot:CampusRobot,person:Position,dt:number,motion:boolean,others:readonly CampusRobot[]=[]){
  s.cooldown=Math.max(0,s.cooldown-dt);
  s.hitFlash=Math.max(0,s.hitFlash-dt);s.opponentFlash=Math.max(0,s.opponentFlash-dt);
  for(let i=s.sparks.length-1;i>=0;i--)if((s.sparks[i].life-=dt)<=0)s.sparks.splice(i,1);
  if(s.phase!=="playing")return;
  if(s.pending!==null)robot.aim=s.pending;
  if(s.pending!==null){
    if(Math.abs(angleDelta(robot.yaw,s.pending))<.16 ){
      robot.yaw=s.pending;launchLight(s,robot,false);s.pending=null;s.cooldown=.48;
    }
  }
  s.elapsed+=dt;
  const foe=s.opponent;
  // Choose a reachable nearby practice marker at intervals; no global AI.
  if(Math.floor(s.elapsed/2.4)!==Math.floor((s.elapsed-dt)/2.4)){
    const choices=PRACTICE_POINTS.filter(p=>robotClearPath(foe,p,foe.model.radius)&&Math.hypot(p.x-robot.x,p.y-robot.y)>3);
    if(choices.length){
      const i=Math.floor(s.elapsed/2.4)%choices.length;
      s.target=choices[i];
    }
  }
  const dx=s.target.x-foe.x,dy=s.target.y-foe.y,d=Math.hypot(dx,dy);
  const next=moveEntity(foe,d>.12?dx/d:0,d>.12?dy/d:0,dt,2.0,
    (x,y)=>inTrainingField({x,y},foe.model.radius)&&robotCanStand(x,y,foe.model.radius)&&Math.hypot(x-robot.x,y-robot.y)>=robot.model.radius+foe.model.radius&&Math.hypot(x-person.x,y-person.y)>=foe.model.radius+.3&&others.every(o=>o===robot||Math.hypot(x-o.x,y-o.y)>=foe.model.radius+o.model.radius));
  const travel=Math.hypot(next.x-foe.x,next.y-foe.y);foe.moving=travel>.001;
  if(foe.moving){const heading=angle(next.x-foe.x,next.y-foe.y);foe.heading=motion?approachAngle(foe.heading,heading,dt*10):heading;foe.distance+=travel;foe.x=next.x;foe.y=next.y;}
  aimCampusRobot(foe,robot);foe.yaw=approachAngle(foe.yaw,foe.aim,dt*5);
  s.opponentCooldown=Math.max(0,s.opponentCooldown-dt);
  if(Math.hypot(foe.x-robot.x,foe.y-robot.y)<9&&s.opponentCooldown<=0&&Math.abs(angleDelta(foe.yaw,foe.aim))<.16){
    s.opponentCooldown=2.1;launchLight(s,foe,true);
  }
  updateLights(s,robot,dt);
}
export function drawTrainingHealth(ctx:CanvasRenderingContext2D,robot:CampusRobot,hp:number,camera:Position,blue:boolean){
  const x=Math.round(robot.x*TILE-camera.x),y=Math.round(robot.y*TILE-camera.y)-robot.model.anchorY-7;
  ctx.fillStyle="#283438";ctx.fillRect(x-16,y,32,5);
  ctx.fillStyle=blue?"#6a9ec8":"#db8270";ctx.fillRect(x-15,y+1,30*hp/100,3);
}
export function drawTrainingEffects(ctx:CanvasRenderingContext2D,s:TrainingSession,camera:Position,motion:boolean){
  const pixel=(p:Position)=>({x:Math.round(p.x*TILE-camera.x),y:Math.round(p.y*TILE-camera.y-LIGHT_HEIGHT)});
  ctx.save();
  if(motion)for(const shot of s.lights){
    const p=pixel(shot);ctx.fillStyle=shot.blue?"#a7cee9":"#f7d28c";
    ctx.fillRect(p.x-2,p.y-2,4,4);
    ctx.fillStyle=shot.blue?"#5685aa":"#ba7856";
    ctx.fillRect(Math.round(p.x-shot.dx*4)-1,Math.round(p.y-shot.dy*4)-1,2,2);
  }
  for(const spark of s.sparks){
    if(!motion&&spark.kind==="launch")continue;
    const p=pixel(spark);ctx.fillStyle=spark.kind==="hit"?"#fff0be":spark.kind==="obstacle"?"#a6a89a":spark.blue?"#aac4d8":"#d8b481";
    ctx.fillRect(p.x-2,p.y-2,4,4);
    if(motion&&spark.kind==="hit"){ctx.fillRect(p.x-4,p.y,2,2);ctx.fillRect(p.x+3,p.y-3,2,2);}
  }
  ctx.restore();
}
