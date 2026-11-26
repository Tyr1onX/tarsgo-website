import * as THREE from "three";
import {DART_FLIGHT_SECONDS,dartStatus,type Match,type DartMode,type Team} from "./rmuc-3d-match.ts";
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
  // Decorative winged icon, matching the existing offline pixel art study.
  // It is a game silhouette, not a physical or mechanical model.
  const bodyGeo=new THREE.BoxGeometry(.10,.48,.075),stripeGeo=new THREE.BoxGeometry(.105,.09,.08);
  const outline=new THREE.Shape();
  outline.moveTo(-.055,.13);outline.lineTo(-.21,-.10);outline.lineTo(-.21,-.19);outline.lineTo(0,-.13);
  outline.lineTo(.21,-.19);outline.lineTo(.21,-.10);outline.lineTo(.055,.13);outline.closePath();
  const wingGeo=new THREE.ShapeGeometry(outline);
  const trailGeo=new THREE.CylinderGeometry(.5,.5,1,6);
  const bodyMaterial=new THREE.MeshStandardMaterial({color:0xc0c8c5,roughness:.52,metalness:.25});
  const wingMaterial=new THREE.MeshStandardMaterial({color:0x66736f,roughness:.62,metalness:.15,side:THREE.DoubleSide});
  const noseMaterials=TEAMS.map(team=>new THREE.MeshBasicMaterial({color:team==="red"?0xff5344:0x4f98ff,toneMapped:false}));
  const trailMaterials=[.62,.43,.28,.17,.09,.04].map(opacity=>new THREE.MeshBasicMaterial({color:0xffc66a,toneMapped:false,transparent:true,opacity,depthWrite:false}));
  const glowTexture=softGlowTexture(),glowMaterial=new THREE.SpriteMaterial({map:glowTexture,color:0xffce88,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const missMaterial=new THREE.SpriteMaterial({map:glowTexture,color:0x9caab1,transparent:true,opacity:.45,depthWrite:false,toneMapped:false});
  // Abstract game station casing based on the existing CAD guide envelope;
  // no mechanical construction or second flight/collision model.
  const casingGeo=new THREE.BoxGeometry(1,1,1),casingMaterial=new THREE.MeshStandardMaterial({color:0x18201e,metalness:.65,roughness:.44});
  const trimMaterial=new THREE.MeshStandardMaterial({color:0xc8a45c,metalness:.65,roughness:.38});
  const idleMaterial=new THREE.MeshBasicMaterial({color:0x66716b,toneMapped:false}),readyMaterial=new THREE.MeshBasicMaterial({color:0xf1d794,toneMapped:false}),preparingMaterial=new THREE.MeshBasicMaterial({color:0xa18a5e,toneMapped:false}),spentMaterial=new THREE.MeshBasicMaterial({color:0x101512,toneMapped:false});
  const up=new THREE.Vector3(0,1,0),delta=new THREE.Vector3();
  const anchor=(node:THREE.Object3D,selector?:(mesh:THREE.Mesh)=>boolean)=>{
    const box=new THREE.Box3();
    if(selector)node.traverse(o=>{if(o instanceof THREE.Mesh&&selector(o))box.union(new THREE.Box3().setFromObject(o,true));});
    if(box.isEmpty())box.setFromObject(node,true);
    return {node,local:node.worldToLocal(box.getCenter(new THREE.Vector3()))};
  };
  const slots=mechanism.dartBindings.map((b,i)=>{
    const model=new THREE.Group();model.name=b.team+"-dart-model";
    const body=new THREE.Mesh(bodyGeo,bodyMaterial),stripe=new THREE.Mesh(stripeGeo,noseMaterials[i]),wings=new THREE.Mesh(wingGeo,wingMaterial);
    stripe.position.y=.17;model.add(body,stripe,wings);group.add(model);
    const exhaust=new THREE.Sprite(glowMaterial),flash=new THREE.Sprite(glowMaterial);
    exhaust.scale.setScalar(.21);group.add(exhaust,flash);
    const trail=trailMaterials.map(m=>new THREE.Mesh(trailGeo,m));group.add(...trail);
    const guideBox=new THREE.Box3().setFromObject(b.guides,true);
    const start=guideBox.getCenter(new THREE.Vector3());start.y=guideBox.max.y+.08;
    const size=guideBox.getSize(new THREE.Vector3());
    const station=new THREE.Group();station.name=b.team+"-dart-station-visual";station.position.copy(start);group.add(station);
    const w=Math.min(.84,Math.max(.32,size.x*.8)),d=Math.min(.84,Math.max(.32,size.z*.8));
    const panel=(material:THREE.Material,x:number,y:number,z:number,sx:number,sy:number,sz:number)=>{
      const mesh=new THREE.Mesh(casingGeo,material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);station.add(mesh);return mesh;
    };
    panel(casingMaterial,0,-.22,0,w,.28,d);
    panel(trimMaterial,0,-.075,0,w*.9,.035,d*.9);
    panel(casingMaterial,0,-.049,0,w*.83,.025,d*.78);
    panel(noseMaterials[i],0,-.17,0,w*1.015,.045,d*1.015);
    // Face the open arena, not the raised CAD door which obscures top lamps.
    const front=-Math.sign(start.x);
    const lamps=Array.from({length:4},(_,n)=>panel(idleMaterial,front*w*.52,-.12,(n-1.5)*d*.21,.025,.055,d*.13));
    const carriage=anchor(b.carriage,mesh=>mesh.material instanceof THREE.MeshStandardMaterial&&mesh.material.color.g>.8&&mesh.material.color.r<.1);
    const outpost=anchor(mechanism.parts.getObjectByName(b.team+"-outpost-fixed-upper")!,mesh=>mesh.userData.outpostIndicator===true);
    return {team:b.team,start,station,lamps,carriage,outpost,model,exhaust,flash,trail,history:[] as THREE.Vector3[],at:null as number|null,mode:"outpost" as DartMode,hits:0,feedbackUntil:0,point:new THREE.Vector3()};
  });
  function hide(slot:typeof slots[number]){
    slot.model.visible=false;slot.exhaust.visible=false;slot.flash.visible=false;for(const mesh of slot.trail)mesh.visible=false;
  }
  function clear(){for(const slot of slots){hide(slot);slot.at=null;slot.history.length=0;slot.feedbackUntil=0;for(const lamp of slot.lamps)lamp.visible=false;}}
  clear();
  function update(match:Match,perspective:"all"|Team="all",reducedMotion=false){
    if(match.phase!=="running")clear();
    for(const slot of slots){
      const status=dartStatus(match,slot.team);
      for(const [i,lamp] of slot.lamps.entries()){
        lamp.visible=perspective==="all"||perspective===slot.team;
        lamp.material=i>=status.remaining?spentMaterial:status.canFire&&i===0?readyMaterial:status.phase==="opening"?preparingMaterial:idleMaterial;
      }
    }
    if(match.phase!=="running")return;
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
        slot.exhaust.position.copy(point).addScaledVector(up.clone().applyQuaternion(slot.model.quaternion),-.25);slot.exhaust.visible=!reducedMotion;
        // History contains only actual prior visual positions, sampled by
        // distance rather than display refresh rate.
        let b=point,remaining=4.5;
        for(const [i,mesh] of slot.trail.entries()){
          const a=slot.history[slot.history.length-1-i];if(reducedMotion||!a||remaining<=0){mesh.visible=false;continue;}
          delta.copy(b).sub(a);const distance=delta.length(),length=Math.min(remaining,distance);
          if(length<.001){mesh.visible=false;b=a;continue;}
          delta.divideScalar(distance);mesh.visible=true;mesh.position.copy(b).addScaledVector(delta,-length/2);mesh.quaternion.setFromUnitVectors(up,delta);mesh.scale.set(.055-i*.007,length,.055-i*.007);remaining-=length;b=a;
        }
      }else{
        if(slot.at!==null){
          const hit=dart.hits>slot.hits;const targetAnchor=slot.mode==="outpost"?enemy.outpost:enemy.carriage;
          slot.flash.position.copy(hit?targetAnchor.node.localToWorld(targetAnchor.local.clone()):slot.point);
          slot.flash.material=hit?glowMaterial:missMaterial;slot.feedbackUntil=match.elapsed+(hit?.24:.15);slot.at=null;slot.history.length=0;
        }
        slot.model.visible=false;slot.exhaust.visible=false;for(const mesh of slot.trail)mesh.visible=false;
        const remaining=slot.feedbackUntil-match.elapsed;slot.flash.visible=remaining>0;
        if(remaining>0)slot.flash.scale.setScalar(reducedMotion?.38:.25+remaining*2.5);
      }
    }
  }
  function dispose(){
    clear();group.removeFromParent();for(const g of [bodyGeo,stripeGeo,wingGeo,trailGeo,casingGeo])g.dispose();
    for(const m of [bodyMaterial,wingMaterial,...noseMaterials,...trailMaterials,glowMaterial,missMaterial,casingMaterial,trimMaterial,idleMaterial,readyMaterial,preparingMaterial,spentMaterial])m.dispose();glowTexture.dispose();
  }
  function soundPosition(team:Team,mode?:DartMode){
    const slot=slots.find(s=>s.team===team);if(!slot)return undefined;
    if(!mode)return slot.start;
    const anchor=mode==='outpost'?slot.outpost:slot.carriage;
    return anchor.node.localToWorld(anchor.local.clone());
  }
  return {group,update,clear,dispose,soundPosition};
}
