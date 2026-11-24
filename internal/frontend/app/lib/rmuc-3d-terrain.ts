import * as THREE from "three";

export const FIELD_HALF_X = 14;
export const FIELD_HALF_Z = 7.5;
export const PLAYER_RADIUS = .25;

type Surface = { mesh: THREE.Mesh; bounds: THREE.Box3 };
export type Occupant = { position: THREE.Vector3; radius: number };

export function insideField(x: number, z: number, radius: number) {
  return Math.abs(x) + radius <= FIELD_HALF_X && Math.abs(z) + radius <= FIELD_HALF_Z;
}

// Height queries come from the actual CAD triangles, with a small on-demand
// spatial cache. The controller uses a footprint rather than point collision.
// This is a training locomotion approximation, not a certified physics mesh.
export function createArenaTerrain(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const surfaces: Surface[] = [];
  root.traverse(object => {
    if (object instanceof THREE.Mesh) surfaces.push({ mesh: object, bounds: new THREE.Box3().setFromObject(object) });
  });
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const origin = new THREE.Vector3();
  const cache = new Map<number, number>();
  const resolution = .1;
  const heightAt = (x: number, z: number) => {
    const ix = Math.round(x / resolution), iz = Math.round(z / resolution);
    const key = (ix + 200) * 512 + iz + 200;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    x = ix * resolution;
    z = iz * resolution;
    origin.set(x, 10, z);
    raycaster.set(origin, down);
    let top = -Infinity;
    for (const { mesh, bounds } of surfaces) {
      if (x < bounds.min.x || x > bounds.max.x || z < bounds.min.z || z > bounds.max.z) continue;
      const hit = raycaster.intersectObject(mesh, false)[0];
      if (hit) top = Math.max(top, hit.point.y);
    }
    cache.set(key, top);
    return top;
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
  const heights = SAMPLES.map(([dx, dz]) => terrain.heightAt(x + radius * dx, z + radius * dz));
  const low = Math.min(...heights), high = Math.max(...heights);
  if (!Number.isFinite(low) || high - low > step || high - previousY > step || previousY - low > step) return null;
  return heights[0];
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
