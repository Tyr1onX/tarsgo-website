import * as THREE from "three";
import { fireRound, damageTarget, type Match, type MatchRobot } from "./rmuc-3d-match.ts";
import { arenaHitTarget, armorHit, traceArenaShot, prepareArenaShots, SHOT_RANGE, type ShotIndex } from "./rmuc-3d-shot.ts";

// Virtual training uses the official 2027 upper limits (tables 3-3/3-5/3-6).
// No measured hardware velocity, drag or real sensor model is implied.
export const projectileSpeed=(heavy:boolean)=>heavy?16.5:25;
export const PROJECTILE_GRAVITY=9.81;
export const projectileDiameter=(heavy:boolean)=>heavy?.042:.017;
export type Projectile={shooter:MatchRobot;calibration:boolean;position:THREE.Vector3;velocity:THREE.Vector3;age:number;distance:number};

// Low arc from a rigid barrel pivot. The muzzle is barrelLength farther
// along the chosen axis; solving for it keeps the actual bore aligned.
export function ballisticAim(from:THREE.Vector3,to:THREE.Vector3,speed:number,barrelLength=0){
  const delta=to.clone().sub(from),horizontal=Math.hypot(delta.x,delta.z);
  if(horizontal<.001||speed<=0)return null;
  let pitch=Math.atan2(delta.y,horizontal),time=0;
  for(let i=0;i<12;i++){
    time=(horizontal/Math.cos(pitch)-barrelLength)/speed;
    if(time<=0||time>3)return null;
    pitch=Math.atan2(delta.y+PROJECTILE_GRAVITY*time*time/2,horizontal);
  }
  const direction=new THREE.Vector3(delta.x/horizontal*Math.cos(pitch),Math.sin(pitch),delta.z/horizontal*Math.cos(pitch));
  time=(horizontal/Math.cos(pitch)-barrelLength)/speed;
  if(time<=0||time>3||Math.abs((barrelLength+speed*time)*direction.y-PROJECTILE_GRAVITY*time*time/2-delta.y)>.015)return null;
  return {direction,pitch,time};
}

export function launchProjectile(match:Match,id:string,from:THREE.Vector3,direction:THREE.Vector3):Projectile|null{
  if(!Number.isFinite(direction.lengthSq())||direction.lengthSq()<1e-12||!from.toArray().every(Number.isFinite))return null;
  const calibration=match.robots.find(r=>r.id===id)?.launcher==="test";
  const shooter=fireRound(match,id);
  if(!shooter)return null;
  return {shooter,calibration,position:from.clone(),velocity:direction.clone().normalize().multiplyScalar(projectileSpeed(shooter.heavy)),age:0,distance:0};
}

// Continuous segment against the current CAD/robot pose. The referee is
// touched only on actual impact. A fired projectile survives its shooter,
// but not the end/reset of the match. Moving poses are sampled per substep.
export function advanceProjectile(match:Match,p:Projectile,dt:number,ray:THREE.Raycaster,roots:THREE.Object3D[],index?:ShotIndex,exclude?:THREE.Object3D){
  if(match.phase!=="running")return {done:true,damage:0,hit:undefined,target:undefined,to:p.position};
  const delta=p.velocity.clone().multiplyScalar(dt);delta.y-=PROJECTILE_GRAVITY*dt*dt/2;
  const distance=delta.length(),length=Math.min(distance,SHOT_RANGE-p.distance);
  if(length<=0||dt<=0)return {done:length<=0,damage:0,hit:undefined,target:undefined,to:p.position};
  const direction=delta.multiplyScalar(1/distance);
  const hit=traceArenaShot(ray,roots,p.position,direction,length,index,exclude);
  const actual=hit?.distance??length,used=dt*actual/distance;
  p.position.addScaledVector(direction,actual);p.velocity.y-=PROJECTILE_GRAVITY*used;p.age+=used;p.distance+=actual;
  const target=arenaHitTarget(hit,direction);
  let damage=0;
  if(target&&!p.calibration){
    // Normal velocity is a virtual approximation using the actual hit triangle.
    // The official thresholds are strict >12m/s (17mm) and >8m/s (42mm).
    const normal=hit?.face?.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld));
    if(!normal||Math.abs(p.velocity.dot(normal))>(p.shooter.heavy?8:12))
      damage=damageTarget(match,p.shooter,target,armorHit(hit));
  }
  return {done:!!hit||p.distance>=SHOT_RANGE-1e-8||p.age>=3,damage,hit,target,to:p.position};
}


