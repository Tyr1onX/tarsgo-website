import * as THREE from "three";

export const FIELD_HALF_X = 14;
export const FIELD_HALF_Z = 7.5;
export const PLAYER_RADIUS = .25;

type Surface = { mesh: THREE.Mesh; bounds: THREE.Box3 };
export type Occupant = { position: THREE.Vector3; radius: number };

export function insideField(x: number, z: number, radius: number) {
  return Math.abs(x) + radius <= FIELD_HALF_X && Math.abs(z) + radius <= FIELD_HALF_Z;
}

// Rasterize the same 0.1 m support samples previously obtained by vertical
// CAD raycasts. The fixed field is sampled once; A* never raycasts cold cells.
// Preserve the highest intersection of the actual source triangles, not an
// independently authored collision map.
const RESOLUTION=.1, HALF_X=Math.round(FIELD_HALF_X/RESOLUTION), HALF_Z=Math.round(FIELD_HALF_Z/RESOLUTION);
const WIDTH=2*HALF_X+1, DEPTH=2*HALF_Z+1;
function createSupportSamples(surfaces:readonly Surface[]){
  const samples=new Float64Array(WIDTH*DEPTH).fill(-Infinity);
  const v=new THREE.Vector3();
  for(const {mesh} of surfaces){
    const g=mesh.geometry,position=g.attributes.position,index=g.index;
    const points=new Float64Array(position.count*3);
    for(let i=0;i<position.count;i++){
      v.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
      points[3*i]=v.x;points[3*i+1]=v.y;points[3*i+2]=v.z;
    }
    const side=Array.isArray(mesh.material)?THREE.DoubleSide:mesh.material.side;
    const orientation=mesh.matrixWorld.determinant()<0?-1:1;
    const start=g.drawRange.start,end=Math.min(index?.count??position.count,start+g.drawRange.count);
    for(let i=start;i+2<end;i+=3){
      const a=3*(index?index.getX(i):i),b=3*(index?index.getX(i+1):i+1),c=3*(index?index.getX(i+2):i+2);
      const ax=points[a],ay=points[a+1],az=points[a+2],bx=points[b],by=points[b+1],bz=points[b+2],cx=points[c],cy=points[c+1],cz=points[c+2];
      const denominator=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);
      if(Math.abs(denominator)<1e-15||side===THREE.FrontSide&&denominator*orientation>0||side===THREE.BackSide&&denominator*orientation<0)continue;
      const minX=Math.max(-HALF_X,Math.ceil(Math.min(ax,bx,cx)/RESOLUTION-1e-9));
      const maxX=Math.min(HALF_X,Math.floor(Math.max(ax,bx,cx)/RESOLUTION+1e-9));
      const minZ=Math.max(-HALF_Z,Math.ceil(Math.min(az,bz,cz)/RESOLUTION-1e-9));
      const maxZ=Math.min(HALF_Z,Math.floor(Math.max(az,bz,cz)/RESOLUTION+1e-9));
      for(let ix=minX;ix<=maxX;ix++)for(let iz=minZ;iz<=maxZ;iz++){
        const x=ix*RESOLUTION,z=iz*RESOLUTION;
        const u=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/denominator;
        const w=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/denominator;
        if(u< -1e-9||w< -1e-9||u+w>1+1e-9)continue;
        const y=u*ay+w*by+(1-u-w)*cy,key=(ix+HALF_X)*DEPTH+iz+HALF_Z;
        if(y<=10&&y>samples[key])samples[key]=y;
      }
    }
  }
  return samples;
}

