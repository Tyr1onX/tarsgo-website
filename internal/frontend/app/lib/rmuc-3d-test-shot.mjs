// Existing CAD isolation tests lock the mechanism pose at a reviewed angle.
// Aim at the exact straight-ray intersection, then exercise actual flight
// against that frozen pose. Separate live-flight tests advance the referee.
import {traceArenaShot,prepareArenaShots} from "./rmuc-3d-shot.ts";
import {ballisticAim,launchProjectile,advanceProjectile,projectileSpeed} from "./rmuc-3d-projectiles.ts";
export function fireTestTrajectory(match,id,ray,roots,from,direction){
 const index=prepareArenaShots(roots),direct=traceArenaShot(ray,roots,from,direction,35,index);
 const heavy=match.robots.find(r=>r.id===id)?.heavy??false;
 const aim=direct?ballisticAim(from,direct.point.clone().addScaledVector(direction,.015),projectileSpeed(heavy)):null;
 const p=launchProjectile(match,id,from,aim?.direction??direction);
 if(!p)return null;
 for(let i=0;i<300;i++){
   const result=advanceProjectile(match,p,.01,ray,roots,index);
   if(result.done)return {...result,shooter:p.shooter,to:p.position.clone()};
 }
 throw Error("fixture projectile failed to terminate");
}
