import * as THREE from "three";
import {groundIdentity} from "./rmuc-3d-identity.ts";
import {eventMessage,visibleEvent} from "./rmuc-3d-events.ts";
import type {Match,DamageEvent,MatchEvent,Team} from "./rmuc-3d-match.ts";

const DAMAGE_LIFE=.8,MERGE_WINDOW=.2,ARMOR_FLASH=.1,BODY_FLASH=.15;
type Burst={amount:number;start:number;last:number};
type Label={sprite:THREE.Sprite;canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;texture:THREE.CanvasTexture;signature:string};
function label(parent:THREE.Group,w:number,h:number):Label{
  const canvas=document.createElement("canvas");canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext("2d")!;
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:true,depthWrite:false,toneMapped:false}));
  sprite.visible=false;parent.add(sprite);
  return {sprite,canvas,ctx,texture,signature:""};
}
function draw(l:Label,signature:string,paint:(ctx:CanvasRenderingContext2D)=>void){
  if(l.signature===signature)return;
  l.signature=signature;l.ctx.clearRect(0,0,l.canvas.width,l.canvas.height);paint(l.ctx);l.texture.needsUpdate=true;
}
export function mergeDamageBurst(old:Burst|undefined,amount:number,at:number):Burst{
  return old&&at-old.last<=MERGE_WINDOW&&at-old.start<DAMAGE_LIFE?{amount:old.amount+amount,start:old.start,last:at}:{amount,start:at,last:at};
}
// Render-only sprites and temporary material overrides. Never add meshes to
// the robot hierarchy or replace detector geometry/collision materials in simulation.
export function createRobotFeedback(scene:THREE.Scene,robots:THREE.Object3D[],structures:readonly {key:string;team:Team;kind:"base"|"outpost";object:THREE.Object3D}[]=[]){
  const group=new THREE.Group();group.name="robot-combat-feedback";scene.add(group);
  const flashMaterials=new Map<THREE.Material,THREE.MeshStandardMaterial>();
  const white=new THREE.Color(0xffffff);
  const slots=new Map(robots.map(robot=>{
    const identity=groundIdentity(robot.name)!;
    const bounds=new THREE.Box3().setFromObject(robot,true);
    const body:THREE.Mesh[]=[];
    robot.traverse(o=>{if(o instanceof THREE.Mesh&&!o.userData.hitPlate&&o.material instanceof THREE.MeshStandardMaterial&&o.material.emissiveIntensity===1&&o.material.emissive.getHex()===0)body.push(o);});
    return [robot.name,{robot,identity,height:bounds.max.y-robot.getWorldPosition(new THREE.Vector3()).y+.16,body,
      label:label(group,256,96),damage:label(group,192,64),hp:NaN,at:0,burst:undefined as Burst|undefined,bodyUntil:0,
      flashes:new Map<THREE.Mesh,number>()}];
  }));
  const structureSlots=new Map(structures.map(s=>{
    const bounds=new THREE.Box3().setFromObject(s.object,true);
    const anchor=bounds.getCenter(new THREE.Vector3());anchor.y=bounds.max.y+.22;
    return [s.key,{...s,anchor,label:label(group,256,96),damage:label(group,256,64),burst:undefined as Burst|undefined}];
  }));
  const localEvents=new Map<string,MatchEvent>();
  function event(e:MatchEvent){
    if(!eventMessage(e)?.local)return;
    const key="robot" in e?e.robot:"location" in e?(e.type.startsWith("outpost-")?e.location+"-outpost":e.type.startsWith("cover-")?e.location+"-base":null):null;
    if(key&&(slots.has(key)||structureSlots.has(key)))localEvents.set(key,e);
  }
  function localMessage(key:string,at:number,perspective:"all"|Team){
    const e=localEvents.get(key);if(!e)return null;
    if(at-e.at>=2){localEvents.delete(key);return null;}
    return visibleEvent(e,perspective)?eventMessage(e)?.local??null:null;
  }
  function localText(l:Label,text:string){
    draw(l,text,c=>{c.textAlign="center";c.textBaseline="middle";c.font="bold 24px sans-serif";c.fillStyle="rgba(10,16,24,.88)";c.fillRect(0,0,l.canvas.width,l.canvas.height);c.fillStyle="#eef6ff";c.fillText(text,l.canvas.width/2,l.canvas.height/2,l.canvas.width-8);});
  }
  const restore:[THREE.Mesh,THREE.Material|THREE.Material[]][]=[];
  const point=new THREE.Vector3(),view=new THREE.Vector3();
  function damage(event:DamageEvent){
    if(event.amount<=0)return;
    if(event.target.type!=="robot"){
      const s=structureSlots.get(event.target.team+"-"+event.target.type);if(s)s.burst=mergeDamageBurst(s.burst,event.amount,event.at);return;
    }
    const s=slots.get(event.target.id);if(!s)return;
    s.burst=mergeDamageBurst(s.burst,event.amount,event.at);s.bodyUntil=event.at+BODY_FLASH;
  }
  function amountFor(id:string,at:number){const burst=(slots.get(id)??structureSlots.get(id))?.burst;return burst&&at-burst.last<.65?burst.amount:0;}
  function contact(id:string,hit:THREE.Intersection,at:number){
    const s=slots.get(id),mesh=hit.object;
    // Merged LED strips/number overlays may alias a detector for scoring,
    // but do not establish an exact armor surface. Only flash the actual plate.
    if(s&&mesh instanceof THREE.Mesh&&mesh.userData.armorSurface&&mesh.userData.target?.id===id)s.flashes.set(mesh,at+ARMOR_FLASH);
  }
  function restoreMaterials(){for(const [mesh,material] of restore)mesh.material=material;restore.length=0;}
  function flash(mesh:THREE.Mesh){
    const original=mesh.material;if(!(original instanceof THREE.MeshStandardMaterial))return;
    let material=flashMaterials.get(original);
    if(!material){
      material=original.clone();
      if(mesh.userData.armorSurface){material.color.lerp(white,.65);material.emissive.copy(white);material.emissiveIntensity=.85;}
      else{material.emissive.setHex(0x6f1111);material.emissiveIntensity=.35;}
      flashMaterials.set(original,material);
    }
    restore.push([mesh,original]);mesh.material=material;
  }
  function update(match:Match,camera:THREE.PerspectiveCamera,height:number,perspective:"all"|Team){
    restoreMaterials();camera.updateMatrixWorld();
    const pixels=height*camera.projectionMatrix.elements[5]/2,at=match.elapsed;
    for(const s of slots.values()){
      const state=match.robots.find(r=>r.id===s.identity.id)!;
      const visible=s.robot.visible;
      const showIntel=visible&&(perspective==="all"||perspective===state.team);
      const alive=state.hp>0,off=!alive||state.powerLockUntil>at;
      const dt=Math.max(0,at-s.at);s.at=at;
      s.hp=!Number.isFinite(s.hp)||dt>.3||!alive||s.hp===0?state.hp:s.hp+(state.hp-s.hp)*Math.min(1,dt/.24);
      if(Math.abs(s.hp-state.hp)<.5)s.hp=state.hp;
      const fraction=Math.round(Math.max(0,Math.min(1,s.hp/state.maxHp))*100);
      const color=state.team==="red"?"#f05258":"#428dff";
      draw(s.label,fraction+":"+off,c=>{
        c.fillStyle="rgba(10,16,24,.86)";c.fillRect(28,8,200,78);
        c.font="bold 46px sans-serif";c.textAlign="center";c.textBaseline="middle";c.fillStyle=color;c.fillText(s.identity.number,128,34);
        c.fillStyle="#303b47";c.fillRect(40,62,176,13);c.fillStyle=off?"#697582":color;c.fillRect(40,62,176*fraction/100,13);
      });
      s.robot.getWorldPosition(point);point.y+=s.height;
      const depth=-view.copy(point).applyMatrix4(camera.matrixWorldInverse).z;
      const width=Math.min(2.5,Math.max(.38,52*Math.max(0,depth)/Math.max(1,pixels)));
      s.label.sprite.visible=showIntel&&depth>0&&depth<100;
      s.label.sprite.position.copy(point);s.label.sprite.scale.set(width,width*96/256,1);
      const burst=s.burst,age=burst?at-burst.last:Infinity;
      s.damage.sprite.visible=s.label.sprite.visible&&!!burst&&age<DAMAGE_LIFE&&match.phase==="running";
      if(s.damage.sprite.visible&&burst){
        draw(s.damage,String(burst.amount),c=>{c.textAlign="center";c.textBaseline="middle";c.font="bold 50px sans-serif";c.lineWidth=6;c.strokeStyle="#17191d";c.fillStyle="#ffd7aa";c.strokeText("-"+burst.amount,96,32);c.fillText("-"+burst.amount,96,32);});
        s.damage.sprite.position.copy(point);s.damage.sprite.position.y+=width*.35+age*.42;s.damage.sprite.scale.set(width*.95,width*.95/3,1);
        s.damage.sprite.material.opacity=Math.min(1,(DAMAGE_LIFE-age)/.26);
      }else{
        if(age>=DAMAGE_LIFE)s.burst=undefined;
        const message=localMessage(s.identity.id,at,perspective);
        if(s.label.sprite.visible&&message&&match.phase==="running"){
          localText(s.damage,message);s.damage.sprite.visible=true;s.damage.sprite.material.opacity=1;
          s.damage.sprite.position.copy(point);s.damage.sprite.position.y+=width*.42;s.damage.sprite.scale.set(width*1.35,width*.45,1);
        }
      }
      // Death/power-off suppress all active material flashes. Keep team LEDs
      // intact and restore base materials immediately after the render.
      for(const [mesh,until] of s.flashes){
        if(off||until<=at||match.phase!=="running"){s.flashes.delete(mesh);continue;}
        if(visible)flash(mesh);
      }
      if(visible&&!off&&s.bodyUntil>at&&match.phase==="running")for(const mesh of s.body)flash(mesh);
    }
    for(const s of structureSlots.values()){
      const state=match.sides[s.team],hp=state[s.kind],max=s.kind==="base"?10000:1000,owner=s.kind==="outpost"?state.outpostOwner:s.team;
      const depth=-view.copy(s.anchor).applyMatrix4(camera.matrixWorldInverse).z;
      const width=Math.min(3,Math.max(.65,85*Math.max(0,depth)/Math.max(1,pixels)));
      const visible=depth>0&&depth<100&&match.phase==="running";
      const color=owner==="red"?"#f05258":"#428dff";
      draw(s.label,hp+":"+owner,c=>{
        c.fillStyle="rgba(10,16,24,.86)";c.fillRect(8,4,240,88);
        c.fillStyle=color;c.font="bold 25px sans-serif";c.textAlign="center";c.textBaseline="middle";
        c.fillText((s.team==="red"?"红":"蓝")+(s.kind==="base"?"方基地":"方前哨")+" "+hp,128,31);
        c.fillStyle="#303b47";c.fillRect(20,62,216,13);c.fillStyle=color;c.fillRect(20,62,216*hp/max,13);
      });
      s.label.sprite.visible=visible;s.label.sprite.position.copy(s.anchor);s.label.sprite.scale.set(width,width*96/256,1);
      const burst=s.burst,age=burst?at-burst.last:Infinity;
      const message=burst&&age<DAMAGE_LIFE?"-"+burst.amount:localMessage(s.key,at,perspective);
      if(age>=DAMAGE_LIFE)s.burst=undefined;
      s.damage.sprite.visible=visible&&!!message;
      if(message&&visible){localText(s.damage,message);s.damage.sprite.material.opacity=1;s.damage.sprite.position.copy(s.anchor);s.damage.sprite.position.y+=width*.4;s.damage.sprite.scale.set(width,width/4,1);}
    }
  }
  function clear(){restoreMaterials();localEvents.clear();for(const s of structureSlots.values()){s.burst=undefined;s.damage.sprite.visible=false;s.label.sprite.visible=false;}for(const s of slots.values()){s.burst=undefined;s.bodyUntil=0;s.flashes.clear();s.hp=NaN;s.at=0;s.damage.sprite.visible=false;}}
  function dispose(){clear();group.removeFromParent();for(const m of flashMaterials.values())m.dispose();flashMaterials.clear();for(const s of [...slots.values(),...structureSlots.values()])for(const l of [s.label,s.damage]){l.texture.dispose();l.sprite.material.dispose();}slots.clear();structureSlots.clear();}
  return {group,damage,event,amountFor,contact,update,restoreMaterials,clear,dispose};
}
