import assert from "node:assert/strict";
import {test} from "node:test";
import * as T from "three";
import {createRobotFeedback,mergeDamageBurst,placeArenaMarker,shieldClipPlanes} from "./rmuc-3d-robot-feedback.ts";
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
 const drawTexts=[];globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},fill(){},strokeText(){},fillText(s){drawTexts.push(s);}})})};
 let feedback;try{feedback=createRobotFeedback(scene,[owner,g]);}finally{delete globalThis.document;}
 const count=g.children.length,geometry=plate.geometry,camera=new T.PerspectiveCamera(48,1,.025,100);camera.position.set(3,4,8);camera.lookAt(5,1,0);
 const projectile=createProjectileSystem(scene);startMatch(m);m.robots[0].ammo=10;m.onDamage=feedback.damage;
 assert.ok(projectile.fire(m,red.id,new T.Vector3(0,1,0),ballisticAim(new T.Vector3(0,1,0),new T.Vector3(5,1,0),25).direction,owner));
 for(let i=0;i<12&&m.robots[1].hp===200;i++){m.elapsed+=.025;projectile.advance(m,.025,[g],undefined,feedback.contact);}
 assert.equal(m.robots[1].hp,180);
 feedback.update(m,camera,720,"all");
 assert.notEqual(plate.material,plateMaterial);assert.equal(plate.material.map,plateMaterial.map);assert.equal(plate.material.roughness,plateMaterial.roughness);assert.equal(plate.material.metalness,plateMaterial.metalness);assert.notEqual(body.material,bodyMaterial);assert.equal(led.material,ledMaterial);
 assert.ok(drawTexts.includes("−20"));assert.ok(drawTexts.includes("L1"));assert.ok(feedback.group.children.every(o=>o.material.depthTest&&o.material.depthWrite===false));assert.equal(feedback.group.children.length,4);
 feedback.restoreMaterials();assert.equal(plate.material,plateMaterial);assert.equal(body.material,bodyMaterial);assert.equal(g.children.length,count);assert.equal(plate.geometry,geometry);
 feedback.update(m,camera,720,"all",true);assert.equal(plate.material,plateMaterial);assert.equal(body.material,bodyMaterial);
 const damageSprite=feedback.group.children[3],fixedY=damageSprite.position.y;assert.equal(damageSprite.visible,true);assert.equal(damageSprite.material.opacity,1);
 m.elapsed+=.05;feedback.update(m,camera,720,"all",true);assert.equal(damageSprite.position.y,fixedY);assert.equal(damageSprite.material.opacity,1);
 feedback.update(m,camera,720,"red");assert.equal(feedback.group.children[2].visible,false);assert.equal(feedback.group.children[3].visible,false);assert.notEqual(plate.material,plateMaterial);feedback.restoreMaterials();
 m.robots[1].hp=0;feedback.update(m,camera,720,"all");assert.equal(plate.material,plateMaterial);assert.equal(body.material,bodyMaterial);
 m.robots[1].hp=200;m.elapsed+=1;feedback.update(m,camera,720,"all");assert.equal(feedback.group.children[3].visible,false);
 feedback.clear();assert.equal(feedback.group.children[3].visible,false);feedback.dispose();projectile.dispose();assert.equal(feedback.group.parent,null);
});

test("unlocated referee damage has a number but cannot invent a contact surface",()=>{
 const id=GROUND_ROSTER[0].id,robot=new T.Group();robot.name=id;
 const plate=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial());plate.userData={armorSurface:true,hitPlate:true,target:{type:"robot",id}};robot.add(plate);
 const scene=new T.Scene();scene.add(robot);scene.updateMatrixWorld(true);
 globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},fill(){},strokeText(){},fillText(){}})})};
 let feedback;try{feedback=createRobotFeedback(scene,[robot]);}finally{delete globalThis.document;}
 const m=createMatch([{id,team:"blue",heavy:false,maxHp:200}],1,1),camera=new T.PerspectiveCamera(48,1,.025,100);camera.position.z=5;startMatch(m);m.elapsed=2;
 const original=plate.material;
 feedback.damage({target:{type:"robot",id},amount:20,at:2,source:"dart"});feedback.update(m,camera,720,"all");
 assert.equal(plate.material,original);assert.equal(feedback.group.children[1].visible,true);
 feedback.dispose();
});

test("same-tick structural destruction and rebuild stay visible beside damage and later low-priority hit notices",()=>{
 const scene=new T.Scene(),structure=new T.Group();structure.add(new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial()));scene.add(structure);scene.updateMatrixWorld(true);
 const texts=[];globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},fill(){},strokeText(){},fillText(s){texts.push(s);}})})};
 let feedback;try{feedback=createRobotFeedback(scene,[],[{key:"blue-outpost",team:"blue",kind:"outpost",object:structure}]);}finally{delete globalThis.document;}
 const m=createMatch([],1,1);startMatch(m);m.elapsed=20;m.sides.blue.outpost=500;m.sides.blue.outpostOwner="red";
 const camera=new T.PerspectiveCamera(48,1,.025,100);camera.position.set(0,2,5);camera.lookAt(0,1,0);
 feedback.event({type:"outpost-destroyed",team:"blue",location:"blue",hp:0,at:20,visibility:"all"});
 feedback.event({type:"outpost-rebuilt",team:"red",location:"blue",hp:500,at:20,visibility:"all"});
 feedback.damage({target:{type:"outpost",team:"blue"},amount:20,at:20,source:"projectile"});
 feedback.event({type:"dart-hit",team:"red",location:"blue",mode:"outpost",damage:20,at:20,visibility:"all"});
 feedback.update(m,camera,720,"all");
 assert.ok(texts.includes("摧毁 · 重建 +500"));assert.ok(texts.includes("−20"));
 assert.equal(feedback.amountFor("blue-outpost",20),20);feedback.dispose();
});

