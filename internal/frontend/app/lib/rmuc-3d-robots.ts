import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { ArenaTerrain } from "./rmuc-3d-terrain";
import { robotSeasons } from "../data/robot-seasons.ts";

// The 2026 photographs are appearance references, not 2027 robot CAD.
// These are exhibition placements, NOT official competition spawn points.
export const ROBOT_PREVIEWS = [
  { id: "2026-hero-01", kind: "hero", x: -9, z: -4.5 },
  { id: "2026-engineering-02", kind: "engineer", x: -7, z: -4.5 },
  { id: "2026-infantry-03", kind: "infantry03", x: -5, z: -4.5 },
  { id: "2026-infantry-04", kind: "infantry04", x: -9, z: -2.3 },
  { id: "2026-sentinel-07", kind: "sentry", x: -6, z: -1.8 },
  { id: "2026-hero-01-backup", kind: "heroBackup", x: -11, z: 1.8 },
  { id: "2026-infantry-03-backup", kind: "infantryBackup", x: -8, z: 1.8 },
  { id: "2026-air-06", kind: "air", x: -7, z: 3.5 },
  { id: "2026-dart-08", kind: "dart", x: -5, z: 3.5 },
  { id: "2026-radar-09", kind: "radar", x: -3, z: 2.9 },
] as const;

export type RobotPreviewKind = (typeof ROBOT_PREVIEWS)[number]["kind"];
const materials = {
  frame: new THREE.MeshStandardMaterial({ color: 0x191b1f, metalness: .75, roughness: .46 }),
  armour: new THREE.MeshStandardMaterial({ color: 0x292d31, metalness: .48, roughness: .48 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xa0a4a3, metalness: .75, roughness: .33 }),
  white: new THREE.MeshStandardMaterial({ color: 0xd5d9d3, metalness: .25, roughness: .42 }),
  wheel: new THREE.MeshStandardMaterial({ color: 0x101114, roughness: .83 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xef802f, roughness: .5 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xf2c839, roughness: .5 }),
  led: new THREE.MeshStandardMaterial({ color: 0xe9464c, emissive: 0xb41925, emissiveIntensity: 1.7, roughness: .35 }),
  lens: new THREE.MeshStandardMaterial({ color: 0x477d92, metalness: .62, roughness: .16 }),
};

function box(group: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  group.add(mesh);
  return mesh;
}

function rod(group: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material) {
  const direction = to.clone().sub(from);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 8), material);
  mesh.position.copy(from).add(to).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  group.add(mesh);
}

function barrel(group: THREE.Group, x: number, y: number, z: number, length: number, radius: number) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.08, length, 12, 1, true), materials.metal);
  mesh.position.set(x, y, z);
  mesh.rotation.x = Math.PI / 2;
  group.add(mesh);
  const muzzle = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * .2, 5, 12), materials.frame);
  muzzle.position.set(x, y, z - length / 2);
  group.add(muzzle);
}

