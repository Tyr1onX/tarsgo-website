import assert from "node:assert/strict";
import {test} from "node:test";
import * as T from "three";
import {createRobotFeedback,mergeDamageBurst} from "./rmuc-3d-robot-feedback.ts";
import {createMatch,startMatch,damageTarget} from "./rmuc-3d-match.ts";
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
 const drawTexts=[];globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},fillRect(){},strokeText(){},fillText(s){drawTexts.push(s);}})})};
 let feedback;try{feedback=createRobotFeedback(scene,[owner,g]);}finally{delete globalThis.document;}
 const count=g.children.length,geometry=plate.geometry,camera=new T.PerspectiveCamera(48,1,.025,100);camera.position.set(3,4,8);camera.lookAt(5,1,0);
 const projectile=createProjectileSystem(scene);startMatch(m);m.robots[0].ammo=10;m.onDamage=feedback.damage;
 assert.ok(projectile.fire(m,red.id,new T.Vector3(0,1,0),ballisticAim(new T.Vector3(0,1,0),new T.Vector3(5,1,0),25).direction,owner));
 for(let i=0;i<12&&m.robots[1].hp===200;i++){m.elapsed+=.025;projectile.advance(m,.025,[g],undefined,feedback.contact);}
 assert.equal(m.robots[1].hp,180);
 feedback.update(m,camera,720,"all");
 assert.notEqual(plate.material,plateMaterial);assert.equal(plate.material.map,plateMaterial.map);assert.equal(plate.material.roughness,plateMaterial.roughness);assert.equal(plate.material.metalness,plateMaterial.metalness);assert.notEqual(body.material,bodyMaterial);assert.equal(led.material,ledMaterial);
 assert.ok(drawTexts.includes("-20"));assert.ok(feedback.group.children.every(o=>o.material.depthTest&&o.material.depthWrite===false));assert.equal(feedback.group.children.length,4);
 feedback.restoreMaterials();assert.equal(plate.material,plateMaterial);assert.equal(body.material,bodyMaterial);assert.equal(g.children.length,count);assert.equal(plate.geometry,geometry);
 feedback.update(m,camera,720,"red");assert.equal(feedback.group.children[2].visible,false);assert.equal(feedback.group.children[3].visible,false);assert.notEqual(plate.material,plateMaterial);feedback.restoreMaterials();
 m.robots[1].hp=0;feedback.update(m,camera,720,"all");assert.equal(plate.material,plateMaterial);assert.equal(body.material,bodyMaterial);
 m.robots[1].hp=200;m.elapsed+=1;feedback.update(m,camera,720,"all");assert.equal(feedback.group.children[3].visible,false);
 feedback.clear();assert.equal(feedback.group.children[3].visible,false);feedback.dispose();projectile.dispose();assert.equal(feedback.group.parent,null);
});

test("unlocated referee damage has a number but cannot invent a contact surface",()=>{
 const id=GROUND_ROSTER[0].id,robot=new T.Group();robot.name=id;
 const plate=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial());plate.userData={armorSurface:true,hitPlate:true,target:{type:"robot",id}};robot.add(plate);
 const scene=new T.Scene();scene.add(robot);scene.updateMatrixWorld(true);
 globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},fillRect(){},strokeText(){},fillText(){}})})};
 let feedback;try{feedback=createRobotFeedback(scene,[robot]);}finally{delete globalThis.document;}
 const m=createMatch([{id,team:"blue",heavy:false,maxHp:200}],1,1),camera=new T.PerspectiveCamera(48,1,.025,100);camera.position.z=5;startMatch(m);m.elapsed=2;
 const original=plate.material;
 feedback.damage({target:{type:"robot",id},amount:20,at:2,source:"dart"});feedback.update(m,camera,720,"all");
 assert.equal(plate.material,original);assert.equal(feedback.group.children[1].visible,true);
 feedback.dispose();
});

test("same-tick structural destruction and rebuild stay visible beside damage and later low-priority hit notices",()=>{
 const scene=new T.Scene(),structure=new T.Group();structure.add(new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial()));scene.add(structure);scene.updateMatrixWorld(true);
 const texts=[];globalThis.document={createElement:()=>({getContext:()=>({clearRect(){},fillRect(){},strokeText(){},fillText(s){texts.push(s);}})})};
 let feedback;try{feedback=createRobotFeedback(scene,[],[{key:"blue-outpost",team:"blue",kind:"outpost",object:structure}]);}finally{delete globalThis.document;}
 const m=createMatch([],1,1);startMatch(m);m.elapsed=20;m.sides.blue.outpost=500;m.sides.blue.outpostOwner="red";
 const camera=new T.PerspectiveCamera(48,1,.025,100);camera.position.set(0,2,5);camera.lookAt(0,1,0);
 feedback.event({type:"outpost-destroyed",team:"blue",location:"blue",hp:0,at:20,visibility:"all"});
 feedback.event({type:"outpost-rebuilt",team:"red",location:"blue",hp:500,at:20,visibility:"all"});
 feedback.damage({target:{type:"outpost",team:"blue"},amount:20,at:20,source:"projectile"});
 feedback.event({type:"dart-hit",team:"red",location:"blue",mode:"outpost",damage:20,at:20,visibility:"all"});
 feedback.update(m,camera,720,"all");
 assert.ok(texts.includes("摧毁 · 重建 +500"));assert.ok(texts.includes("-20"));
 assert.equal(feedback.amountFor("blue-outpost",20),20);feedback.dispose();
});
