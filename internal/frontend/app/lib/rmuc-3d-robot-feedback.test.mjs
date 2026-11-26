import assert from "node:assert/strict";
import {test} from "node:test";
import * as T from "three";
import {createRobotFeedback,mergeDamageBurst,shieldClipPlanes} from "./rmuc-3d-robot-feedback.ts";
import {createMatch,startMatch,damageTarget,reviveRobot,revivalStatus} from "./rmuc-3d-match.ts";
import {createProjectileSystem,ballisticAim} from "./rmuc-3d-projectiles.ts";
import {GROUND_ROSTER} from "./rmuc-3d-identity.ts";

test("damage bursts merge only bounded adjacent hits",()=>{
 let burst=mergeDamageBurst(undefined,20,1);
 burst=mergeDamageBurst(burst,15,1.1);assert.equal(burst.amount,35);
 burst=mergeDamageBurst(burst,9,1.4);assert.equal(burst.amount,9);
 for(let i=1;i<=6;i++)burst=mergeDamageBurst(burst,1,1.4+i*.15);
 assert.ok(burst.amount<15);
});

test("actual projectile damage drives one robot's feedback; geometry, team LEDs and life state remain independent",()=>{
 const red=GROUND_ROSTER.find(r=>r.team==="red"&&r.number==="03"),blue=GROUND_ROSTER.find(r=>r.team==="blue"&&r.number==="03");
 const m=createMatch([red,blue].map(r=>({id:r.id,team:r.team,heavy:false,maxHp:200})),1,1);
 const scene=new T.Scene(),g=new T.Group(),owner=new T.Group(),bodyMaterial=new T.MeshStandardMaterial(),plateMaterial=new T.MeshStandardMaterial({map:new T.DataTexture(new Uint8Array([200,200,200,255]),1,1),roughness:.38,metalness:.5}),ledMaterial=new T.MeshStandardMaterial({emissive:0x1655ff,emissiveIntensity:2.2});
 const body=new T.Mesh(new T.BoxGeometry(.7,.2,.7),bodyMaterial),plate=new T.Mesh(new T.BoxGeometry(.1,.4,.4),plateMaterial),led=new T.Mesh(new T.BoxGeometry(.1,.03,.3),ledMaterial);
 plate.userData={armorSurface:true,hitPlate:true,target:{type:"robot",id:blue.id}};led.userData={armorLed:true,hitPlate:true};body.position.y=.2;plate.position.y=1;led.position.y=1.4;
 g.name=blue.id;g.position.x=5;g.add(body,plate,led);scene.add(g);owner.name=red.id;scene.add(owner);
 scene.updateMatrixWorld(true);
 const feedback=createRobotFeedback(scene,[owner,g]);
 const count=g.children.length,geometry=plate.geometry,camera=new T.PerspectiveCamera(48,1,.025,100);camera.position.set(3,4,8);camera.lookAt(5,1,0);
 const projectile=createProjectileSystem(scene);startMatch(m);m.robots[0].ammo=10;m.onDamage=feedback.damage;
 assert.ok(projectile.fire(m,red.id,new T.Vector3(0,1,0),ballisticAim(new T.Vector3(0,1,0),new T.Vector3(5,1,0),25).direction,owner));
 for(let i=0;i<12&&m.robots[1].hp===200;i++){m.elapsed+=.025;projectile.advance(m,.025,[g],undefined,feedback.contact);}
 assert.equal(m.robots[1].hp,180);
 feedback.update(m,camera,"all");
 assert.notEqual(plate.material,plateMaterial);assert.equal(plate.material.map,plateMaterial.map);assert.equal(plate.material.roughness,plateMaterial.roughness);assert.equal(plate.material.metalness,plateMaterial.metalness);assert.notEqual(body.material,bodyMaterial);assert.equal(led.material,ledMaterial);
 assert.equal(feedback.amountFor(blue.id,m.elapsed),20);assert.ok(!scene.getObjectByName("robot-combat-feedback"));
 feedback.restoreMaterials();assert.equal(plate.material,plateMaterial);assert.equal(body.material,bodyMaterial);assert.equal(g.children.length,count);assert.equal(plate.geometry,geometry);
 feedback.update(m,camera,"all",true);assert.equal(plate.material,plateMaterial);assert.equal(body.material,bodyMaterial);
 feedback.update(m,camera,"red");assert.notEqual(plate.material,plateMaterial);feedback.restoreMaterials();
 m.robots[1].hp=0;feedback.update(m,camera,"all");assert.equal(plate.material,plateMaterial);assert.equal(body.material,bodyMaterial);
 m.robots[1].hp=200;m.elapsed+=1;feedback.update(m,camera,"all");assert.equal(feedback.amountFor(blue.id,m.elapsed),0);
 feedback.clear();assert.equal(feedback.amountFor(blue.id,m.elapsed),0);feedback.dispose();projectile.dispose();assert.equal(scene.getObjectByName("robot-state-effects"),undefined);
});