function chassis(root: THREE.Group, width: number, depth: number, wheelSize = .12) {
  const group = new THREE.Group();
  group.name = "chassis";
  root.add(group);
  root.userData.driveable = true;
  root.userData.width = width;
  root.userData.depth = depth;
  root.userData.wheelRadius = wheelSize;
  box(group, width * .84, .075, depth * .87, 0, .26, 0, materials.frame);
  box(group, width * .7, .12, depth * .66, 0, .36, 0, materials.armour);
  for (const side of [-1, 1]) {
    box(group, .075, .075, depth, side * width * .46, .24, 0, materials.metal);
    box(group, width, .06, .065, 0, .25, side * depth * .47, materials.metal);
    box(group, width * .53, .13, .025, 0, .36, side * depth * .49, materials.armour);
    box(group, width * .4, .018, .012, 0, .42, side * (depth * .49 + .017), materials.led);
  }
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const wx = x * (width / 2 - .025), wz = z * (depth / 2 - .08);
    const wheel = new THREE.Group();
    wheel.name = `wheel-${x}-${z}`;
    wheel.position.set(wx, wheelSize, wz);
    group.add(wheel);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(wheelSize, wheelSize, .11, 24), materials.wheel);
    tyre.rotation.z = Math.PI / 2;
    wheel.add(tyre);
    for (const shift of [-.06, .06]) {
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(wheelSize * .62, wheelSize * .62, .012, 16), materials.metal);
      rim.rotation.z = Math.PI / 2;
      rim.position.x = shift;
      wheel.add(rim);
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        const fastener = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .009, 6), materials.frame);
        fastener.rotation.z = Math.PI / 2;
        fastener.position.set(shift * 1.11, Math.sin(angle) * wheelSize * .43, Math.cos(angle) * wheelSize * .43);
        wheel.add(fastener);
      }
    }
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI / 5;
      const tread = box(wheel, .096, .018, .035, 0, Math.cos(angle) * wheelSize, Math.sin(angle) * wheelSize, materials.wheel);
      tread.rotation.x = angle;
    }
    box(group, .15, .17, .16, wx, .33, wz, materials.armour);
    rod(group, new THREE.Vector3(wx, .38, wz), new THREE.Vector3(wx * .76, .17, wz), .024, materials.metal);
    for (const dx of [-.045, .045]) {
      box(group, .016, .095, .055, wx + dx, .44, wz, materials.metal);
    }
  }
  for (const x of [-1, 1]) {
    const plate = box(group, .035, .22, depth * .53, x * width * .51, .39, 0, materials.armour);
    plate.rotation.z = x * -.12;
    box(group, .024, .036, depth * .42, x * width * .54, .42, 0, materials.led);
    for (const z of [-.19, .19]) box(group, .013, .02, .02, x * width * .54, .31, z, materials.metal);
    for (let i = 0; i < 7; i++) box(group, .028, .02, .025, x * width * .36, .45, (i-3)*.045, materials.metal);
  }
  box(group, width * .45, .06, depth * .38, 0, .43, .12, materials.frame);
}

function gimbal(root: THREE.Group, y: number) {
  const joint = new THREE.Group();
  joint.name = "gimbal";
  joint.position.y = y;
  root.add(joint);
  const body = new THREE.Group();
  body.position.y = -y;
  joint.add(body);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(.18, .2, .06, 24), materials.metal);
  joint.add(ring);
  return body;
}

function camera(group: THREE.Group, x: number, y: number, z: number) {
  box(group, .18, .15, .2, x, y, z, materials.frame);
  for (const dx of [-.075, .075]) box(group, .02, .115, .025, x + dx, y, z - .105, materials.metal);
  box(group, .16, .02, .22, x, y + .08, z, materials.armour);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .026, 12), materials.lens);
  lens.position.set(x, y, z - .11);
  lens.rotation.x = Math.PI / 2;
  group.add(lens);
}

function hero(group: THREE.Group, backup = false) {
  chassis(group, 1.06, .86, .145);
  group.userData.eyeHeight = 1.32;
  group = gimbal(group, .49);
  box(group, .58, .10, .58, 0, .49, 0, materials.metal);
  box(group, .65, .3, .55, 0, .68, -.07, materials.frame).rotation.x = -.12;
  box(group, .42, .33, .48, .12, .95, -.12, materials.armour).rotation.x = -.4;
  barrel(group, -.18, .98, -.4, .45, .115);
  box(group, .22, .22, .18, 0, 1.21, .18, materials.frame);
  camera(group, .25, 1.14, -.13);
  if (backup) {
    box(group, .34, .1, .14, -.16, 1.07, -.47, materials.yellow);
    box(group, .36, .09, .15, .02, 1.14, -.13, materials.yellow);
    for (const x of [-.39, .39]) box(group, .4, .07, .16, x, .45, .1, materials.white);
  }
}

function engineer(group: THREE.Group) {
  chassis(group, .78, .74, .13);
  group.userData.eyeHeight = 1.98;
  group = gimbal(group, .45);
  box(group, .34, .36, .35, 0, .55, 0, materials.frame);
  rod(group, new THREE.Vector3(-.22, .5, .14), new THREE.Vector3(-.22, 1.95, .14), .017, materials.metal);
  camera(group, -.22, 1.95, .10);
  rod(group, new THREE.Vector3(.05, .65, 0), new THREE.Vector3(.16, 1.13, -.22), .09, materials.armour);
  rod(group, new THREE.Vector3(.16, 1.13, -.22), new THREE.Vector3(.16, 1.21, -.68), .065, materials.armour);
  box(group, .35, .12, .38, .16, 1.13, -.56, materials.frame);
  rod(group, new THREE.Vector3(-.03, 1.12, -.74), new THREE.Vector3(-.03, 1.31, -.75), .02, materials.metal);
  rod(group, new THREE.Vector3(.34, 1.12, -.74), new THREE.Vector3(.34, 1.31, -.75), .02, materials.metal);
}

