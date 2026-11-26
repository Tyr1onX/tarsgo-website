import * as THREE from "three";
import {groundIdentity} from "./rmuc-3d-identity.ts";
import {robotLevel,revivalStatus,robotDefense,terrainStatus,type Match,type DamageEvent,type MatchEvent,type Team} from "./rmuc-3d-match.ts";

import {createIonShieldMaterial} from "./rmuc-3d-lighting.ts";
const DAMAGE_LIFE=.85,MERGE_WINDOW=.2,ARMOR_FLASH=.1,BODY_FLASH=.15;
type ShieldTrace=(from:THREE.Vector3,direction:THREE.Vector3,distance:number)=>THREE.Intersection|undefined;
// The original sphere intersected CAD walls. Clip its render-only surface
// to nearby actual wall faces (bounded local planar approximation).
const SHIELD_RAYS=Array.from({length:8},(_,i)=>new THREE.Vector3(Math.cos(i*Math.PI/4),0,Math.sin(i*Math.PI/4)));
export function shieldClipPlanes(planes:THREE.Vector4[],center:THREE.Vector3,radius:number,height:number,floor:number,trace?:ShieldTrace){
  let count=1;
  planes[0].set(0,1,0,-floor-.012);
  if(!trace)return count;
  const from=new THREE.Vector3(),normal=new THREE.Vector3(),matrix=new THREE.Matrix3();
  for(const y of [-.42,.28]){
    from.copy(center);from.y+=height*y;
    for(const direction of SHIELD_RAYS){
      const hit=trace(from,direction,radius*Math.sqrt(1-y*y));
      if(!hit?.face)continue;
      normal.copy(hit.face.normal).applyMatrix3(matrix.getNormalMatrix(hit.object.matrixWorld)).normalize();
      if(Math.abs(normal.y)>.65)continue;
      const constant=-normal.dot(hit.point);
      const side=normal.dot(center)+constant;
      if(Math.abs(side)<.015)continue;
      if(side<0)normal.negate();
      const d=-normal.dot(hit.point)-.006;
      if(planes.slice(1,count).some(p=>p.x*normal.x+p.y*normal.y+p.z*normal.z>.985&&Math.abs(p.w-d)<.045))continue;
      planes[count++].set(normal.x,normal.y,normal.z,d);
      if(count===planes.length)return count;
    }
  }
  return count;
}
type Burst={amount:number;start:number;last:number};
export function mergeDamageBurst(old:Burst|undefined,amount:number,at:number):Burst{
  return old&&at-old.last<=MERGE_WINDOW&&at-old.start<DAMAGE_LIFE?{amount:old.amount+amount,start:old.start,last:at}:{amount,start:at,last:at};
}
// Render-only effects stay outside the robot collision hierarchy.
export function createRobotFeedback(scene:THREE.Scene,robots:THREE.Object3D[]){
  const effects=new THREE.Group();effects.name="robot-state-effects";scene.add(effects);
  const shieldGeometry=new THREE.SphereGeometry(1,32,20),shieldMaterial=createIonShieldMaterial();
  const shadowGeometry=new THREE.PlaneGeometry(2,2);
  const shadowMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;void main(){float r=length(vUv*2.-1.);float a=1.-smoothstep(.15,1.,r);float core=1.-smoothstep(0.,.45,r);gl_FragColor=vec4(0.,0.,0.,a*.36+core*.18);}`});
  const accentGeometry=new THREE.RingGeometry(.87,1,40,1),segmentGeometry=new THREE.RingGeometry(.82,1,32,1,0,Math.PI*1.48);
  const accentMaterials=Object.fromEntries(Object.entries({weak:0xd9a764,off:0x8c9791,heat:0xf1a67f,locked:0xd27762,defense:0xe6e9df,terrain:0xc9ae78,assembly:0xf1d794,ammo:0xb4b9bd,upgrade:0xffca53,recovery:0x65ed9a,revival:0x65bdff,attack:0xf1d794,move:0x9daea3}).map(([key,color])=>[key,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.82,depthTest:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false})]));
  const pulseMaterial=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{tint:{value:new THREE.Color()},alpha:{value:0}},
    vertexShader:`void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform vec3 tint;uniform float alpha;void main(){gl_FragColor=vec4(tint,alpha);
      #include <colorspace_fragment>
    }`});
  const crossShape=new THREE.Shape();
  const corners=[[-.3,1],[.3,1],[.3,.3],[1,.3],[1,-.3],[.3,-.3],[.3,-1],[-.3,-1],[-.3,-.3],[-1,-.3],[-1,.3],[-.3,.3]];
  crossShape.moveTo(corners[0][0],corners[0][1]);for(const [x,y] of corners.slice(1))crossShape.lineTo(x,y);crossShape.closePath();
  const crossGeometry=new THREE.ShapeGeometry(crossShape),recoveryTint=new THREE.Color(0x65ed9a);
  const flashMaterials=new Map<THREE.Material,THREE.MeshStandardMaterial>();
  const white=new THREE.Color(0xffffff);
  const slots=new Map(robots.map(robot=>{
    const identity=groundIdentity(robot.name)!;
    const bounds=new THREE.Box3().setFromObject(robot,true);
    const origin=robot.getWorldPosition(new THREE.Vector3()),size=bounds.isEmpty()?new THREE.Vector3(.6,.6,.6):bounds.getSize(new THREE.Vector3());
    const center=bounds.isEmpty()?origin.clone():bounds.getCenter(new THREE.Vector3());
    const shell=new THREE.Mesh(shieldGeometry,shieldMaterial);shell.visible=false;shell.name="ion-shield";
    const shadow=new THREE.Mesh(shadowGeometry,shadowMaterial);shadow.rotation.x=-Math.PI/2;shadow.visible=false;shadow.scale.set(Math.max(.32,size.x*.63),Math.max(.32,size.z*.63),1);
    const accent=new THREE.Mesh(accentGeometry,accentMaterials.weak),pulse=new THREE.Mesh(accentGeometry,pulseMaterial);
    accent.name="state-accent";pulse.name="state-pulse";accent.rotation.x=pulse.rotation.x=-Math.PI/2;accent.visible=pulse.visible=false;
    effects.add(shadow,shell,accent,pulse);
    const crosses=Array.from({length:3},()=>{const mesh=new THREE.Mesh(crossGeometry,pulseMaterial);mesh.name="recovery-cross";mesh.visible=false;
      mesh.onBeforeRender=()=>{pulseMaterial.uniforms.tint.value.copy(recoveryTint);pulseMaterial.uniforms.alpha.value=mesh.userData.alpha??0;pulseMaterial.uniformsNeedUpdate=true;};effects.add(mesh);return mesh;});
    const stateVisual={accent,pulse,crosses,pulseAt:-10,pulseKey:"recovery",pulsePriority:0,recoveryAt:-10,pulseVisibility:"all" as "all"|Team,radius:Math.max(.28,Math.hypot(size.x,size.z)*.38),height:Math.max(.25,size.y),powerOff:false};
    pulse.onBeforeRender=()=>{pulseMaterial.uniforms.tint.value.copy(accentMaterials[stateVisual.pulseKey].color);pulseMaterial.uniforms.alpha.value=pulse.userData.alpha??0;pulseMaterial.uniformsNeedUpdate=true;};
    const protection={shell,shadow,centerY:center.y-origin.y,radius:Math.max(.4,Math.hypot(size.x,size.z)*.62),height:Math.max(.36,size.y*.68),strength:0,activeAt:-10,endedAt:-10,immune:false,hitAt:-10,hitDirection:new THREE.Vector3(0,1,0),time:0,clipPlanes:Array.from({length:5},()=>new THREE.Vector4()),clipCount:0,clipAt:-10,clipCenter:new THREE.Vector3(Infinity,Infinity,Infinity),clipRadius:0};
    shell.onBeforeRender=()=>{const u=shieldMaterial.uniforms;u.strength.value=protection.strength;u.time.value=protection.time;u.rippleAge.value=protection.time===0?2:Math.max(0,protection.time-protection.hitAt);u.rippleDirection.value.copy(protection.hitDirection);u.clipCount.value=protection.clipCount;u.clipPlanes.value=protection.clipPlanes;shieldMaterial.uniformsNeedUpdate=true;};
    const body:THREE.Mesh[]=[];
    robot.traverse(o=>{if(o instanceof THREE.Mesh&&!o.userData.hitPlate&&o.material instanceof THREE.MeshStandardMaterial&&o.material.emissiveIntensity===1&&o.material.emissive.getHex()===0)body.push(o);});
    return [robot.name,{robot,identity,body,protection,stateVisual,level:0,bodyUntil:0,
      flashes:new Map<THREE.Mesh,number>()}];
  }));
  // Bounded by match entity identities; used by the existing screen HUD.
  const bursts=new Map<string,Burst>();
  function pulseFor(v:NonNullable<ReturnType<typeof slots.get>>["stateVisual"],key:string,at:number,priority:number,visibility:"all"|Team){
    if(at-v.pulseAt<.7&&v.pulsePriority>=priority)return;
    v.pulseAt=at;v.pulseKey=key;v.pulsePriority=priority;v.pulseVisibility=visibility;
  }
  function event(e:MatchEvent){
    if("robot" in e){
      const v=slots.get(e.robot)?.stateVisual;
      if(v){
        if(e.type==="robot-revived")pulseFor(v,"revival",e.at,4,e.visibility);
        else if(e.type==="heal"&&e.status==="completed"&&(e.amount??0)>0){if(e.at-v.recoveryAt>.7)pulseFor(v,"recovery",e.at,1,e.visibility);v.recoveryAt=e.at;}
        else if(e.type==="ammo"&&e.status==="completed"&&(e.amount??0)>0)pulseFor(v,"ammo",e.at,1,e.visibility);
        else if(e.type==="energy-picked"||e.type==="energy-spent"||e.type==="energy-dropped"||e.type==="assembly-start"||e.type==="assembly-step-complete"||e.type==="assembly-end")pulseFor(v,"assembly",e.at,2,e.visibility);
        else if(e.type==="robot-dead"){v.pulseAt=v.recoveryAt=-10;v.pulsePriority=0;}
      }
    }
  }
  const restore:[THREE.Mesh,THREE.Material|THREE.Material[]][]=[];
  const point=new THREE.Vector3();
  const shieldBounds=new THREE.Box3(),shieldSize=new THREE.Vector3(),shieldCenter=new THREE.Vector3();
  function shieldContact(id:string,hit:THREE.Vector3,at:number){
    const s=slots.get(id);if(!s)return;
    const p=s.protection;
    s.robot.getWorldPosition(point);point.y+=p.centerY;
    p.hitDirection.copy(hit).sub(point);p.hitDirection.set(p.hitDirection.x/p.radius,p.hitDirection.y/p.height,p.hitDirection.z/p.radius).normalize();p.hitAt=at;
  }
  function damage(event:DamageEvent){
    if(event.amount<=0)return;
    const key=event.target.type==="robot"?event.target.id:event.target.team+"-"+event.target.type;
    bursts.set(key,mergeDamageBurst(bursts.get(key),event.amount,event.at));
    const slot=slots.get(key);if(slot)slot.bodyUntil=event.at+BODY_FLASH;
  }
  function amountFor(id:string,at:number){const burst=bursts.get(id);return burst&&at-burst.last<.65?burst.amount:0;}
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
  function update(match:Match,camera:THREE.PerspectiveCamera,perspective:"all"|Team,reducedMotion=false,options:{firstPerson?:boolean;shieldTrace?:ShieldTrace}={}){
    restoreMaterials();
    const at=match.elapsed;
    for(const s of slots.values()){
      const state=match.robots.find(r=>r.id===s.identity.id)!;
      const visible=s.robot.visible;
      const showIntel=visible&&(perspective==="all"||perspective===state.team);
      const alive=state.hp>0,off=!alive||state.powerLockUntil>at;
      const level=robotLevel(state,match),status=revivalStatus(match,state);
      if(s.level&&level>s.level)pulseFor(s.stateVisual,"upgrade",at,3,state.team);s.level=level;
      const protection=s.protection;
      s.robot.getWorldPosition(point);
      protection.shadow.position.copy(point);protection.shadow.position.y+=.016;protection.shadow.visible=visible&&(!options.firstPerson||camera.position.distanceToSquared(point)>1.2);
      if(protection.immune!==status.immune){protection.immune=status.immune;if(status.immune)protection.activeAt=at;else protection.endedAt=at;}
      protection.time=reducedMotion?0:at;
      protection.strength=status.immune?(reducedMotion?1:Math.max(.15,Math.min(1,(at-protection.activeAt)/.22))):reducedMotion?0:Math.max(0,1-(at-protection.endedAt)/.24);
      protection.shell.visible=showIntel&&alive&&match.phase==="running"&&protection.strength>0;
      if(protection.shell.visible&&status.immune){
        // Use cached mesh bounds, including a mounted/rotated launcher. No
        // extra collision object or precise per-vertex bounds pass.
        shieldBounds.setFromObject(s.robot);
        if(!shieldBounds.isEmpty()){
          shieldBounds.getSize(shieldSize);shieldBounds.getCenter(shieldCenter);
          protection.radius=Math.max(.4,Math.hypot(shieldSize.x,shieldSize.z)*.66);
          protection.centerY=shieldCenter.y-point.y;protection.height=Math.max(.36,shieldSize.y*.72);
        }
      }
      protection.shell.position.copy(point);protection.shell.position.y+=protection.centerY;
      protection.shell.scale.set(protection.radius,protection.height,protection.radius);
      if(protection.shell.visible&&(at-protection.clipAt>=.16||protection.clipCenter.distanceToSquared(protection.shell.position)>.0225||Math.abs(protection.clipRadius-protection.radius)>.08)){
        protection.clipCount=shieldClipPlanes(protection.clipPlanes,protection.shell.position,protection.radius,protection.height,point.y,options.shieldTrace);
        protection.clipAt=at;protection.clipCenter.copy(protection.shell.position);protection.clipRadius=protection.radius;
      }
      const v=s.stateVisual,locked=state.powerLockUntil>at;
      if(v.powerOff&&!locked&&alive)pulseFor(v,"recovery",at,2,state.team);
      v.powerOff=locked;
      // A single priority accent and one short event pulse per robot, outside
      // the robot hierarchy; no added lights or simulation state.
      const tech=match.sides[state.team].tech.attempt?.robot===state.id;
      const terrain=terrainStatus(match,state);
      const key=locked?"off":state.thermalLock==="permanent"?"locked":state.thermalLock==="cooling"?"heat":status.weak?"weak":tech?"assembly":state.launcher==="locked"?"locked":state.stance?.mode==="defense"?"defense":terrain.active.length||terrain.highpoint?"terrain":state.powerBoostUntil>at||at-v.recoveryAt<.22?"recovery":robotDefense(match,state,false)<1?"defense":state.stance?.mode==="attack"?"attack":state.stance?.mode==="move"?"move":null;
      v.accent.visible=!!key&&showIntel&&alive&&match.phase==="running";
      if(key&&v.accent.visible){
        v.accent.material=accentMaterials[key];v.accent.geometry=key==="weak"||key==="off"||key==="locked"||key==="heat"?segmentGeometry:accentGeometry;
        v.accent.position.copy(point);v.accent.position.y+=.035;
        if(key==="heat"||key==="locked"){
          const muzzle=s.robot.getObjectByName("weapon-muzzle");if(muzzle){muzzle.getWorldPosition(v.accent.position);muzzle.getWorldQuaternion(v.accent.quaternion);}else{v.accent.rotation.set(-Math.PI/2,0,0);v.accent.position.y+=v.height*.8;}
        }
        v.accent.scale.setScalar(v.radius*(key==="heat"||key==="locked"?.42:1));
        if(key!=="heat"&&key!=="locked")v.accent.rotation.set(-Math.PI/2,0,reducedMotion?0:key==="move"?at*1.2:0);
      }
      const pulseAge=at-v.pulseAt;
      v.pulse.visible=showIntel&&alive&&!reducedMotion&&match.phase==="running"&&pulseAge>=0&&pulseAge<.7&&(perspective==="all"||v.pulseVisibility==="all"||perspective===v.pulseVisibility);
      if(v.pulse.visible){
        const progress=pulseAge/.7;v.pulse.userData.alpha=.72*Math.min(1,progress*8,1-progress);
        const ammo=v.pulseKey==="ammo";v.pulse.geometry=ammo?segmentGeometry:accentGeometry;
        v.pulse.position.copy(point);v.pulse.position.y+=.06+v.height*(ammo?.25:progress);
        v.pulse.rotation.set(-Math.PI/2,0,ammo?progress*Math.PI*2:0);
        v.pulse.scale.setScalar(v.radius*(ammo?.75:1.03+progress*.16));
      }
      // Continuous effective heals extend the same bounded visual window.
      const recoveryAge=at-v.recoveryAt;
      const recoveryVisible=showIntel&&alive&&!reducedMotion&&match.phase==="running"&&recoveryAge>=0&&recoveryAge<1.3;
      for(let i=0;i<v.crosses.length;i++){
        const mesh=v.crosses[i];mesh.visible=recoveryVisible;if(!mesh.visible)continue;
        const phase=(at*.72+i/v.crosses.length)%1,angle=at*.9+i*Math.PI*2/v.crosses.length;
        mesh.position.set(point.x+Math.cos(angle)*v.radius*1.14,point.y+v.height*(.25+phase*.8),point.z+Math.sin(angle)*v.radius*1.14);
        mesh.quaternion.copy(camera.quaternion);mesh.scale.setScalar(Math.max(.045,v.radius*.16));
        mesh.userData.alpha=.8*Math.min(1,phase*7,(1-phase)*5,(1.3-recoveryAge)*3);
      }
      // Death/power-off suppress all active material flashes. Keep team LEDs
      // intact and restore base materials immediately after the render.
      for(const [mesh,until] of s.flashes){
        if(off||until<=at||match.phase!=="running"){s.flashes.delete(mesh);continue;}
        if(visible&&!reducedMotion)flash(mesh);
      }
      if(visible&&!reducedMotion&&!off&&s.bodyUntil>at&&match.phase==="running")for(const mesh of s.body)flash(mesh);
    }
  }

  function clear(){
    restoreMaterials();bursts.clear();
    for(const s of slots.values()){
      s.bodyUntil=0;s.flashes.clear();s.level=0;
      s.protection.immune=false;s.protection.activeAt=s.protection.endedAt=s.protection.hitAt=-10;
      s.protection.shell.visible=false;s.protection.clipAt=-10;s.protection.clipCenter.set(Infinity,Infinity,Infinity);
      s.protection.clipCount=0;s.protection.shadow.visible=false;
      s.stateVisual.accent.visible=false;s.stateVisual.pulse.visible=false;s.stateVisual.powerOff=false;for(const mesh of s.stateVisual.crosses)mesh.visible=false;
      s.stateVisual.pulseAt=-10;s.stateVisual.pulsePriority=0;s.stateVisual.recoveryAt=-10;
    }
  }
  function dispose(){clear();effects.removeFromParent();shieldGeometry.dispose();shieldMaterial.dispose();shadowGeometry.dispose();shadowMaterial.dispose();accentGeometry.dispose();segmentGeometry.dispose();crossGeometry.dispose();pulseMaterial.dispose();for(const m of Object.values(accentMaterials))m.dispose();for(const m of flashMaterials.values())m.dispose();flashMaterials.clear();slots.clear();}
  return {damage,event,amountFor,contact,shieldContact,update,restoreMaterials,clear,dispose};
}