// Locomotion remains a footprint-based training approximation of the CAD.
export function createArenaTerrain(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const surfaces: Surface[] = [];
  root.traverse(object => {
    if (object instanceof THREE.Mesh) surfaces.push({ mesh: object, bounds: new THREE.Box3().setFromObject(object) });
  });
  const samples=createSupportSamples(surfaces);
  const raycaster = new THREE.Raycaster();
  const heightAt = (x: number, z: number) => {
    const ix=Math.round(x/RESOLUTION),iz=Math.round(z/RESOLUTION);
    return Math.abs(ix)<=HALF_X&&Math.abs(iz)<=HALF_Z?samples[(ix+HALF_X)*DEPTH+iz+HALF_Z]:-Infinity;
  };

  const cameraDistance = (from: THREE.Vector3, to: THREE.Vector3) => {
    const direction = to.clone().sub(from);
    const distance = direction.length();
    if (distance < .001) return distance;
    raycaster.set(from, direction.divideScalar(distance));
    let closest = distance;
    for (const { mesh, bounds } of surfaces) {
      if (!raycaster.ray.intersectsBox(bounds)) continue;
      const hit = raycaster.intersectObject(mesh, false)[0];
      if (hit && hit.distance < closest) closest = hit.distance;
    }
    return Math.max(.05, closest < distance ? closest - .12 : distance);
  };

  return { heightAt, cameraDistance };
}
export type ArenaTerrain = ReturnType<typeof createArenaTerrain>;

const SAMPLES = [
  [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
  [.707, .707], [-.707, .707], [.707, -.707], [-.707, -.707],
];

export function supportedHeight(terrain: Pick<ArenaTerrain, "heightAt">, x: number, z: number, radius: number, previousY: number, step: number) {
  if (!insideField(x, z, radius)) return null;
  const center = terrain.heightAt(x, z);
  let low = center, high = center;
  for (let i = 1; i < SAMPLES.length; i++) {
    const [dx, dz] = SAMPLES[i];
    const height = terrain.heightAt(x + radius * dx, z + radius * dz);
    low = Math.min(low, height);
    high = Math.max(high, height);
  }
  // Three measured ~0.2m stair risers at the highpoint approach.
  // A rigid single-plane footprint cannot straddle two of these risers.
  // Only the stair strip permits articulated support; center motion still
  // obeys the existing step limit and the surrounding walls remain blocked.
  const stair=Math.abs(x)>=10.35&&Math.abs(x)<=12.05&&Math.abs(z-Math.sign(x)*4.65)<=.5;
  if (!Number.isFinite(low)) return null;
  if(stair&&step>=.20&&high-low<=.75&&Math.abs(center-previousY)<=step)return center;
  if (high - low > step || high - previousY > step || previousY - low > step) return null;
  return center;
}

export function moveOnArena(
  terrain: Pick<ArenaTerrain, "heightAt">, position: THREE.Vector3,
  dx: number, dz: number, radius: number, step: number, occupants: readonly Occupant[],
) {
  // Small substeps prevent crossing a narrow raised feature in one frame.
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .08));
  const tryMove = (x: number, z: number) => {
    if (occupants.some(other => {
      const limit = radius + other.radius;
      const next = Math.hypot(x - other.position.x, z - other.position.z);
      // Permit separating from an existing overlap, never moving deeper into it.
      return next < limit && next < Math.hypot(position.x - other.position.x, position.z - other.position.z) - .0001;
    })) return false;
    const y = supportedHeight(terrain, x, z, radius, position.y, step);
    if (y === null) return false;
    position.set(x, y, z);
    return true;
  };
  for (let i = 0; i < count; i++) {
    const x = dx / count, z = dz / count;
    if (!tryMove(position.x + x, position.z + z)) {
      if (x) tryMove(position.x + x, position.z);
      if (z) tryMove(position.x, position.z + z);
    }
  }
  return position;
}

export function nearestDriveable<T extends Occupant & { driveable: boolean }>(player: THREE.Vector3, robots: readonly T[], reach = 1.65): T | null {
  let nearest: T | null = null, distance = reach;
  for (const robot of robots) {
    if (!robot.driveable) continue;
    const gap = Math.hypot(player.x - robot.position.x, player.z - robot.position.z);
    if (Math.abs(player.y - robot.position.y) < .65 && gap <= distance) {
      nearest = robot;
      distance = gap;
    }
  }
  return nearest;
}
