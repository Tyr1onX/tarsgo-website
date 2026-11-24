import assert from "node:assert/strict";
import {test} from "node:test";
import * as T from "three";
import {createMatch,startMatch,updateMatch} from "./rmuc-3d-match.ts";
import {launchProjectile,advanceProjectile,ballisticAim,projectileSpeed,projectileDiameter,projectileVisualDiameter,RESIDUE_LIMIT,createProjectileSystem} from "./rmuc-3d-projectiles.ts";
import {createRobotPreview,previewWeaponAt,aimWeapon} from "./rmuc-3d-robots.ts";
import {traceArenaShot,prepareArenaShots} from "./rmuc-3d-shot.ts";
const fixture=()=>{
 const m=createMatch([{id:"r",team:"red",heavy:false,maxHp:200},{id:"b",team:"blue",heavy:false,maxHp:200}],1,1);
 startMatch(m);m.robots[0].ammo=10;
 const target=new T.Mesh(new T.BoxGeometry(.1,.4,.4),new T.MeshBasicMaterial());target.position.set(5,1,0);target.userData.target={type:"robot",id:"b"};target.updateMatrixWorld(true);
 return {m,target,from:new T.Vector3(0,1,0)};
};
test("virtual 17mm/42mm use official speed limits, actual bore and gravity",()=>{
 assert.equal(projectileSpeed(false),25);assert.equal(projectileSpeed(true),16.5);assert.equal(projectileDiameter(false),.017);assert.equal(projectileDiameter(true),.042);
 for(const kind of ["hero","infantry03","infantry04","sentry"]){
  const robot=createRobotPreview(kind);robot.scale.setScalar(kind==="hero"?.5:1);robot.position.set(3,.2,-2);robot.rotation.y=.8;
  const point=new T.Vector3(-4,1,3),speed=projectileSpeed(kind==="hero"),aim=previewWeaponAt(robot,point,speed);
  assert.ok(aim);
  const actual=aimWeapon(robot,aim.yaw,aim.pitch);
  assert.ok(actual.origin.distanceTo(aim.origin)<1e-8);assert.ok(actual.direction.distanceTo(aim.direction)<1e-8);
  const position=aim.origin.clone().addScaledVector(aim.direction,speed*aim.flightTime);position.y-=9.81*aim.flightTime**2/2;
  assert.ok(position.distanceTo(point)<.015);
 }
});
test("ammo and heat at launch, damage only after flight, flight survives shooter death",()=>{
 const {m,target,from}=fixture(),aim=ballisticAim(from,target.position,25);
 const p=launchProjectile(m,"r",from,aim.direction);assert.ok(p);
 assert.equal(m.robots[0].ammo,9);assert.equal(m.robots[0].heat,10);assert.equal(m.robots[1].hp,200);
 const ray=new T.Raycaster(),index=prepareArenaShots([target]);
 for(let i=0;i<5;i++){updateMatch(m,.02);assert.equal(advanceProjectile(m,p,.02,ray,[target],index).done,false);}
 assert.equal(m.robots[1].hp,200);assert.ok(p.position.x>2.4);assert.ok(p.position.y>1);
 m.robots[0].hp=0;
 let hit;for(let i=0;i<10;i++){updateMatch(m,.02);hit=advanceProjectile(m,p,.02,ray,[target],index);if(hit.done)break;}
 assert.equal(hit.damage,20);assert.equal(m.robots[1].hp,180);assert.ok(p.age>.19&&p.age<.21);
});
test("continuous segments stop at first actual blocker or current moved target",()=>{
 const {m,target,from}=fixture(),aim=ballisticAim(from,target.position,25),p=launchProjectile(m,"r",from,aim.direction);
 const wall=new T.Mesh(new T.BoxGeometry(.02,3,2),new T.MeshBasicMaterial());wall.position.set(2,1,0);wall.updateMatrixWorld(true);
 const ray=new T.Raycaster(),roots=[target,wall],index=prepareArenaShots(roots);
 let result;for(let i=0;i<5;i++){result=advanceProjectile(m,p,.025,ray,roots,index);if(result.done)break;}
 assert.equal(result.hit.object,wall);assert.equal(result.damage,0);assert.equal(m.robots[1].hp,200);
 assert.ok(p.position.x<2);assert.equal(traceArenaShot(ray,roots,from,new T.Vector3(1,0,0),1,index),undefined);
 updateMatch(m,.3);
 const q=launchProjectile(m,"r",from,aim.direction);
 advanceProjectile(m,q,.025,ray,[target]);
 target.position.z=2;target.updateMatrixWorld(true);
 for(let i=0;i<12;i++)advanceProjectile(m,q,.025,ray,[target]);
 assert.equal(m.robots[1].hp,200);
});
test("visual pool reuses geometry and material, clears all flight and flash on reset/end",()=>{
 const {m,target,from}=fixture(),scene=new T.Scene(),owner=new T.Group(),system=createProjectileSystem(scene),aim=ballisticAim(from,target.position,25);
 assert.ok(system.fire(m,"r",from,aim.direction,owner));assert.equal(system.slotCount,1);
 const body=system.group.getObjectByName("projectile-core"),geometry=body.geometry,material=body.material;
 system.advance(m,.025,[target]);assert.ok(body.position.x>.6);const camera=new T.PerspectiveCamera(48,1,.025,100);camera.position.set(0,2,10);camera.lookAt(0,1,0);system.visual(camera,720,false);assert.ok(body.scale.x>=.017);
 system.clear();assert.ok(system.group.children.every(o=>o.isInstancedMesh?o.count===0:!o.visible));assert.equal(system.activeCount,0);
 updateMatch(m,.3);assert.ok(system.fire(m,"r",from,aim.direction,owner));assert.equal(system.slotCount,1);assert.equal(body.geometry,geometry);assert.equal(body.material,material);
 updateMatch(m,420);system.advance(m,.025,[target]);assert.equal(system.activeCount,0);assert.equal(m.robots[1].hp,200);
 system.dispose();assert.equal(system.group.parent,null);
});
test("large indexed mesh block pruning preserves native exact first face and draw range",()=>{
 const geometry=new T.PlaneGeometry(20,20,200,200),mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));
 mesh.rotation.set(-.7,.4,.2);mesh.scale.set(1.2,.8,1.1);mesh.position.set(1,2,3);mesh.updateMatrixWorld(true);
 const roots=[mesh],index=prepareArenaShots(roots),native=new T.Raycaster(),optimized=new T.Raycaster();
 let seed=12345;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(let i=0;i<80;i++){
  const point=new T.Vector3((random()-.5)*18,(random()-.5)*18,0).applyMatrix4(mesh.matrixWorld);
  const from=point.clone().add(new T.Vector3(0,0,i%2?.2:1)),direction=point.clone().sub(from).normalize(),range=i%3===0?.1:1.1;
  native.set(from,direction);native.far=range;
  const expected=native.intersectObject(mesh,false)[0],actual=traceArenaShot(optimized,roots,from,direction,range,index);
  assert.equal(actual?.faceIndex,expected?.faceIndex);
  assert.equal(actual?.distance,expected?.distance);
  assert.deepEqual(geometry.drawRange,{start:0,count:Infinity});
 }
});

