import * as THREE from "three";
import {DART_FLIGHT_SECONDS,type Match,type DartMode,type Team} from "./rmuc-3d-match.ts";
import {TEAMS,opposite,type installMechanisms} from "./rmuc-3d-mechanisms.ts";
import {softGlowTexture} from "./rmuc-3d-projectiles.ts";

// The endpoints are existing CAD occurrences. The arc is a training visual,
// not a second flight solver or a physical qualification of the referee hit.
export function dartVisualPosition(start:THREE.Vector3,target:THREE.Vector3,progress:number){
  const t=THREE.MathUtils.clamp(progress,0,1);
  return start.clone().lerp(target,t).add(new THREE.Vector3(0,3.2*4*t*(1-t),0));
}
export function createDartVisual(scene:THREE.Scene,mechanism:ReturnType<typeof installMechanisms>){
  const group=new THREE.Group();group.name="virtual-darts";scene.add(group);
  const bodyGeo=new THREE.CylinderGeometry(.055,.055,.32,10);
  const noseGeo=new THREE.ConeGeometry(.055,.14,10),finGeo=new THREE.ConeGeometry(.12,.13,4);
  const trailGeo=new THREE.CylinderGeometry(.5,.5,1,6);
  const bodyMaterial=new THREE.MeshStandardMaterial({color:0x78858b,roughness:.45,metalness:.55});
  const noseMaterials=TEAMS.map(team=>new THREE.MeshBasicMaterial({color:team==="red"?0xff5344:0x4f98ff,toneMapped:false}));
  const trailMaterials=[.85,.65,.45,.3,.18,.08].map(opacity=>new THREE.MeshBasicMaterial({color:0xffc66a,toneMapped:false,transparent:true,opacity,depthWrite:false}));
  const glowTexture=softGlowTexture(),glowMaterial=new THREE.SpriteMaterial({map:glowTexture,color:0xffce88,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const missMaterial=new THREE.SpriteMaterial({map:glowTexture,color:0x9caab1,transparent:true,opacity:.45,depthWrite:false,toneMapped:false});
  const up=new THREE.Vector3(0,1,0),delta=new THREE.Vector3();
  const anchor=(node:THREE.Object3D,selector?:(mesh:THREE.Mesh)=>boolean)=>{
    const box=new THREE.Box3();
    if(selector)node.traverse(o=>{if(o instanceof THREE.Mesh&&selector(o))box.union(new THREE.Box3().setFromObject(o,true));});
    if(box.isEmpty())box.setFromObject(node,true);
    return {node,local:node.worldToLocal(box.getCenter(new THREE.Vector3()))};
  };
  const slots=mechanism.dartBindings.map((b,i)=>{
    const model=new THREE.Group();model.name=b.team+"-dart-model";
    const body=new THREE.Mesh(bodyGeo,bodyMaterial),nose=new THREE.Mesh(noseGeo,noseMaterials[i]),fin=new THREE.Mesh(finGeo,noseMaterials[i]);
    nose.position.y=.23;fin.position.y=-.16;model.add(body,nose,fin);group.add(model);
    const exhaust=new THREE.Sprite(glowMaterial),flash=new THREE.Sprite(glowMaterial);
    exhaust.scale.setScalar(.38);group.add(exhaust,flash);
    const trail=trailMaterials.map(m=>new THREE.Mesh(trailGeo,m));group.add(...trail);
    const guideBox=new THREE.Box3().setFromObject(b.guides,true);
    const start=guideBox.getCenter(new THREE.Vector3());start.y=guideBox.max.y+.08;
    const carriage=anchor(b.carriage,mesh=>mesh.material instanceof THREE.MeshStandardMaterial&&mesh.material.color.g>.8&&mesh.material.color.r<.1);
    const outpost=anchor(mechanism.parts.getObjectByName(b.team+"-outpost-fixed-upper")!,mesh=>mesh.userData.outpostIndicator===true);
    return {team:b.team,start,carriage,outpost,model,exhaust,flash,trail,history:[] as THREE.Vector3[],at:null as number|null,mode:"outpost" as DartMode,hits:0,feedbackUntil:0,point:new THREE.Vector3()};
  });
  function hide(slot:typeof slots[number]){
    slot.model.visible=false;slot.exhaust.visible=false;slot.flash.visible=false;for(const mesh of slot.trail)mesh.visible=false;
  }
  function clear(){for(const slot of slots){hide(slot);slot.at=null;slot.history.length=0;slot.feedbackUntil=0;}}
  clear();
  function update(match:Match){
    if(match.phase!=="running"){clear();return;}
    for(const slot of slots){
      const dart=match.sides[slot.team].dart,flight=dart.flight,enemy=slots.find(s=>s.team===opposite(slot.team));
      if(!enemy)continue;
      if(flight){
        if(slot.at!==flight.at){slot.at=flight.at;slot.mode=flight.mode;slot.hits=dart.hits;slot.history.length=0;slot.history.push(slot.start.clone());slot.feedbackUntil=0;}
        const targetAnchor=flight.mode==="outpost"?enemy.outpost:enemy.carriage;
        const target=targetAnchor.node.localToWorld(targetAnchor.local.clone());
        if(!flight.hit)target.x+=slot.team==="red"?-.65:.65;
        const progress=1-(flight.at-match.elapsed)/DART_FLIGHT_SECONDS;
        const point=dartVisualPosition(slot.start,target,progress),last=slot.history.at(-1)!;
        delta.copy(point).sub(last);
        if(delta.lengthSq()>1e-8){slot.model.quaternion.setFromUnitVectors(up,delta.normalize());if(point.distanceTo(last)>.20){slot.history.push(point.clone());if(slot.history.length>12)slot.history.shift();}}
        slot.model.position.copy(point);slot.point.copy(point);slot.model.visible=true;slot.flash.visible=false;
        slot.exhaust.position.copy(point).addScaledVector(up.clone().applyQuaternion(slot.model.quaternion),-.25);slot.exhaust.visible=true;
        // History contains only actual prior visual positions, sampled by
        // distance rather than display refresh rate.
        let b=point,remaining=4.5;
        for(const [i,mesh] of slot.trail.entries()){
          const a=slot.history[slot.history.length-1-i];if(!a||remaining<=0){mesh.visible=false;continue;}
          delta.copy(b).sub(a);const distance=delta.length(),length=Math.min(remaining,distance);
          if(length<.001){mesh.visible=false;b=a;continue;}
          delta.divideScalar(distance);mesh.visible=true;mesh.position.copy(b).addScaledVector(delta,-length/2);mesh.quaternion.setFromUnitVectors(up,delta);mesh.scale.set(.12-i*.013,length,.12-i*.013);remaining-=length;b=a;
        }
      }else{
        if(slot.at!==null){
          const hit=dart.hits>slot.hits;const targetAnchor=slot.mode==="outpost"?enemy.outpost:enemy.carriage;
          slot.flash.position.copy(hit?targetAnchor.node.localToWorld(targetAnchor.local.clone()):slot.point);
          slot.flash.material=hit?glowMaterial:missMaterial;slot.feedbackUntil=match.elapsed+(hit?.24:.15);slot.at=null;slot.history.length=0;
        }
        slot.model.visible=false;slot.exhaust.visible=false;for(const mesh of slot.trail)mesh.visible=false;
        const remaining=slot.feedbackUntil-match.elapsed;slot.flash.visible=remaining>0;
        if(remaining>0)slot.flash.scale.setScalar(.25+remaining*2.5);
      }
    }
  }
  function dispose(){
    clear();group.removeFromParent();for(const g of [bodyGeo,noseGeo,finGeo,trailGeo])g.dispose();
    for(const m of [bodyMaterial,...noseMaterials,...trailMaterials,glowMaterial,missMaterial])m.dispose();glowTexture.dispose();
  }
  function soundPosition(team:Team,mode?:DartMode){
    const slot=slots.find(s=>s.team===team);if(!slot)return undefined;
    if(!mode)return slot.start;
    const anchor=mode==='outpost'?slot.outpost:slot.carriage;
    return anchor.node.localToWorld(anchor.local.clone());
  }
  return {group,update,clear,dispose,soundPosition};
}