// All scale compensation is render-only. Physical trajectory and collision
// are independent of camera distance, pixel ratio and visibility.
export function projectileVisualDiameter(diameter:number,depth:number,pixelsPerMetre:number,first:boolean){
  const minimum=(first?1.4:2.4)*Math.max(0,depth)/Math.max(1,pixelsPerMetre);
  return Math.min(diameter*(first?2:6),Math.max(diameter,minimum*Math.sqrt(diameter/.017)));
}
export const RESIDUE_LIMIT=256;
type Support={height:(x:number,z:number)=>number;accept:(hit:THREE.Intersection)=>boolean};
type Residue={position:THREE.Vector3;velocity:THREE.Vector3;diameter:number;age:number;floor:number;bounces:number};
const RESIDUE_LIFE=20,RESIDUE_FADE=2;
function groundResidue(hit:THREE.Intersection,p:Projectile,support:Support):Residue|null{
  const normal=hit.face?.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld));
  const floor=support.height(hit.point.x,hit.point.z);
  if(!normal||normal.y<.65||!support.accept(hit)||!Number.isFinite(floor)||Math.abs(floor-hit.point.y)>.065)return null;
  const diameter=projectileDiameter(p.shooter.heavy),velocity=p.velocity.clone();
  velocity.y=0;velocity.multiplyScalar(.06);velocity.clampLength(0,1);velocity.y=.65;
  return {position:hit.point.clone().add(new THREE.Vector3(0,diameter/2,0)),velocity,diameter,age:0,floor:hit.point.y,bounces:0};
}
function advanceResidue(r:Residue,dt:number,support:Support){
  r.age+=dt;if(r.age>=1.3){r.velocity.set(0,0,0);r.position.y=r.floor+r.diameter/2;return;}
  const x=r.position.x+r.velocity.x*dt,z=r.position.z+r.velocity.z*dt;
  const floor=support.height(x,z);
  if(Number.isFinite(floor)&&Math.abs(floor-r.floor)<.045){r.position.x=x;r.position.z=z;r.floor=floor;}
  else {r.velocity.x=0;r.velocity.z=0;}
  r.velocity.x*=Math.exp(-3.5*dt);r.velocity.z*=Math.exp(-3.5*dt);
  r.velocity.y-=PROJECTILE_GRAVITY*dt;r.position.y+=r.velocity.y*dt;
  if(r.position.y<=r.floor+r.diameter/2){
    r.position.y=r.floor+r.diameter/2;
    if(r.velocity.y<-.15&&r.bounces<2){r.velocity.y=-r.velocity.y*.28;r.bounces++;}
    else r.velocity.y=0;
  }
}

// Small procedural texture, one shared material; normal depth testing makes
// the halo a local visible effect, never a wall-penetrating overlay.
export function softGlowTexture(){
  const size=32,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const r=Math.hypot((x+.5-size/2)/(size/2),(y+.5-size/2)/(size/2)),i=(y*size+x)*4;
    data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(255*Math.max(0,1-r)**2);
  }
  const texture=new THREE.DataTexture(data,size,size);texture.needsUpdate=true;texture.magFilter=THREE.LinearFilter;
  return texture;
}