test("projected visibility is bounded and preserves calibre distinction",()=>{
 assert.equal(projectileVisualDiameter(.017,1,1000,false),.017);
 assert.ok(projectileVisualDiameter(.017,30,800,false)>.017);
 assert.ok(projectileVisualDiameter(.042,30,800,false)>projectileVisualDiameter(.017,30,800,false));
 assert.ok(Math.abs(projectileVisualDiameter(.017,1000,10,false)-.102)<1e-9);
 assert.ok(Math.abs(projectileVisualDiameter(.017,1000,10,true)-.034)<1e-9);
});
test("only supported upward contacts leave bounded visual residue; reset clears",()=>{
 const {m,from}=fixture(),scene=new T.Scene(),owner=new T.Group();
 const ground=new T.Mesh(new T.PlaneGeometry(20,20),new T.MeshBasicMaterial({side:T.DoubleSide}));ground.rotation.x=-Math.PI/2;ground.updateMatrixWorld(true);
 const system=createProjectileSystem(scene,{height:()=>0,accept:hit=>hit.object===ground});
 for(let i=0;i<RESIDUE_LIMIT+3;i++){
  m.robots[0].ammo=10;m.robots[0].cooldown=0;m.robots[0].thermalLock=false;m.robots[0].heat=0;
  assert.ok(system.fire(m,"r",from,new T.Vector3(.1,-1,0),owner));system.advance(m,.06,[ground]);
 }
 assert.equal(system.residueCount,RESIDUE_LIMIT);assert.equal(m.robots[1].hp,200);
 const camera=new T.PerspectiveCamera(48,1,.025,100);system.visual(camera,720,false);
 assert.equal(system.group.children.filter(o=>o.isInstancedMesh).reduce((n,o)=>n+o.count,0),RESIDUE_LIMIT);
 for(let i=0;i<21;i++)system.advance(m,1,[]);
 assert.equal(system.residueCount,0);
 system.clear();assert.ok(system.group.children.filter(o=>o.isInstancedMesh).every(o=>o.count===0));system.dispose();
});

test("dead robot physical mesh still blocks a projectile without repeat damage",()=>{
 const {m,target,from}=fixture();m.robots[1].hp=0;
 const behind=new T.Mesh(new T.BoxGeometry(.1,.4,.4),new T.MeshBasicMaterial());behind.position.set(6,1,0);behind.userData.target={type:"outpost",team:"blue"};behind.updateMatrixWorld(true);
 const ray=new T.Raycaster(),roots=[target,behind],p=launchProjectile(m,"r",from,ballisticAim(from,target.position,25).direction);
 let result;for(let i=0;i<20;i++){result=advanceProjectile(m,p,.025,ray,roots);if(result.done)break;}
 assert.equal(result.hit.object,target);assert.equal(result.damage,0);assert.equal(m.sides.blue.outpost,1000);
});