test("unlocated referee damage reaches HUD but cannot invent a contact surface",()=>{
 const id=GROUND_ROSTER[0].id,robot=new T.Group();robot.name=id;
 const plate=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial());plate.userData={armorSurface:true,hitPlate:true,target:{type:"robot",id}};robot.add(plate);
 const scene=new T.Scene();scene.add(robot);scene.updateMatrixWorld(true);
 const feedback=createRobotFeedback(scene,[robot]);
 const m=createMatch([{id,team:"blue",heavy:false,maxHp:200}],1,1),camera=new T.PerspectiveCamera(48,1,.025,100);camera.position.z=5;startMatch(m);m.elapsed=2;
 const original=plate.material;
 feedback.damage({target:{type:"robot",id},amount:20,at:2,source:"dart"});feedback.update(m,camera,"all");
 assert.equal(plate.material,original);assert.equal(feedback.amountFor(id,2),20);
 feedback.dispose();
});

test("structural damage remains available to screen HUD without world labels",()=>{
 const scene=new T.Scene(),structure=new T.Group();structure.add(new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial()));scene.add(structure);scene.updateMatrixWorld(true);
 const feedback=createRobotFeedback(scene,[]);
 const m=createMatch([],1,1);startMatch(m);m.elapsed=20;m.sides.blue.outpost=500;m.sides.blue.outpostOwner="red";
 const camera=new T.PerspectiveCamera(48,1,.025,100);camera.position.set(0,2,5);camera.lookAt(0,1,0);
 feedback.event({type:"outpost-destroyed",team:"blue",location:"blue",hp:0,at:20,visibility:"all"});
 feedback.event({type:"outpost-rebuilt",team:"red",location:"blue",hp:500,at:20,visibility:"all"});
 feedback.damage({target:{type:"outpost",team:"blue"},amount:20,at:20,source:"projectile"});
 feedback.event({type:"dart-hit",team:"red",location:"blue",mode:"outpost",damage:20,at:20,visibility:"all"});
 feedback.update(m,camera,"all");
 assert.equal(scene.children.filter(o=>o instanceof T.Sprite).length,0);
 assert.equal(feedback.amountFor("blue-outpost",20),20);feedback.dispose();
});

test("referee immunity and shield visibility use exact state, depth and team perspective",()=>{
 const r=GROUND_ROSTER.find(r=>r.team==="red"&&r.number==="03"),b=GROUND_ROSTER.find(r=>r.team==="blue"&&r.number==="03");
 const m=createMatch([r,b].map(x=>({id:x.id,team:x.team,heavy:false,maxHp:200})),1,1);startMatch(m);
 const scene=new T.Scene(),robot=new T.Group();robot.name=b.id;robot.add(new T.Mesh(new T.BoxGeometry(.8,.8,.8),new T.MeshStandardMaterial()));scene.add(robot);scene.updateMatrixWorld(true);
 const feedback=createRobotFeedback(scene,[robot]);
 let blocks=0;const hit=()=>damageTarget(m,m.robots[0],{type:"robot",id:b.id},undefined,()=>blocks++);
 assert.equal(hit(),20);assert.equal(blocks,0);
 while(m.robots[1].hp>0)hit();assert.equal(blocks,0);
 assert.equal(hit(),0);assert.equal(blocks,0);
 assert.ok(reviveRobot(m,b.id,true));assert.ok(revivalStatus(m,m.robots[1]).immune);
 assert.equal(hit(),0);assert.equal(blocks,1);
 damageTarget(m,m.robots[1],{type:"robot",id:b.id},undefined,()=>blocks++);assert.equal(blocks,1);
 const camera=new T.PerspectiveCamera(48,1,.025,100);camera.position.set(0,2,5);camera.lookAt(0,0,0);
 const shell=scene.getObjectByName("ion-shield");assert.ok(shell.material.depthTest);assert.equal(shell.material.depthWrite,false);
 feedback.update(m,camera,"red",true);assert.equal(shell.visible,false);
 feedback.update(m,camera,"blue",true);assert.equal(shell.visible,true);
 robot.visible=false;feedback.update(m,camera,"all",true,{firstPerson:true});assert.equal(shell.visible,false);
 robot.visible=true;m.robots[1].hp=0;feedback.update(m,camera,"all",true);assert.equal(shell.visible,false);
 feedback.clear();assert.equal(shell.visible,false);feedback.dispose();assert.equal(scene.getObjectByName("ion-shield"),undefined);
});

