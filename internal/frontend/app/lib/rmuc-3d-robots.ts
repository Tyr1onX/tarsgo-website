import * as THREE from "three";
import { robotSeasons } from "../data/robot-seasons.ts";

// The 2026 photographs are appearance references, not 2027 robot CAD.
// These are exhibition placements, NOT official competition spawn points.
export const ROBOT_PREVIEWS = [
  { id: "2026-hero-01", kind: "hero", x: -11.4, z: -4.7 },
  { id: "2026-engineering-02", kind: "engineer", x: -9.2, z: -4.7 },
  { id: "2026-infantry-03", kind: "infantry03", x: -7, z: -4.7 },
  { id: "2026-infantry-04", kind: "infantry04", x: -4.8, z: -4.7 },
  { id: "2026-sentinel-07", kind: "sentry", x: -2.6, z: -4.7 },
  { id: "2026-hero-01-backup", kind: "heroBackup", x: -11.4, z: 4.7 },
  { id: "2026-infantry-03-backup", kind: "infantryBackup", x: -9.2, z: 4.7 },
  { id: "2026-air-06", kind: "air", x: -7, z: 4.7 },
  { id: "2026-dart-08", kind: "dart", x: -4.8, z: 4.7 },
  { id: "2026-radar-09", kind: "radar", x: -2.6, z: 4.7 },
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

function chassis(group: THREE.Group, width: number, depth: number, wheelSize = .12) {
  box(group, width, .13, depth, 0, .26, 0, materials.frame);
  box(group, width * .8, .12, depth * .75, 0, .36, 0, materials.armour);
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const wx = x * (width / 2 - .02), wz = z * (depth / 2 - .08);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(wheelSize, wheelSize, .12, 16), materials.wheel);
    tyre.rotation.z = Math.PI / 2;
    tyre.position.set(wx, wheelSize + .025, wz);
    group.add(tyre);
    for (const shift of [-.067, .067]) {
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(wheelSize * .52, wheelSize * .52, .012, 12), materials.metal);
      rim.rotation.z = Math.PI / 2;
      rim.position.set(wx + shift, wheelSize + .025, wz);
      group.add(rim);
    }
    box(group, .15, .2, .16, wx, .34, wz, materials.armour);
  }
  for (const x of [-1, 1]) {
    box(group, .12, .2, depth * .44, x * width * .48, .39, 0, materials.armour);
    box(group, .024, .045, depth * .36, x * width * .55, .39, 0, materials.orange);
  }
}

function camera(group: THREE.Group, x: number, y: number, z: number) {
  box(group, .18, .15, .2, x, y, z, materials.frame);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .026, 12), materials.lens);
  lens.position.set(x, y, z - .11);
  lens.rotation.x = Math.PI / 2;
  group.add(lens);
}

function hero(group: THREE.Group, backup = false) {
  chassis(group, 1.06, .86, .145);
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
  return group;
}

function numberLabel(number: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 80;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#172026dc";
  context.fillRect(12, 12, 136, 54);
  context.strokeStyle = "#d6b673";
  context.lineWidth = 3;
  context.strokeRect(12, 12, 136, 54);
  context.fillStyle = "#f0e8d5";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "bold 33px sans-serif";
  context.fillText(number, 80, 41);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.scale.set(.58, .3, 1);
  return sprite;
}

export function addRobotPreviews(field: THREE.Group, scene: THREE.Scene) {
  const exhibit = new THREE.Group();
  exhibit.name = "tarsgo-2026-appearance-previews";
  const official = new Map(robotSeasons.find((season) => season.season === 2026)?.robots.map((robot) => [robot.id, robot]));
  field.updateMatrixWorld(true);
  const floor = field.getObjectByName("floor_0_source_24844_0");
  const fallbackY = new THREE.Box3().setFromObject(field).min.y + 1.9;

  for (const entry of ROBOT_PREVIEWS) {
    const photo = official.get(entry.id);
    if (!photo) throw new Error(`Missing TARS-Go 2026 reference photo: ${entry.id}`);
    const robot = createRobotPreview(entry.kind);
    robot.name = entry.id;
    robot.userData = { sourcePhoto: photo.image.medium, name: photo.name, prototype: true };
    const ray = new THREE.Raycaster(new THREE.Vector3(entry.x, 12, entry.z), new THREE.Vector3(0, -1, 0));
    const hit = floor && ray.intersectObject(floor, true)[0];
    robot.position.set(entry.x, hit?.point.y ?? fallbackY, entry.z);
    robot.rotation.y = -Math.PI / 2;
    if (entry.kind === "air") robot.position.y += 1.5;
    const top = new THREE.Box3().setFromObject(robot).max.y - robot.position.y;
    const label = numberLabel(photo.number);
    if (label) {
      label.position.set(0, top + .22, 0);
      robot.add(label);
    }
    exhibit.add(robot);
  }
  scene.add(exhibit);
  return exhibit;
}
