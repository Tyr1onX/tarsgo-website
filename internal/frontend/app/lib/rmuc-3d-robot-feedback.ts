import * as THREE from "three";
import {ARENA_VISUAL} from "./rmuc-3d-visual.ts";
import {GROUND_NAMES,groundIdentity} from "./rmuc-3d-identity.ts";
import {eventMessage,visibleEvent} from "./rmuc-3d-events.ts";
import {robotLevel,revivalStatus,robotDefense,terrainStatus,type Match,type DamageEvent,type MatchEvent,type Team} from "./rmuc-3d-match.ts";

import {createIonShieldMaterial} from "./rmuc-3d-lighting.ts";
const DAMAGE_LIFE=.85,MERGE_WINDOW=.2,ARMOR_FLASH=.1,BODY_FLASH=.15;
export type MarkerRect={x:number;y:number;w:number;h:number};
type Placement={rect:MarkerRect;dx:number;dy:number;scale:number};
export function placeArenaMarker(rect:MarkerRect,occupied:readonly MarkerRect[],viewport:{width:number;height:number},previous?:Placement,compact=true):Placement|null{
  const offsets=[[0,0],[0,-.38],[-.32,0],[.32,0],[0,.3]];
  const fits=(r:MarkerRect,gap:number)=>r.x-r.w/2>=0&&r.x+r.w/2<=viewport.width&&r.y-r.h/2>=0&&r.y+r.h/2<=viewport.height&&!occupied.some(o=>Math.abs(o.x-r.x)<(o.w+r.w)/2+gap&&Math.abs(o.y-r.y)<(o.h+r.h)/2+gap);
  // Keep an already usable position until it is actually blocked. Compact
  // markers expand only when the full-size anchor has enough spare room.
  if(previous){
    const dx=THREE.MathUtils.clamp(previous.dx,-rect.w*.32,rect.w*.32),dy=THREE.MathUtils.clamp(previous.dy,-rect.h*.38,rect.h*.3);
    const r={x:rect.x+dx,y:rect.y+dy,w:rect.w*previous.scale,h:rect.h*previous.scale};
    if(previous.scale<1&&fits(rect,8))return {rect,dx:0,dy:0,scale:1};
    if(fits(r,2))return {...previous,dx,dy,rect:r};
  }
  for(const scale of compact?[1,.72]:[1])for(const [x,y] of offsets){
    const dx=x*rect.w,dy=y*rect.h,r={x:rect.x+dx,y:rect.y+dy,w:rect.w*scale,h:rect.h*scale};
    if(fits(r,4))return {rect:r,dx,dy,scale};
  }
  return null;
}
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
type Label={sprite:THREE.Sprite;canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;texture:THREE.CanvasTexture;signature:string};
function label(parent:THREE.Group,w:number,h:number,scale=1):Label{
  const canvas=document.createElement("canvas");canvas.width=w*scale;canvas.height=h*scale;
  const ctx=canvas.getContext("2d")!;ctx.scale(scale,scale);
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
export function createRobotFeedback(scene:THREE.Scene,robots:THREE.Object3D[],structures:readonly {key:string;team:Team;kind:"base"|"outpost"|"rune"|"dart";object:THREE.Object3D}[]=[]){
  const group=new THREE.Group();group.name="robot-combat-feedback";scene.add(group);
  const effects=new THREE.Group();effects.name="robot-state-effects";scene.add(effects);
  const shieldGeometry=new THREE.SphereGeometry(1,32,20),shieldMaterial=createIonShieldMaterial();
  const shadowGeometry=new THREE.PlaneGeometry(2,2);
  const shadowMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 vUv;void main(){float r=length(vUv*2.-1.);float a=1.-smoothstep(.15,1.,r);float core=1.-smoothstep(0.,.45,r);gl_FragColor=vec4(0.,0.,0.,a*.36+core*.18);}`});
  const accentGeometry=new THREE.RingGeometry(.87,1,40,1),segmentGeometry=new THREE.RingGeometry(.82,1,32,1,0,Math.PI*1.48);
  const accentMaterials=Object.fromEntries(Object.entries({weak:0xd9a764,off:0x8c9791,heat:0xf1a67f,locked:0xd27762,defense:0xe6e9df,terrain:0xc9ae78,assembly:0xf1d794,recovery:0x85d6b4,revival:0x65bdff,attack:0xf1d794,move:0x9daea3}).map(([key,color])=>[key,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.82,depthTest:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false})]));
  const pulseMaterial=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{tint:{value:new THREE.Color()},alpha:{value:0}},
    vertexShader:`void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform vec3 tint;uniform float alpha;void main(){gl_FragColor=vec4(tint,alpha);
      #include <colorspace_fragment>
    }`});
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
    const stateVisual={accent,pulse,pulseAt:-10,pulseKey:"recovery",pulsePriority:0,recoveryAt:-10,pulseVisibility:"all" as "all"|Team,radius:Math.max(.28,Math.hypot(size.x,size.z)*.38),height:Math.max(.25,size.y),powerOff:false};
    pulse.onBeforeRender=()=>{pulseMaterial.uniforms.tint.value.copy(accentMaterials[stateVisual.pulseKey].color);pulseMaterial.uniforms.alpha.value=pulse.userData.alpha??0;pulseMaterial.uniformsNeedUpdate=true;};
    const protection={shell,shadow,centerY:center.y-origin.y,radius:Math.max(.4,Math.hypot(size.x,size.z)*.62),height:Math.max(.36,size.y*.68),strength:0,activeAt:-10,endedAt:-10,immune:false,hitAt:-10,hitDirection:new THREE.Vector3(0,1,0),time:0,clipPlanes:Array.from({length:5},()=>new THREE.Vector4()),clipCount:0,clipAt:-10,clipCenter:new THREE.Vector3(Infinity,Infinity,Infinity),clipRadius:0};
    shell.onBeforeRender=()=>{const u=shieldMaterial.uniforms;u.strength.value=protection.strength;u.time.value=protection.time;u.rippleAge.value=protection.time===0?2:Math.max(0,protection.time-protection.hitAt);u.rippleDirection.value.copy(protection.hitDirection);u.clipCount.value=protection.clipCount;u.clipPlanes.value=protection.clipPlanes;shieldMaterial.uniformsNeedUpdate=true;};
    const body:THREE.Mesh[]=[];
    robot.traverse(o=>{if(o instanceof THREE.Mesh&&!o.userData.hitPlate&&o.material instanceof THREE.MeshStandardMaterial&&o.material.emissiveIntensity===1&&o.material.emissive.getHex()===0)body.push(o);});
    return [robot.name,{robot,identity,height:(bounds.isEmpty()?.6:bounds.max.y-origin.y)+.14,body,protection,stateVisual,level:0,levelAt:-10,
      label:label(group,256,96,1.25),damage:label(group,192,64),hp:NaN,at:0,burst:undefined as Burst|undefined,bodyUntil:0,
      flashes:new Map<THREE.Mesh,number>()}];
  }));
  const structureSlots=new Map(structures.map(s=>{
    const bounds=new THREE.Box3().setFromObject(s.object,true);
    const anchor=bounds.getCenter(new THREE.Vector3());anchor.y=bounds.max.y+.22;
    return [s.key,{...s,anchor,label:s.kind==="base"||s.kind==="outpost"?label(group,256,96,1.25):null,damage:label(group,256,64),burst:undefined as Burst|undefined}];
  }));
  const localEvents=new Map<string,{event:MatchEvent;text:string;priority:number}>();
  function pulseFor(v:NonNullable<ReturnType<typeof slots.get>>["stateVisual"],key:string,at:number,priority:number,visibility:"all"|Team){
    if(at-v.pulseAt<.7&&v.pulsePriority>=priority)return;
    v.pulseAt=at;v.pulseKey=key;v.pulsePriority=priority;v.pulseVisibility=visibility;
  }
  function event(e:MatchEvent){
    if("robot" in e){
      const v=slots.get(e.robot)?.stateVisual;
      if(v){
        if(e.type==="robot-revived")pulseFor(v,"revival",e.at,4,e.visibility);
        else if(e.type==="heal"&&e.status==="completed"){if(e.at-v.recoveryAt>.7)pulseFor(v,"recovery",e.at,1,e.visibility);v.recoveryAt=e.at;}
        else if(e.type==="ammo"&&e.status==="completed")pulseFor(v,"assembly",e.at,1,e.visibility);
        else if(e.type==="energy-picked"||e.type==="energy-spent"||e.type==="energy-dropped"||e.type==="assembly-start"||e.type==="assembly-step-complete"||e.type==="assembly-end")pulseFor(v,"assembly",e.at,2,e.visibility);
        else if(e.type==="robot-dead"){v.pulseAt=-10;v.pulsePriority=0;}
      }
    }
    const text=eventMessage(e)?.local;if(!text)return;
    const key="robot" in e?e.robot:e.type==="dart-hit"?e.location+"-"+(e.mode==="outpost"?"outpost":"base"):e.type==="dart-launch"||e.type==="dart-miss"?e.team+"-dart":e.type==="rune-start"||e.type==="rune-success"||e.type==="rune-failed"?e.team+"-rune":e.type==="outpost-destroyed"||e.type==="outpost-rebuilt"?e.location+"-outpost":e.type==="cover-opening"||e.type==="cover-open"?e.location+"-base":null;
    if(!key||!slots.has(key)&&!structureSlots.has(key))return;
    const priority=e.type==="outpost-destroyed"||e.type==="outpost-rebuilt"||e.type==="robot-dead"||e.type==="robot-revived"||e.type==="assembly-end"||e.type==="cover-opening"||e.type==="cover-open"?3:eventMessage(e)?.broadcast?2:1;
    const old=localEvents.get(key);
    if(old&&e.at-old.event.at<2&&old.priority>priority)return;
    const combined=e.type==="outpost-rebuilt"&&old?.event.type==="outpost-destroyed"&&e.at-old.event.at<2?"摧毁 · "+text:text;
    localEvents.set(key,{event:e,text:combined,priority});
  }
  function localMessage(key:string,at:number,perspective:"all"|Team){
    const entry=localEvents.get(key);if(!entry)return null;
    if(at-entry.event.at>=2){localEvents.delete(key);return null;}
    return visibleEvent(entry.event,perspective)?entry:null;
  }
  function localText(l:Label,text:string,damage?:number,color:string=ARENA_VISUAL.text){
    draw(l,text+":"+damage+":"+color,c=>{c.textAlign="center";c.textBaseline="middle";c.font="600 24px system-ui, sans-serif";c.fillStyle=ARENA_VISUAL.labelBackground;c.fillRect(0,0,l.canvas.width,l.canvas.height);c.fillStyle=color;c.fillText(text,l.canvas.width/2,damage?18:l.canvas.height/2,l.canvas.width-8);if(damage){c.fillStyle=ARENA_VISUAL.damage;c.fillText("−"+damage,l.canvas.width/2,l.canvas.height-16,l.canvas.width-8);}});
  }
  const restore:[THREE.Mesh,THREE.Material|THREE.Material[]][]=[];
  const point=new THREE.Vector3(),view=new THREE.Vector3(),projected=new THREE.Vector3(),right=new THREE.Vector3(),up=new THREE.Vector3();
  const placements=new Map<THREE.Sprite,Placement>(),hiddenFrames=new Map<THREE.Sprite,number>();
  const shieldBounds=new THREE.Box3(),shieldSize=new THREE.Vector3(),shieldCenter=new THREE.Vector3();
  function shieldContact(id:string,hit:THREE.Vector3,at:number){
    const s=slots.get(id);if(!s)return;
    const p=s.protection;
    s.robot.getWorldPosition(point);point.y+=p.centerY;
    p.hitDirection.copy(hit).sub(point);p.hitDirection.set(p.hitDirection.x/p.radius,p.hitDirection.y/p.height,p.hitDirection.z/p.radius).normalize();p.hitAt=at;
  }
  function layout(camera:THREE.PerspectiveCamera,height:number,first:boolean,reserved:readonly MarkerRect[],items:{label:Label;priority:number;compact:boolean}[]){
    const width=height*camera.aspect,pixels=height*camera.projectionMatrix.elements[5]/2;
    const occupied:MarkerRect[]=[...reserved];if(first)occupied.push({x:width/2,y:height/2,w:48,h:48});
    right.setFromMatrixColumn(camera.matrixWorld,0);up.setFromMatrixColumn(camera.matrixWorld,1);
    for(const {label:l,compact} of items.sort((a,b)=>b.priority-a.priority)){
      const sprite=l.sprite;if(!sprite.visible){placements.delete(sprite);hiddenFrames.delete(sprite);continue;}
      const depth=-view.copy(sprite.position).applyMatrix4(camera.matrixWorldInverse).z;
      if(depth<=camera.near){sprite.visible=false;placements.delete(sprite);continue;}
      projected.copy(sprite.position).project(camera);
      const unit=pixels/depth;
      const rect={x:(projected.x+1)*width/2,y:(1-projected.y)*height/2,w:sprite.scale.x*unit,h:sprite.scale.y*unit};
      const placed=placeArenaMarker(rect,occupied,{width,height},placements.get(sprite),compact);
      if(!placed){sprite.visible=false;placements.delete(sprite);hiddenFrames.set(sprite,0);continue;}
      if(hiddenFrames.has(sprite)){const n=hiddenFrames.get(sprite)!+1;if(n<3){hiddenFrames.set(sprite,n);sprite.visible=false;continue;}hiddenFrames.delete(sprite);}
      placements.set(sprite,placed);occupied.push(placed.rect);
      sprite.position.addScaledVector(right,placed.dx/unit).addScaledVector(up,-placed.dy/unit);
      sprite.scale.multiplyScalar(placed.scale);
    }
  }
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
  function update(match:Match,camera:THREE.PerspectiveCamera,height:number,perspective:"all"|Team,reducedMotion=false,options:{focus?:string;firstPerson?:boolean;reserved?:readonly MarkerRect[];shieldTrace?:ShieldTrace;spinning?:(robot:THREE.Object3D)=>boolean}={}){
    restoreMaterials();camera.updateMatrixWorld();
    const pixels=height*camera.projectionMatrix.elements[5]/2,at=match.elapsed;
    const items:{label:Label;priority:number;compact:boolean}[]=[];
    for(const s of slots.values()){
      const state=match.robots.find(r=>r.id===s.identity.id)!;
      const visible=s.robot.visible;
      const showIntel=visible&&(perspective==="all"||perspective===state.team);
      const alive=state.hp>0,off=!alive||state.powerLockUntil>at;
      const dt=Math.max(0,at-s.at);s.at=at;
      s.hp=reducedMotion||!Number.isFinite(s.hp)||dt>.3||!alive||s.hp===0?state.hp:s.hp+(state.hp-s.hp)*Math.min(1,dt/.24);
      if(Math.abs(s.hp-state.hp)<.5)s.hp=state.hp;
      const fraction=Math.round(Math.max(0,Math.min(1,s.hp/state.maxHp))*100);
      const color=ARENA_VISUAL[state.team];
      const level=robotLevel(state,match),status=revivalStatus(match,state);
      if(s.level&&level>s.level){s.levelAt=at;pulseFor(s.stateVisual,"assembly",at,3,state.team);}s.level=level;
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
      const tags= !alive?["战亡"]: [status.weak?"虚弱":"",state.powerLockUntil>at?"断电":"",state.thermalLock==="permanent"?"永锁":state.thermalLock==="cooling"?"过热":"",status.immune?"保护":"",state.powerBoostUntil>at?"功率↑":"",robotDefense(match,state,false)<1?"防御↑":"",state.launcher==="locked"?"枪锁":state.launcher==="test"?"校验":"",options.spinning?.(s.robot)?"旋转":"",state.stance?({attack:"攻",defense:"守",move:"移"}[state.stance.mode]):"",terrainStatus(match,state).active.length?"地形↑":""].filter(Boolean);
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
        v.pulse.position.copy(point);v.pulse.position.y+=.06+v.height*progress;v.pulse.scale.setScalar(v.radius*(1.03+progress*.16));
      }
      const compact=(placements.get(s.label.sprite)?.scale??1)<1;
      const detail=compact?tags[0]??"":tags.slice(0,2).join(" · ");
      const priority=options.focus===s.identity.id?120:20;
      if(showIntel)draw(s.label,fraction+":"+off+":"+level+":"+state.hp+":"+detail+":"+compact,c=>{
        c.fillStyle=ARENA_VISUAL.labelBackground;c.fillRect(8,4,240,82);
        c.fillStyle=off?ARENA_VISUAL.inactive:color;c.fillRect(8,4,5,82);
        c.font=compact?"800 44px system-ui, sans-serif":"800 36px system-ui, sans-serif";c.textAlign="left";c.textBaseline="middle";c.fillText(s.identity.number,21,25,48);
        c.font="700 29px system-ui, sans-serif";c.fillStyle=ARENA_VISUAL.text;c.fillText(GROUND_NAMES[s.identity.kind],76,25,160);
        c.font=compact?"800 30px system-ui, sans-serif":"700 27px system-ui, sans-serif";c.fillText(String(state.hp),21,51,65);
        c.font="700 25px system-ui, sans-serif";c.textAlign="right";c.fillText(off?"OFF":"L"+level,236,51,48);
        c.font="600 21px system-ui, sans-serif";c.fillStyle=off?"#A3ADA7":status.immune?"#65bdff":state.thermalLock?"#F1A67F":"#F1D794";c.fillText(detail,182,51,96);
        c.fillStyle=ARENA_VISUAL.track;c.fillRect(20,70,216,8);c.fillStyle=off?ARENA_VISUAL.inactive:color;c.fillRect(20,70,216*fraction/100,8);
        c.beginPath();c.moveTo(122,86);c.lineTo(128,94);c.lineTo(134,86);c.fill();
      });
      s.robot.getWorldPosition(point);point.y+=s.height;
      const depth=-view.copy(point).applyMatrix4(camera.matrixWorldInverse).z;
      // The overview camera previously hit the 2.5m cap, shrinking full names
      // to 3–6 CSS pixels regardless of texture resolution. Bound screen size
      // while retaining the same depth-tested, collision-aware sprite layout.
      const width=Math.min(7.5,Math.max(.04,(height<520?92:118)*(options.focus===s.identity.id?1.16:1)*Math.max(0,depth)/Math.max(1,pixels)));
      const eventWidth=Math.min(width,2.5);
      s.label.sprite.visible=showIntel&&depth>0&&depth<100;
      s.label.sprite.position.copy(point);s.label.sprite.scale.set(width,width*96/256,1);
      items.push({label:s.label,priority,compact:true});
      const burst=s.burst,age=burst?at-burst.last:Infinity,message=localMessage(s.identity.id,at,perspective);
      s.damage.sprite.visible=s.label.sprite.visible&&!!burst&&age<DAMAGE_LIFE&&match.phase==="running";
      if(s.label.sprite.visible&&message&&match.phase==="running"){
        localText(s.damage,message.text,age<DAMAGE_LIFE?burst?.amount:undefined,message.event.type==="heal"||message.event.type==="robot-revived"?ARENA_VISUAL.recovery:ARENA_VISUAL.text);s.damage.sprite.visible=true;s.damage.sprite.material.opacity=1;
        s.damage.sprite.position.copy(point);s.damage.sprite.position.y+=eventWidth*.42;s.damage.sprite.scale.set(eventWidth*1.35,eventWidth*.45,1);
      }else if(s.label.sprite.visible&&match.phase==="running"&&at-s.levelAt<1.1&&age>=DAMAGE_LIFE){
        localText(s.damage,"等级提升 · L"+level,undefined,"#F1D794");s.damage.sprite.visible=true;s.damage.sprite.material.opacity=1;s.damage.sprite.position.copy(point);s.damage.sprite.position.y+=eventWidth*.45;s.damage.sprite.scale.set(eventWidth*1.25,eventWidth*.42,1);
      }else if(s.damage.sprite.visible&&burst){
        draw(s.damage,String(burst.amount),c=>{c.textAlign="center";c.textBaseline="middle";c.font="800 52px system-ui, sans-serif";c.lineJoin="round";c.lineWidth=5;c.strokeStyle="#0B0E0E";c.fillStyle=ARENA_VISUAL.damage;c.strokeText("−"+burst.amount,96,32);c.fillText("−"+burst.amount,96,32);});
        s.damage.sprite.position.copy(point);s.damage.sprite.position.y+=eventWidth*.4+(reducedMotion?0:age*.25);s.damage.sprite.scale.set(eventWidth*.95,eventWidth*.95/3,1);
        s.damage.sprite.material.opacity=reducedMotion?1:Math.min(1,(DAMAGE_LIFE-age)/.26);
      }else{
        if(age>=DAMAGE_LIFE)s.burst=undefined;

      }
      items.push({label:s.damage,priority:options.focus===s.identity.id?110:80,compact:false});
      // Death/power-off suppress all active material flashes. Keep team LEDs
      // intact and restore base materials immediately after the render.
      for(const [mesh,until] of s.flashes){
        if(off||until<=at||match.phase!=="running"){s.flashes.delete(mesh);continue;}
        if(visible&&!reducedMotion)flash(mesh);
      }
      if(visible&&!reducedMotion&&!off&&s.bodyUntil>at&&match.phase==="running")for(const mesh of s.body)flash(mesh);
    }
    for(const s of structureSlots.values()){
      const depth=-view.copy(s.anchor).applyMatrix4(camera.matrixWorldInverse).z;
      const width=Math.min(6.5,Math.max(.04,(height<520?90:112)*Math.max(0,depth)/Math.max(1,pixels)));
      const visible=depth>0&&depth<100&&match.phase==="running";
      if(s.label&&(s.kind==="base"||s.kind==="outpost")){
      const state=match.sides[s.team],hp=state[s.kind],max=s.kind==="base"?10000:1000,owner=s.kind==="outpost"?state.outpostOwner:s.team;
      const color=ARENA_VISUAL[owner];
      draw(s.label,hp+":"+owner,c=>{
        c.fillStyle=ARENA_VISUAL.labelBackground;c.fillRect(8,4,240,82);c.fillStyle=color;c.fillRect(8,4,240,4);
        c.fillStyle=color;c.font="600 22px system-ui, sans-serif";c.textAlign="left";c.textBaseline="middle";
        c.fillText((s.team==="red"?"红":"蓝")+(s.kind==="base"?"方基地":"方前哨"),20,34);
        c.font="800 32px system-ui, sans-serif";c.textAlign="right";c.fillStyle=ARENA_VISUAL.text;c.fillText(String(hp),236,34);
        c.fillStyle=ARENA_VISUAL.track;c.fillRect(20,62,216,13);c.fillStyle=color;c.fillRect(20,62,216*hp/max,13);
      });
      s.label.sprite.visible=visible;s.label.sprite.position.copy(s.anchor);s.label.sprite.scale.set(width,width*96/256,1);items.push({label:s.label,priority:45,compact:true});
      }
      const burst=s.burst,age=burst?at-burst.last:Infinity;
      const local=localMessage(s.key,at,perspective),message=local?.text??(burst&&age<DAMAGE_LIFE?"−"+burst.amount:null);
      if(age>=DAMAGE_LIFE)s.burst=undefined;
      s.damage.sprite.visible=visible&&!!message;
      if(message&&visible){localText(s.damage,message,local&&age<DAMAGE_LIFE?burst?.amount:undefined,local?.event.type==="outpost-rebuilt"?ARENA_VISUAL.recovery:local?ARENA_VISUAL.text:ARENA_VISUAL.damage);s.damage.sprite.material.opacity=1;s.damage.sprite.position.copy(s.anchor);const eventWidth=Math.min(width,3);s.damage.sprite.position.y+=eventWidth*.4;s.damage.sprite.scale.set(eventWidth,eventWidth/4,1);}
      items.push({label:s.damage,priority:85,compact:false});
    }
    layout(camera,height,!!options.firstPerson,options.reserved??[],items);
  }
  function clear(){restoreMaterials();localEvents.clear();placements.clear();hiddenFrames.clear();for(const s of structureSlots.values()){s.burst=undefined;s.damage.sprite.visible=false;if(s.label)s.label.sprite.visible=false;}for(const s of slots.values()){s.burst=undefined;s.bodyUntil=0;s.flashes.clear();s.hp=NaN;s.at=0;s.level=0;s.levelAt=-10;s.protection.immune=false;s.protection.activeAt=s.protection.endedAt=s.protection.hitAt=-10;s.protection.shell.visible=false;s.protection.clipAt=-10;s.protection.clipCenter.set(Infinity,Infinity,Infinity);s.protection.clipCount=0;s.protection.shadow.visible=false;s.stateVisual.accent.visible=false;s.stateVisual.pulse.visible=false;s.stateVisual.powerOff=false;s.stateVisual.pulseAt=-10;s.stateVisual.pulsePriority=0;s.stateVisual.recoveryAt=-10;s.label.sprite.visible=false;s.damage.sprite.visible=false;}}
  function dispose(){clear();group.removeFromParent();effects.removeFromParent();shieldGeometry.dispose();shieldMaterial.dispose();shadowGeometry.dispose();shadowMaterial.dispose();accentGeometry.dispose();segmentGeometry.dispose();pulseMaterial.dispose();for(const m of Object.values(accentMaterials))m.dispose();for(const m of flashMaterials.values())m.dispose();flashMaterials.clear();for(const s of [...slots.values(),...structureSlots.values()])for(const l of [s.label,s.damage])if(l){l.texture.dispose();l.sprite.material.dispose();}slots.clear();structureSlots.clear();}
  return {group,damage,event,amountFor,contact,shieldContact,update,restoreMaterials,clear,dispose};
}