test("shield local clipping uses actual world wall normals and floor; no collision geometry changes",()=>{
 const wall=new T.Mesh(new T.BoxGeometry(.2,2,4),new T.MeshStandardMaterial());wall.position.set(.7,1,0);wall.updateMatrixWorld(true);
 const ray=new T.Raycaster(),center=new T.Vector3(0,.8,0),planes=Array.from({length:5},()=>new T.Vector4());
 const trace=(from,direction,distance)=>{ray.set(from,direction);ray.far=distance;return ray.intersectObject(wall,false)[0];};
 const geometry=wall.geometry,material=wall.material;
 const count=shieldClipPlanes(planes,center,1,.75,0,trace);assert.equal(count,2);
 const values=(x,y,z)=>planes.slice(0,count).map(p=>p.dot(new T.Vector4(x,y,z,1)));
 assert.ok(values(0,.8,0).every(v=>v>0));assert.ok(values(.85,.8,0).some(v=>v<0));assert.ok(values(0,-.1,0).some(v=>v<0));
 assert.equal(wall.geometry,geometry);assert.equal(wall.material,material);assert.equal(shieldClipPlanes(planes,center,.2,.4,0,trace),1);
});
test("live entity accents and event pulses honor priority, team visibility, reduced motion and cleanup",()=>{
 const id=GROUND_ROSTER.find(r=>r.team==="blue"&&r.number==="03").id,robot=new T.Group();robot.name=id;
 const body=new T.Mesh(new T.BoxGeometry(.7,.6,.7),new T.MeshStandardMaterial());body.position.y=.3;robot.add(body);
 const scene=new T.Scene();scene.add(robot);scene.updateMatrixWorld(true);
 const feedback=createRobotFeedback(scene,[robot]);
 const m=createMatch([{id,team:"blue",heavy:false,maxHp:200}]),state=m.robots[0],camera=new T.PerspectiveCamera(48,1,.025,100);camera.position.set(0,2,5);camera.lookAt(0,.5,0);startMatch(m);
 const accent=scene.getObjectByName("state-accent"),pulse=scene.getObjectByName("state-pulse");
 m.elapsed=1;state.powerLockUntil=2;state.thermalLock="cooling";
 feedback.update(m,camera,"all");assert.equal(accent.visible,true);assert.equal(accent.material.color.getHex(),0x8c9791);
 m.elapsed=2.05;feedback.update(m,camera,"all");assert.equal(accent.material.color.getHex(),0xf1a67f);assert.equal(pulse.visible,true);
 feedback.event({type:"robot-revived",robot:id,team:"blue",hp:100,at:2.1,visibility:"blue"});
 feedback.event({type:"heal",robot:id,team:"blue",status:"completed",amount:5,at:2.2,visibility:"blue"});m.elapsed=2.4;
 feedback.update(m,camera,"blue");assert.ok(pulse.visible&&pulse.userData.alpha>0);pulse.onBeforeRender();assert.equal(pulse.material.uniforms.tint.value.getHex(),0x65bdff);
 feedback.update(m,camera,"red");assert.equal(accent.visible,false);assert.equal(pulse.visible,false);
 feedback.update(m,camera,"all",true);assert.equal(accent.visible,true);assert.equal(pulse.visible,false);
 robot.visible=false;feedback.update(m,camera,"all",false,{firstPerson:true});assert.equal(accent.visible,false);assert.equal(pulse.visible,false);
 robot.visible=true;feedback.clear();assert.equal(accent.visible,false);assert.equal(pulse.visible,false);feedback.dispose();assert.equal(scene.getObjectByName("state-accent"),undefined);
});