test("marker packing reserves priority space, clamps offsets and hides rather than stacking",()=>{
 const view={width:400,height:220},anchor={x:200,y:110,w:88,h:34};
 const first=placeArenaMarker(anchor,[],view);assert.equal(first.scale,1);
 assert.equal(placeArenaMarker(anchor,[first.rect],view),null);
 const nearby={...anchor,x:265};
 const compact=placeArenaMarker(nearby,[first.rect],view);assert.ok(compact);
 assert.ok(Math.abs(compact.rect.x-first.rect.x)>=(compact.rect.w+first.rect.w)/2+4);
 const smaller={x:260,y:110,w:40,h:20};
 const stable=placeArenaMarker(smaller,[],view,{...compact,dx:100,dy:-100});
 assert.ok(Math.abs(stable.dx)<=smaller.w*.32);assert.ok(Math.abs(stable.dy)<=smaller.h*.38);
 assert.equal(placeArenaMarker({...anchor,x:-10},[],view),null);
});
test("referee immunity and shield visibility use exact state, depth and team perspective",()=>{
 const r=GROUND_ROSTER.find(r=>r.team==="red"&&r.number==="03"),b=GROUND_ROSTER.find(r=>r.team==="blue"&&r.number==="03");
 const m=createMatch([r,b].map(x=>({id:x.id,team:x.team,heavy:false,maxHp:200})),1,1);startMatch(m);
 const scene=new T.Scene(),robot=new T.Group();robot.name=b.id;robot.add(new T.Mesh(new T.BoxGeometry(.8,.8,.8),new T.MeshStandardMaterial()));scene.add(robot);scene.updateMatrixWorld(true);
 globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},fill(){},strokeText(){},fillText(){}})})};
 let feedback;try{feedback=createRobotFeedback(scene,[robot]);}finally{delete globalThis.document;}
 let blocks=0;const hit=()=>damageTarget(m,m.robots[0],{type:"robot",id:b.id},undefined,()=>blocks++);
 assert.equal(hit(),20);assert.equal(blocks,0);
 while(m.robots[1].hp>0)hit();assert.equal(blocks,0);
 assert.equal(hit(),0);assert.equal(blocks,0);
 assert.ok(reviveRobot(m,b.id,true));assert.ok(revivalStatus(m,m.robots[1]).immune);
 assert.equal(hit(),0);assert.equal(blocks,1);
 damageTarget(m,m.robots[1],{type:"robot",id:b.id},undefined,()=>blocks++);assert.equal(blocks,1);
 const camera=new T.PerspectiveCamera(48,1,.025,100);camera.position.set(0,2,5);camera.lookAt(0,0,0);
 const shell=scene.getObjectByName("ion-shield");assert.ok(shell.material.depthTest);assert.equal(shell.material.depthWrite,false);
 feedback.update(m,camera,720,"red",true);assert.equal(shell.visible,false);
 feedback.update(m,camera,720,"blue",true);assert.equal(shell.visible,true);
 robot.visible=false;feedback.update(m,camera,720,"all",true,{firstPerson:true});assert.equal(shell.visible,false);
 robot.visible=true;m.robots[1].hp=0;feedback.update(m,camera,720,"all",true);assert.equal(shell.visible,false);
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
 globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},fill(){},strokeText(){},fillText(){}})})};
 let feedback;try{feedback=createRobotFeedback(scene,[robot]);}finally{delete globalThis.document;}
 const m=createMatch([{id,team:"blue",heavy:false,maxHp:200}]),state=m.robots[0],camera=new T.PerspectiveCamera(48,1,.025,100);camera.position.set(0,2,5);camera.lookAt(0,.5,0);startMatch(m);
 const accent=scene.getObjectByName("state-accent"),pulse=scene.getObjectByName("state-pulse");
 m.elapsed=1;state.powerLockUntil=2;state.thermalLock="cooling";
 feedback.update(m,camera,720,"all");assert.equal(accent.visible,true);assert.equal(accent.material.color.getHex(),0x8c9791);
 m.elapsed=2.05;feedback.update(m,camera,720,"all");assert.equal(accent.material.color.getHex(),0xf1a67f);assert.equal(pulse.visible,true);
 feedback.event({type:"robot-revived",robot:id,team:"blue",hp:100,at:2.1,visibility:"blue"});
 feedback.event({type:"heal",robot:id,team:"blue",status:"completed",amount:5,at:2.2,visibility:"blue"});m.elapsed=2.4;
 feedback.update(m,camera,720,"blue");assert.ok(pulse.visible&&pulse.userData.alpha>0);pulse.onBeforeRender();assert.equal(pulse.material.uniforms.tint.value.getHex(),0x65bdff);
 feedback.update(m,camera,720,"red");assert.equal(accent.visible,false);assert.equal(pulse.visible,false);
 feedback.update(m,camera,720,"all",true);assert.equal(accent.visible,true);assert.equal(pulse.visible,false);
 feedback.update(m,camera,720,"all",false,{reserved:[{x:360,y:360,w:720,h:720}]});assert.ok(feedback.group.children.every(o=>!o.visible));
 robot.visible=false;feedback.update(m,camera,720,"all",false,{firstPerson:true});assert.equal(accent.visible,false);assert.equal(pulse.visible,false);
 robot.visible=true;feedback.clear();assert.equal(accent.visible,false);assert.equal(pulse.visible,false);feedback.dispose();assert.equal(scene.getObjectByName("state-accent"),undefined);
});