function infantry(group: THREE.Group, variant: "03" | "04") {
  chassis(group, variant === "03" ? .76 : .92, variant === "03" ? .74 : .8, variant === "03" ? .12 : .105);
  group.userData.eyeHeight = variant === "03" ? .97 : 1.08;
  group = gimbal(group, .48);
  box(group, .48, .12, .48, 0, .48, -.03, materials.metal);
  box(group, .28, variant === "03" ? .28 : .36, .3, 0, .66, -.05, materials.frame);
  camera(group, .18, .86, -.02);
  barrel(group, -.12, variant === "03" ? .78 : .94, -.31, variant === "03" ? .32 : .46, .052);
  if (variant === "03") {
    for (const x of [-.3, .3]) for (const z of [-.26, .26])
      box(group, .18, .18, .2, x, .48, z, materials.white);
  } else {
    box(group, .42, .17, .16, 0, .52, .28, materials.frame);
    box(group, .28, .13, .32, 0, .94, .12, materials.armour);
  }
}

function infantryBackup(group: THREE.Group) {
  infantry(group, "03");
  // The 03 spare uses a low tracked support and an articulated side wheel.
  for (const x of [-.44, .44]) {
    box(group, .13, .22, .68, x, .21, 0, materials.armour);
    for (const z of [-.24, 0, .24]) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(.095, .095, .06, 12), materials.metal);
      roller.rotation.z = Math.PI / 2;
      roller.position.set(x, .115, z);
      group.add(roller);
    }
  }
  rod(group, new THREE.Vector3(.42, .38, -.2), new THREE.Vector3(.83, .42, -.55), .065, materials.armour);
  const outrigger = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .08, 16), materials.wheel);
  outrigger.position.set(.83, .25, -.55);
  outrigger.rotation.z = Math.PI / 2;
  group.add(outrigger);
  rod(group, new THREE.Vector3(.18, .41, .17), new THREE.Vector3(.18, 1.15, .17), .025, materials.metal);
}

function sentry(group: THREE.Group) {
  chassis(group, .74, .66, .115);
  group.userData.eyeHeight = 1.49;
  group = gimbal(group, .48);
  box(group, .4, .5, .42, 0, .67, 0, materials.frame);
  box(group, .34, .14, .28, 0, .97, 0, materials.white);
  rod(group, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1.24, 0), .055, materials.metal);
  box(group, .55, .13, .37, 0, 1.33, -.03, materials.armour);
  barrel(group, -.18, 1.3, -.27, .38, .055);
  camera(group, .22, 1.37, -.15);
  camera(group, .02, 1.02, -.29);
}

function drone(group: THREE.Group) {
  const w = 1.5, h = .5, d = 1.2;
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2])
    rod(group, new THREE.Vector3(x, -.18, z), new THREE.Vector3(x, .38, z), .017, materials.frame);
  for (const y of [-.18, .38]) {
    for (const z of [-d / 2, d / 2])
      rod(group, new THREE.Vector3(-w / 2, y, z), new THREE.Vector3(w / 2, y, z), .018, materials.frame);
    for (const x of [-w / 2, w / 2])
      rod(group, new THREE.Vector3(x, y, -d / 2), new THREE.Vector3(x, y, d / 2), .018, materials.frame);
  }
  box(group, .3, .14, .35, 0, .04, 0, materials.frame);
  for (const x of [-.48, .48]) for (const z of [-.36, .36]) {
    rod(group, new THREE.Vector3(0, .04, 0), new THREE.Vector3(x, .04, z), .025, materials.metal);
    const rotor = new THREE.Mesh(new THREE.TorusGeometry(.19, .014, 4, 20), materials.armour);
    rotor.position.set(x, .08, z);
    rotor.rotation.x = Math.PI / 2;
    group.add(rotor);
  }
  camera(group, 0, -.04, -.3);
}