// Shared resources and bounded visual pools; only physical contacts decide damage.
export function createProjectileSystem(scene:THREE.Scene,support?:Support){
  const group=new THREE.Group();group.name="virtual-projectiles";scene.add(group);
  const sphere=new THREE.SphereGeometry(.5,10,8),shaft=new THREE.CylinderGeometry(.5,.5,1,6);
  const ball=new THREE.MeshBasicMaterial({color:0xe4ff42,toneMapped:false});
  const impact=new THREE.MeshBasicMaterial({color:0xeaff9a,toneMapped:false,transparent:true,opacity:.75,depthWrite:false});
  const damageImpact=new THREE.MeshBasicMaterial({color:0xffe0a0,toneMapped:false,transparent:true,opacity:.9,depthWrite:false});
  const glow=softGlowTexture(),haloMaterial=new THREE.SpriteMaterial({map:glow,color:0xc8ff24,opacity:.72,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
  const trailMaterials=[.8,.63,.45,.29,.15,.07].map(opacity=>new THREE.MeshBasicMaterial({color:0xc7ff25,toneMapped:false,transparent:true,opacity,depthWrite:false}));
  type Slot={body:THREE.Mesh;halo:THREE.Sprite;trail:THREE.Mesh[];history:THREE.Vector3[];projectile:Projectile|null;owner:THREE.Object3D|null;flash:number};
  const slots:Slot[]=[],active:Slot[]=[],ray=new THREE.Raycaster(),up=new THREE.Vector3(0,1,0),delta=new THREE.Vector3(),view=new THREE.Vector3();
  // Four opacity bands keep the fixed-capacity residue rendering on native
  // Three materials, with no extra shader or per-pellet scene objects.
  const residues:Residue[]=[];
  const residueMaterials=[1,.65,.35,.12].map(opacity=>new THREE.MeshStandardMaterial({color:0x849d29,roughness:.9,opacity,transparent:opacity<1,depthWrite:opacity===1}));
  const residueMeshes=residueMaterials.map(material=>{const mesh=new THREE.InstancedMesh(sphere,material,RESIDUE_LIMIT);mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(mesh);return mesh;});
  const transform=new THREE.Object3D();
  function acquire(){
    const available=slots.find(s=>!s.projectile&&!s.flash);
    if(available)return available;
    const body=new THREE.Mesh(sphere,ball),halo=new THREE.Sprite(haloMaterial),trail=trailMaterials.map(m=>new THREE.Mesh(shaft,m));
    body.name="projectile-core";halo.name="projectile-halo";
    group.add(body,halo,...trail);
    const slot:Slot={body,halo,trail,history:[],projectile:null,owner:null,flash:0};slots.push(slot);return slot;
  }
  function release(slot:Slot){
    slot.projectile=null;slot.owner=null;slot.flash=0;slot.body.visible=false;slot.halo.visible=false;slot.history.length=0;
    for(const mesh of slot.trail)mesh.visible=false;
  }
  function fire(match:Match,id:string,from:THREE.Vector3,aim:THREE.Vector3,owner:THREE.Object3D){
    const projectile=launchProjectile(match,id,from,aim);if(!projectile)return false;
    const slot=acquire();slot.projectile=projectile;slot.owner=owner;slot.body.position.copy(from);
    slot.body.material=ball;slot.body.scale.setScalar(projectileDiameter(projectile.shooter.heavy));slot.body.visible=true;
    slot.halo.visible=false;slot.history.push(from.clone());
    for(const mesh of slot.trail)mesh.visible=false;
    active.push(slot);return true;
  }
  function advance(match:Match,dt:number,roots:THREE.Object3D[],prepare?:()=>ShotIndex,onContact?:(id:string,hit:THREE.Intersection,at:number)=>void){
    if(match.phase!=="running"){clear();return;}
    if(dt<=0)return;
    if(support)for(let i=residues.length-1;i>=0;i--){advanceResidue(residues[i],dt,support);if(residues[i].age>=RESIDUE_LIFE)residues.splice(i,1);}
    if(!active.length)return;
    const index=active.some(s=>s.projectile)?(prepare?.()??prepareArenaShots(roots)):undefined;
    for(let i=active.length-1;i>=0;i--){
      const slot=active[i],p=slot.projectile;
      if(!p){
        slot.flash=Math.max(0,slot.flash-dt);
        if(!slot.flash){release(slot);active.splice(i,1);}
        continue;
      }
      const result=advanceProjectile(match,p,dt,ray,roots,index,slot.owner??undefined);
      slot.body.position.copy(p.position);
      if(result.done){
        slot.projectile=null;slot.owner=null;slot.halo.visible=false;slot.history.length=0;
        for(const mesh of slot.trail)mesh.visible=false;
        if(result.hit){
          if(result.damage>0&&result.target?.type==="robot")onContact?.(result.target.id,result.hit,match.elapsed);
          if(support&&!result.target){const r=groundResidue(result.hit,p,support);if(r){if(residues.length===RESIDUE_LIMIT)residues.shift();residues.push(r);}}
          slot.flash=result.damage>0?.14:.075;slot.body.material=result.damage>0?damageImpact:impact;slot.body.scale.setScalar((p.shooter.heavy?.09:.055)*(result.damage>0?1.6:1));
        }else{release(slot);active.splice(i,1);}
        continue;
      }
      const last=slot.history.at(-1)!;
      if(p.position.distanceToSquared(last)>1e-10){slot.history.push(p.position.clone());if(slot.history.length>slot.trail.length+1)slot.history.shift();}
    }
  }
  function visual(camera:THREE.PerspectiveCamera,height:number,first:boolean){
    camera.updateMatrixWorld();
    const pixels=height*camera.projectionMatrix.elements[5]/2;
    for(const slot of active){
      const p=slot.projectile;if(!p)continue;
      const physical=projectileDiameter(p.shooter.heavy);
      const diameter=projectileVisualDiameter(physical,-view.copy(p.position).applyMatrix4(camera.matrixWorldInverse).z,pixels,first);
      slot.body.scale.setScalar(diameter);slot.halo.position.copy(p.position);slot.halo.scale.setScalar(diameter*2.8);slot.halo.visible=true;
      let remaining=first?.65:1.15;
      for(const [i,mesh] of slot.trail.entries()){
        const b=slot.history[slot.history.length-1-i],a=slot.history[slot.history.length-2-i];
        if(!a||!b||remaining<=0){mesh.visible=false;continue;}
        delta.copy(b).sub(a);const distance=delta.length(),length=Math.min(remaining,distance);
        if(length<=1e-6){mesh.visible=false;continue;}
        delta.divideScalar(distance);mesh.visible=true;
        mesh.position.copy(b).addScaledVector(delta,-length/2);mesh.quaternion.setFromUnitVectors(up,delta);
        const width=diameter*(.58-i*.065);mesh.scale.set(width,length,width);remaining-=length;
      }
    }
    for(const mesh of residueMeshes)mesh.count=0;
    for(const r of residues){
      const alpha=Math.min(1,(RESIDUE_LIFE-r.age)/RESIDUE_FADE);
      const mesh=residueMeshes[alpha>.99?0:alpha>.5?1:alpha>.25?2:3];
      transform.position.copy(r.position);transform.scale.setScalar(r.diameter);transform.updateMatrix();mesh.setMatrixAt(mesh.count++,transform.matrix);
    }
    for(const mesh of residueMeshes)if(mesh.count)mesh.instanceMatrix.needsUpdate=true;
  }
  function clear(){for(const slot of active)release(slot);active.length=0;residues.length=0;for(const mesh of residueMeshes)mesh.count=0;}
  function dispose(){
    clear();group.removeFromParent();sphere.dispose();shaft.dispose();ball.dispose();impact.dispose();damageImpact.dispose();glow.dispose();haloMaterial.dispose();
    for(const material of trailMaterials)material.dispose();
    for(const mesh of residueMeshes)mesh.dispose();for(const material of residueMaterials)material.dispose();slots.length=0;
  }
  return {fire,advance,visual,clear,dispose,group,get activeCount(){return active.filter(s=>s.projectile).length;},get slotCount(){return slots.length;},get residueCount(){return residues.length;}};
}
