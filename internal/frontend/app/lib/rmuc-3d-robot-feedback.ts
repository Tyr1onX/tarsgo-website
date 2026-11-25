import * as THREE from "three";
import {groundIdentity} from "./rmuc-3d-identity.ts";
import type {Match,DamageEvent,Team} from "./rmuc-3d-match.ts";

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
export function createRobotFeedback(scene:THREE.Scene,robots:THREE.Object3D[]){
  const group=new THREE.Group();group.name="robot-combat-feedback";scene.add(group);
  const white=new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffffff,emissiveIntensity:.85,roughness:.45});
  const tintMaterials=new Map<THREE.Material,THREE.MeshStandardMaterial>();
  const slots=new Map(robots.map(robot=>{
    const identity=groundIdentity(robot.name)!;
    const bounds=new THREE.Box3().setFromObject(robot,true);
    const body:THREE.Mesh[]=[];
    robot.traverse(o=>{if(o instanceof THREE.Mesh&&!o.userData.hitPlate&&o.material instanceof THREE.MeshStandardMaterial&&o.material.emissiveIntensity===1&&o.material.emissive.getHex()===0)body.push(o);});
    return [robot.name,{robot,identity,height:bounds.max.y-robot.getWorldPosition(new THREE.Vector3()).y+.16,body,
      label:label(group,256,96),damage:label(group,192,64),hp:NaN,at:0,burst:undefined as Burst|undefined,bodyUntil:0,
      flashes:new Map<THREE.Mesh,number>()}];
  }));
  const restore:[THREE.Mesh,THREE.Material|THREE.Material[]][]=[];
  const point=new THREE.Vector3(),view=new THREE.Vector3();
  function damage(event:DamageEvent){
    if(event.amount<=0||event.target.type!=="robot")return;
    const s=slots.get(event.target.id);if(!s)return;
    s.burst=mergeDamageBurst(s.burst,event.amount,event.at);s.bodyUntil=event.at+BODY_FLASH;
  }
  function amountFor(id:string,at:number){const burst=slots.get(id)?.burst;return burst&&at-burst.last<.65?burst.amount:0;}
  function contact(id:string,hit:THREE.Intersection,at:number){
    const s=slots.get(id),mesh=hit.object;
    // Merged LED strips/number overlays may alias a detector for scoring,
    // but do not establish an exact armor surface. Only flash the actual plate.
    if(s&&mesh instanceof THREE.Mesh&&mesh.userData.armorSurface&&mesh.userData.target?.id===id)s.flashes.set(mesh,at+ARMOR_FLASH);
  }
  function restoreMaterials(){for(const [mesh,material] of restore)mesh.material=material;restore.length=0;}
  function update(match:Match,camera:THREE.PerspectiveCamera,height:number,perspective:"all"|Team){
    restoreMaterials();camera.updateMatrixWorld();
    const pixels=height*camera.projectionMatrix.elements[5]/2,at=match.elapsed;
    for(const s of slots.values()){
      const state=match.robots.find(r=>r.id===s.identity.id)!;
      const visible=s.robot.visible&&(perspective==="all"||perspective===state.team);
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
      s.label.sprite.visible=visible&&depth>0&&depth<100;
      s.label.sprite.position.copy(point);s.label.sprite.scale.set(width,width*96/256,1);
      const burst=s.burst,age=burst?at-burst.last:Infinity;
      s.damage.sprite.visible=s.label.sprite.visible&&!!burst&&age<DAMAGE_LIFE&&match.phase==="running";
      if(s.damage.sprite.visible&&burst){
        draw(s.damage,String(burst.amount),c=>{c.textAlign="center";c.textBaseline="middle";c.font="bold 50px sans-serif";c.lineWidth=6;c.strokeStyle="#17191d";c.fillStyle="#ffd7aa";c.strokeText("-"+burst.amount,96,32);c.fillText("-"+burst.amount,96,32);});
        s.damage.sprite.position.copy(point);s.damage.sprite.position.y+=width*.35+age*.42;s.damage.sprite.scale.set(width*.95,width*.95/3,1);
        s.damage.sprite.material.opacity=Math.min(1,(DAMAGE_LIFE-age)/.26);
      }else if(age>=DAMAGE_LIFE)s.burst=undefined;
      // Death/power-off suppress all active material flashes. Keep team LEDs
      // intact and restore base materials immediately after the render.
      for(const [mesh,until] of s.flashes){
        if(off||until<=at||match.phase!=="running"){s.flashes.delete(mesh);continue;}
        if(visible){restore.push([mesh,mesh.material]);mesh.material=white;}
      }
      if(visible&&!off&&s.bodyUntil>at&&match.phase==="running")for(const mesh of s.body){
        const original=mesh.material as THREE.MeshStandardMaterial;
        let tint=tintMaterials.get(original);
        if(!tint){tint=original.clone();tint.emissive.setHex(0x6f1111);tint.emissiveIntensity=.35;tintMaterials.set(original,tint);}
        restore.push([mesh,original]);mesh.material=tint;
      }
    }
  }
  function clear(){restoreMaterials();for(const s of slots.values()){s.burst=undefined;s.bodyUntil=0;s.flashes.clear();s.hp=NaN;s.at=0;s.damage.sprite.visible=false;}}
  function dispose(){clear();group.removeFromParent();white.dispose();for(const m of tintMaterials.values())m.dispose();for(const s of slots.values())for(const l of [s.label,s.damage]){l.texture.dispose();l.sprite.material.dispose();}slots.clear();}
  return {group,damage,amountFor,contact,update,restoreMaterials,clear,dispose};
}
