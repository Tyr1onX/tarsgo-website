import test from "node:test";
import assert from "node:assert/strict";
import { ROBOT_MODELS, createCampusRobots, nearestRobot, startRobotDemo, createCampusRobot, tickCampusRobot, robotCanStand, robotClearPath, robotInReach, robotBlocksPlayer, aimCampusRobot, releaseCampusRobot, robotHeading, inTrainingField, createTraining, fireTraining, tickTraining } from "./pixel-jijia-robot.ts";
const GUODONG=ROBOT_MODELS.guodong,ROBOT_PATROL=GUODONG.route;
import { isWalkable, movePlayer } from "./pixel-jijia-world.ts";

test("过洞步兵巡逻路径与现有碰撞一致，水域、建筑及纪念像不可通过",()=>{
  for(let i=0;i<ROBOT_PATROL.length;i++)assert.ok(robotClearPath(ROBOT_PATROL[i],ROBOT_PATROL[(i+1)%ROBOT_PATROL.length],GUODONG.radius));
  for(const [x,y] of [[30,48],[130.8,30],[72,26],[115,11],[.5,9]])assert.equal(robotCanStand(x,y,GUODONG.radius),false);
  const r=createCampusRobot(GUODONG),visited=new Set();
  for(let i=0;i<1600;i++){tickCampusRobot(r,{x:72,y:56},.05,false,0,0,true);visited.add(r.waypoint);assert.ok(robotCanStand(r.x,r.y,GUODONG.radius));}
  assert.equal(visited.size,ROBOT_PATROL.length);
});

test("接管只改变机器人、原人物锚点保持不变且不允许重叠",()=>{
  const r=createCampusRobot(GUODONG),p={x:r.x,y:r.y+GUODONG.radius+.4};
  assert.ok(robotInReach(r,p));
  assert.equal(robotBlocksPlayer(r,r.x,r.y),true);
  const before={...p};
  for(let i=0;i<45;i++)tickCampusRobot(r,p,.05,true,0,1,true);
  assert.ok(Math.hypot(r.x-p.x,r.y-p.y)>=GUODONG.radius+.3-.0001);
  for(let i=0;i<15;i++)tickCampusRobot(r,p,.05,true,-1,0,true);
  assert.deepEqual(p,before);
  const h=r.heading;aimCampusRobot(r,{x:r.x+2,y:r.y});
  for(let i=0;i<30;i++)tickCampusRobot(r,p,.05,true,0,0,true);
  assert.equal(r.heading,h);assert.equal(robotHeading(r.yaw),6);
  const parked={x:r.x,y:r.y};releaseCampusRobot(r);assert.deepEqual({x:r.x,y:r.y},parked);
});

test("减少动态不影响真实输入；人物自定义碰撞仍使用原水深速度",()=>{
  const r=createCampusRobot(GUODONG),p={x:72,y:56},before={x:r.x,y:r.y};
  tickCampusRobot(r,p,.05,false,0,0,false);assert.deepEqual({x:r.x,y:r.y},before);
  tickCampusRobot(r,p,.05,true,0,-1,false);assert.ok(r.y<before.y);
  const water={x:30.5,y:48.5};
  assert.deepEqual(movePlayer(water,1,0,.05,false,isWalkable),movePlayer(water,1,0,.05,false,(x,y)=>isWalkable(x,y),true));
});