test("effective healing alone drives bounded green cross feedback, with team and lifecycle restrictions",()=>{
 const id=GROUND_ROSTER[0].id,robot=new T.Group(),scene=new T.Scene();
 robot.name=id;robot.add(new T.Mesh(new T.BoxGeometry(.7,.6,.7),new T.MeshStandardMaterial()));scene.add(robot);scene.updateMatrixWorld(true);
 const feedback=createRobotFeedback(scene,[robot]),m=createMatch([{id,team:"blue",heavy:true,maxHp:400}]),camera=new T.PerspectiveCamera();
 startMatch(m);m.elapsed=2;
 const crosses=scene.getObjectByName("robot-state-effects").children.filter(o=>o.name==="recovery-cross");
 assert.equal(crosses.length,3);assert.ok(crosses.every(o=>o.geometry===crosses[0].geometry));
 const heal={type:"heal",robot:id,team:"blue",visibility:"blue",at:2,status:"completed",amount:0};
 feedback.event(heal);feedback.update(m,camera,"all");assert.ok(crosses.every(o=>!o.visible));
 feedback.event({...heal,status:"requested",amount:5});feedback.update(m,camera,"all");assert.ok(crosses.every(o=>!o.visible));
 feedback.event({...heal,amount:5});m.elapsed=2.1;feedback.update(m,camera,"blue");
 assert.ok(crosses.every(o=>o.visible&&o.material.depthTest&&!o.material.depthWrite));
 crosses[0].onBeforeRender();assert.equal(crosses[0].material.uniforms.tint.value.getHex(),0x65ed9a);
 const y=crosses[0].position.y;m.elapsed=2.2;feedback.update(m,camera,"blue");assert.notEqual(crosses[0].position.y,y);
 feedback.update(m,camera,"red");assert.ok(crosses.every(o=>!o.visible));
 feedback.update(m,camera,"all",true);assert.ok(crosses.every(o=>!o.visible));
 m.elapsed=3;feedback.event({...heal,at:3,amount:5});m.elapsed=3.5;feedback.update(m,camera,"all");assert.ok(crosses.every(o=>o.visible));
 m.elapsed=4.4;feedback.update(m,camera,"all");assert.ok(crosses.every(o=>!o.visible));
 feedback.event({...heal,at:4.4,amount:5});feedback.event({...heal,type:"robot-dead",at:4.4});feedback.update(m,camera,"all");assert.ok(crosses.every(o=>!o.visible));
 feedback.clear();feedback.dispose();assert.equal(scene.getObjectByName("recovery-cross"),undefined);
});

test("overview has no billboard sprites, HUD damage remains available and entity effects depth test",()=>{
 const identity=GROUND_ROSTER[0],robot=new T.Group(),scene=new T.Scene();
 robot.name=identity.id;robot.add(new T.Mesh(new T.BoxGeometry(.7,.6,.7),new T.MeshStandardMaterial()));scene.add(robot);scene.updateMatrixWorld(true);
 const feedback=createRobotFeedback(scene,[robot]);
 const m=createMatch([{id:identity.id,team:identity.team,heavy:true,maxHp:400}]),camera=new T.PerspectiveCamera(48,1184/721,.025,220);
 camera.position.set(0,2,50);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);startMatch(m);
 feedback.damage({target:{type:"robot",id:identity.id},amount:20,at:0,source:"dart"});
 feedback.update(m,camera,"all");
 scene.traverse(o=>assert.ok(!(o instanceof T.Sprite)));
 assert.equal(feedback.amountFor(identity.id,0),20);
 const effects=scene.getObjectByName("robot-state-effects");
 assert.ok(effects.children.every(o=>o.material.depthTest&&!o.material.depthWrite));
 feedback.dispose();assert.equal(scene.getObjectByName("robot-state-effects"),undefined);
});
