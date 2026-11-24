import test from "node:test";
import assert from "node:assert/strict";
import { GUODONG, ROBOT_PATROL, createCampusRobot, tickCampusRobot, robotCanStand, robotClearPath, robotInReach, robotBlocksPlayer, aimCampusRobot, releaseCampusRobot, robotHeading, inTrainingField, createTraining, fireTraining, tickTraining } from "./pixel-jijia-robot.ts";
import { isWalkable, movePlayer } from "./pixel-jijia-world.ts";

test("过洞步兵巡逻路径与现有碰撞一致，水域、建筑及纪念像不可通过",()=>{
  for(let i=0;i<ROBOT_PATROL.length;i++)assert.ok(robotClearPath(ROBOT_PATROL[i],ROBOT_PATROL[(i+1)%ROBOT_PATROL.length]));
  for(const [x,y] of [[30,48],[130.8,30],[72,26],[115,11],[.5,9]])assert.equal(robotCanStand(x,y),false);
  const r=createCampusRobot(),visited=new Set();
  for(let i=0;i<1600;i++){tickCampusRobot(r,{x:72,y:56},.05,false,0,0,true);visited.add(r.waypoint);assert.ok(robotCanStand(r.x,r.y));}
  assert.equal(visited.size,ROBOT_PATROL.length);
});

test("接管只改变机器人、原人物锚点保持不变且不允许重叠",()=>{
  const r=createCampusRobot(),p={x:r.x,y:r.y+GUODONG.radius+.4};
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
  const r=createCampusRobot(),p={x:72,y:56},before={x:r.x,y:r.y};
  tickCampusRobot(r,p,.05,false,0,0,false);assert.deepEqual({x:r.x,y:r.y},before);
  tickCampusRobot(r,p,.05,true,0,-1,false);assert.ok(r.y<before.y);
  const water={x:30.5,y:48.5};
  assert.deepEqual(movePlayer(water,1,0,.05,false,isWalkable),movePlayer(water,1,0,.05,false,(x,y)=>isWalkable(x,y),true));
});

test("微缩训练只在训练区发生，血量、失能和重置只属于当次训练",()=>{
  const r=createCampusRobot(),person={x:110,y:14};
  assert.equal(inTrainingField(r),false);
  assert.equal(createTraining(r,person),null);
  r.x=124;r.y=8.5;
  const s=createTraining(r,person);
  assert.ok(s&&inTrainingField(s.opponent));
  assert.equal(fireTraining(s,r,{x:118,y:8}),false);
  assert.equal(s.opponentHp,100);
  for(let i=0;i<5;i++){
    s.cooldown=0;
    assert.equal(fireTraining(s,r,s.opponent),true);
  }
  assert.equal(s.opponentHp,0);assert.equal(s.phase,"won");
  assert.equal(fireTraining(s,r,s.opponent),false);
  const reset=createTraining(r,person);
  assert.equal(reset.hp,100);assert.equal(reset.opponentHp,100);
  assert.equal(reset.phase,"playing");
  assert.deepEqual(person,{x:110,y:14});
  for(let i=0;i<500;i++)tickTraining(reset,r,person,.05,true);
  assert.equal(reset.hp,0);assert.equal(reset.phase,"lost");
  assert.ok(inTrainingField(reset.opponent));
  r.x=100;
  assert.equal(fireTraining(reset,r,reset.opponent),false);
});
