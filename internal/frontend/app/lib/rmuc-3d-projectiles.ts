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

// Shared resources, lazy reusable slots. The green trail covers only the
// immediately traversed segment, never the whole muzzle-to-target ray.
export function createProjectileSystem(scene:THREE.Scene){
  const group=new THREE.Group();group.name="virtual-projectiles";scene.add(group);
  const sphere=new THREE.SphereGeometry(.5,10,8),shaft=new THREE.CylinderGeometry(.5,.5,1,6);
  const ball=new THREE.MeshBasicMaterial({color:0xd7ff35,toneMapped:false});
  const impact=new THREE.MeshBasicMaterial({color:0xeaff9a,toneMapped:false,transparent:true,opacity:.75,depthWrite:false});
  const trailMaterials=[.75,.42,.15].map(opacity=>new THREE.MeshBasicMaterial({color:0xc7ff25,toneMapped:false,transparent:true,opacity,depthWrite:false}));
  type Slot={body:THREE.Mesh;trail:THREE.Mesh[];projectile:Projectile|null;owner:THREE.Object3D|null;flash:number};
  const slots:Slot[]=[],active:Slot[]=[],ray=new THREE.Raycaster(),up=new THREE.Vector3(0,1,0);
  const delta=new THREE.Vector3(),direction=new THREE.Vector3(),previous=new THREE.Vector3();
  function acquire(){
    const available=slots.find(s=>!s.projectile&&!s.flash);
    if(available)return available;
    const body=new THREE.Mesh(sphere,ball),trail=trailMaterials.map(m=>new THREE.Mesh(shaft,m));
    group.add(body,...trail);
    const slot:Slot={body,trail,projectile:null,owner:null,flash:0};slots.push(slot);return slot;
  }
  function release(slot:Slot){
    slot.projectile=null;slot.owner=null;slot.flash=0;slot.body.visible=false;
    for(const mesh of slot.trail)mesh.visible=false;
  }
  function fire(match:Match,id:string,from:THREE.Vector3,aim:THREE.Vector3,owner:THREE.Object3D){
    const projectile=launchProjectile(match,id,from,aim);if(!projectile)return false;
    const slot=acquire();slot.projectile=projectile;slot.owner=owner;slot.body.position.copy(from);
    slot.body.material=ball;slot.body.scale.setScalar(projectileDiameter(projectile.shooter.heavy)*1.25);slot.body.visible=true;
    for(const mesh of slot.trail)mesh.visible=false;
    active.push(slot);return true;
  }
  function advance(match:Match,dt:number,roots:THREE.Object3D[]){
    if(match.phase!=="running"){clear();return;}
    if(dt<=0||!active.length)return;
    const index=active.some(s=>s.projectile)?prepareArenaShots(roots):undefined;
    for(let i=active.length-1;i>=0;i--){
      const slot=active[i],p=slot.projectile;
      if(!p){
        slot.flash=Math.max(0,slot.flash-dt);
        if(!slot.flash){release(slot);active.splice(i,1);}
        continue;
      }
      previous.copy(p.position);
      const result=advanceProjectile(match,p,dt,ray,roots,index,slot.owner??undefined);
      slot.body.position.copy(p.position);
      if(result.done){
        slot.projectile=null;slot.owner=null;
        for(const mesh of slot.trail)mesh.visible=false;
        if(result.hit){
          slot.flash=.075;slot.body.material=impact;
          slot.body.scale.setScalar(p.shooter.heavy?.09:.055);
        }else{release(slot);active.splice(i,1);}
        continue;
      }
      delta.copy(p.position).sub(previous);
      const length=Math.min(.45,delta.length()),diameter=projectileDiameter(p.shooter.heavy);
      direction.copy(delta).normalize();
      for(const [j,mesh] of slot.trail.entries()){
        const part=length/slot.trail.length;
        mesh.visible=part>1e-5;
        mesh.position.copy(p.position).addScaledVector(direction,-part*(j+.5));
        mesh.quaternion.setFromUnitVectors(up,direction);
        mesh.scale.set(diameter*(.65-j*.14),part,diameter*(.65-j*.14));
      }
    }
  }
  function clear(){for(const slot of active)release(slot);active.length=0;}
  function dispose(){
    clear();group.removeFromParent();sphere.dispose();shaft.dispose();ball.dispose();impact.dispose();
    for(const material of trailMaterials)material.dispose();slots.length=0;
  }
  return {fire,advance,clear,dispose,group,get activeCount(){return active.filter(s=>s.projectile).length;},get slotCount(){return slots.length;}};
}