test("远程驾驶后试验场内恢复巡逻，远处可安全停靠且不瞬移",()=>{
  const r={...createCampusRobot(GUODONG),x:124.107,y:8.48},person={x:110.7,y:13.6};
  const before={x:r.x,y:r.y};releaseCampusRobot(r);
  assert.ok(r.waypoint>=0);assert.deepEqual({x:r.x,y:r.y},before);
  for(let i=0;i<500;i++)tickCampusRobot(r,person,.05,false,0,0,true);
  assert.ok(r.x<115);assert.ok(robotCanStand(r.x,r.y,GUODONG.radius));
  const remote={...createCampusRobot(GUODONG),x:80,y:12};
  releaseCampusRobot(remote);assert.equal(remote.waypoint,-1);
  assert.deepEqual({x:remote.x,y:remote.y},{x:80,y:12});
});
test("起步逐渐提速、停止保留轮组相位，转向不瞬间跳变",()=>{
  const r=createCampusRobot(GUODONG),person={x:72,y:56};
  const h=r.heading;
  tickCampusRobot(r,person,.05,true,0,-1,true);
  assert.ok(r.speed>0&&r.speed<GUODONG.speed);
  assert.ok(Math.abs(r.heading-h)<=.5+1e-6);
  const before=r.distance;tickCampusRobot(r,person,.05,true,0,0,true);
  assert.equal(r.distance,before);assert.equal(r.speed,0);
});
test("微缩训练只在训练区发生，虚拟光点先移动，随后判定命中、障碍或未命中",()=>{
  const r=createCampusRobot(GUODONG),person={x:110,y:14};
  assert.equal(inTrainingField(r,r.model.radius),false);
  assert.equal(createTraining(r,person),null);
  r.x=124;r.y=9;
  const s=createTraining(r,person);
  assert.ok(s&&inTrainingField(s.opponent,s.opponent.model.radius));
  // Isolate the visual token lifecycle from unrelated AI movement.
  s.target={...s.opponent};s.opponentCooldown=100;
  const step=(n)=>{for(let i=0;i<n;i++){tickCampusRobot(r,person,.05,true,0,0,false);tickTraining(s,r,person,.05,false);}};
  assert.ok(fireTraining(s,r,{x:124,y:11}));
  assert.equal(s.opponentHp,100);
  step(1);assert.ok(s.pending!==null||s.lights.length>0);assert.equal(s.opponentHp,100);
  step(32);assert.equal(s.lastResult,"miss");assert.equal(s.opponentHp,100);
  // The existing CAD-derived outpost footprint blocks a light token.
  r.x=120;r.y=9;s.cooldown=0;
  assert.ok(fireTraining(s,r,{x:120,y:3}));
  step(32);assert.equal(s.lastResult,"obstacle");assert.equal(s.opponentHp,100);
  r.x=124;r.y=9;
  for(let i=0;i<4;i++){
    s.target={...s.opponent};s.cooldown=0;s.elapsed=0;
    assert.ok(fireTraining(s,r,{x:s.opponent.x,y:s.opponent.y-20/16}));
    assert.equal(s.opponentHp,100-i*25);
    step(32);assert.equal(s.opponentHp,75-i*25);
  }
  assert.equal(s.phase,"won");assert.equal(s.lights.length,0);
  assert.equal(fireTraining(s,r,s.opponent),false);
  const reset=createTraining(r,person);
  assert.equal(reset.hp,100);assert.equal(reset.opponentHp,100);
  assert.equal(reset.phase,"playing");assert.equal(reset.lights.length,0);
  assert.deepEqual(person,{x:110,y:14});
  r.x=100;assert.equal(fireTraining(reset,r,reset.opponent),false);
});


test("失能停止训练、清空在途光点并可重新开始",()=>{
  const r={...createCampusRobot(GUODONG),x:124,y:9},person={x:110,y:14};
  const s=createTraining(r,person);assert.ok(s);
  s.hp=10;
  s.target={...s.opponent};
  s.opponentCooldown=0;
  for(let i=0;i<60&&s.phase==="playing";i++){tickCampusRobot(r,person,.05,true,0,0,false);tickTraining(s,r,person,.05,false);}
  assert.equal(s.phase,"lost");assert.equal(s.hp,0);assert.equal(s.lights.length,0);
  const yaw=r.aim;assert.equal(fireTraining(s,r,{x:120,y:4}),false);assert.equal(r.aim,yaw);
  const next=createTraining(r,person);assert.ok(next);assert.equal(next.hp,100);assert.equal(next.phase,"playing");
});

test("阵容各自巡逻路径可通行，静态展品无驾驶能力，非对抗机型不创建训练",()=>{
  const robots=createCampusRobots(),person={x:72,y:56};
  for(const robot of robots){
    const {route,radius}=robot.model;
    for(let i=0;i<route.length;i++)assert.ok(robotClearPath(route[i],route[(i+1)%route.length],radius),robot.model.name);
  }
  const eng=robots.find(r=>r.model.capability==="carry"),fixed=robots.find(r=>!r.model.speed);
  for(let i=0;i<2400;i++)for(const robot of robots)tickCampusRobot(robot,person,.05,false,0,0,true,robots);
  for(const robot of robots)assert.ok(robotCanStand(robot.x,robot.y,robot.model.radius));
  const parked={x:fixed.x,y:fixed.y};startRobotDemo(fixed);tickCampusRobot(fixed,person,.05,true,1,1,true,robots);assert.deepEqual({x:fixed.x,y:fixed.y},parked);assert.ok(fixed.demo>0);
  eng.x=124;eng.y=9;assert.equal(createTraining(eng,person,robots),null);
});
test("近邻目标唯一且不同半径的机器人不能互相穿过",()=>{
  const a=createCampusRobot(GUODONG),b=createCampusRobot(ROBOT_MODELS.wheelLeg),p={x:105,y:9};
  Object.assign(a,{x:107,y:9});Object.assign(b,{x:110,y:9});
  assert.equal(nearestRobot([b,a],p),a);
  for(let i=0;i<20;i++)tickCampusRobot(a,p,.05,true,1,0,true,[a,b]);
  assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=a.model.radius+b.model.radius);
});
test("减少动态不改变训练仿真的结果",()=>{
  const person={x:72,y:56};
  const run=motion=>{
    const robot={...createCampusRobot(ROBOT_MODELS.wheelLeg),x:124,y:9};
    const s=createTraining(robot,person);assert.ok(s);
    for(let i=0;i<300;i++){
      if(i%30===0)fireTraining(s,robot,{x:s.opponent.x,y:s.opponent.y-20/16});
      tickCampusRobot(robot,person,.05,true,0,0,motion);
      tickTraining(s,robot,person,.05,motion);
    }
    return [s.hp,s.opponentHp,s.phase,s.lastResult,s.opponent.x,s.opponent.y];
  };
  assert.deepEqual(run(true),run(false));
});