function dart(group: THREE.Group) {
  box(group, 1.15, .06, .82, 0, .12, 0, materials.metal);
  for (const x of [-.4, .4]) {
    rod(group, new THREE.Vector3(x, .14, .28), new THREE.Vector3(x, 1.05, .22), .035, materials.frame);
    rod(group, new THREE.Vector3(x, .14, -.32), new THREE.Vector3(x, .7, -.54), .035, materials.frame);
    rod(group, new THREE.Vector3(x, 1.05, .22), new THREE.Vector3(x, .7, -.54), .035, materials.metal);
  }
  for (const x of [-.26, 0, .26])
    rod(group, new THREE.Vector3(x, 1.05, .22), new THREE.Vector3(x, .7, -.54), .027, materials.white);
  box(group, .12, .17, .18, .26, .95, .12, materials.frame);
}

function radar(group: THREE.Group) {
  for (const x of [-.33, .33]) {
    for (const dz of [-.28, .28])
      rod(group, new THREE.Vector3(x, 1.28, 0), new THREE.Vector3(x + (dz > 0 ? .26 : -.26), .06, dz), .025, materials.frame);
    rod(group, new THREE.Vector3(x, .1, 0), new THREE.Vector3(x, 1.48, 0), .035, materials.metal);
    camera(group, x, 1.55, -.07);
    box(group, .21, .14, .14, x, 1.25, 0, materials.frame);
  }
}

export function createRobotPreview(kind: RobotPreviewKind): THREE.Group {
  const group = new THREE.Group();
  if (kind === "hero" || kind === "heroBackup") hero(group, kind === "heroBackup");
  else if (kind === "engineer") engineer(group);
  else if (kind === "infantryBackup") infantryBackup(group);
  else if (kind === "infantry03" || kind === "infantry04") infantry(group, kind === "infantry03" ? "03" : "04");
  else if (kind === "sentry") sentry(group);
  else if (kind === "air") drone(group);
  else if (kind === "dart") dart(group);
  else radar(group);
  // Combine fixed parts of each joint by material; wheels and gimbal remain independently animated.
  group.traverse(object => {
    const sets = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of [...object.children]) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) continue;
      const meshes = sets.get(child.material) ?? [];
      meshes.push(child);
      sets.set(child.material, meshes);
    }
    for (const [material, meshes] of sets) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map(mesh => {
        mesh.updateMatrix();
        return mesh.geometry.clone().applyMatrix4(mesh.matrix);
      });
      const merged = mergeGeometries(geometries);
      for (const geometry of geometries) geometry.dispose();
      if (!merged) continue;
      for (const mesh of meshes) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
      }
      object.add(new THREE.Mesh(merged, material));
    }
  });
  return group;
}

function numberPlates(robot: THREE.Group, number: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#191b1f";
  context.fillRect(0, 0, 128, 64);
  context.fillStyle = "#f3f2ec";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "bold 52px sans-serif";
  context.fillText(number, 64, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .65 });
  const width = robot.userData.width as number | undefined;
  const depth = robot.userData.depth as number | undefined;
  if (!width || !depth) { texture.dispose(); material.dispose(); return; }
  for (const side of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(width * .36, .14), material);
    plate.position.set(0, .35, side * (depth * .49 + .02));
    plate.rotation.y = side === 1 ? 0 : Math.PI;
    robot.add(plate);
  }
}

export function addRobotPreviews(field: THREE.Group, scene: THREE.Scene, terrain: ArenaTerrain) {
  const exhibit = new THREE.Group();
  exhibit.name = "tarsgo-2026-appearance-previews";
  const official = new Map(robotSeasons.find((season) => season.season === 2026)?.robots.map((robot) => [robot.id, robot]));
  field.updateMatrixWorld(true);
  for (const entry of ROBOT_PREVIEWS) {
    const photo = official.get(entry.id);
    if (!photo) throw new Error(`Missing TARS-Go 2026 reference photo: ${entry.id}`);
    const robot = createRobotPreview(entry.kind);
    robot.name = entry.id;
    const bounds = new THREE.Box3().setFromObject(robot);
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.hypot(size.x, size.z) / 2;
    robot.userData = { ...robot.userData, sourcePhoto: photo.image.medium, name: photo.name, prototype: true, radius };
    const ground = terrain.heightAt(entry.x, entry.z);
    if (!Number.isFinite(ground)) throw new Error("Robot placement outside CAD ground");
    robot.position.set(entry.x, ground - Math.min(0, bounds.min.y), entry.z);
    robot.rotation.y = -Math.PI / 2;
    if (entry.kind === "air") robot.position.y += 1.5;
    numberPlates(robot, photo.number);
    exhibit.add(robot);
  }
  scene.add(exhibit);
  return exhibit;
}
