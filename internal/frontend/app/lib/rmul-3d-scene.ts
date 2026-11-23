import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

import { FACILITIES, type FacilityId } from "./rmul-3d-facilities";

// The STL is the original user-provided mesh, verified against Git blob
// 4b35550ad7fc552ed76479ef01a7529b2598bd38 (3811 triangles).
// Facilities are schematic references, not models extracted from that STL.
const MODEL_URL = "/assets/pixel-jijia/rmul_2027.stl";
const center = (x: number, z: number) => new THREE.Vector3(x - 6.3, 0, z - 4.3);
const palette = {
  red: { body: 0xad383e, bright: 0xff736a },
  blue: { body: 0x325ea6, bright: 0x78bdff },
};
const steel = new THREE.MeshStandardMaterial({ color: 0x4c6168, metalness: .55, roughness: .42 });
const charcoal = new THREE.MeshStandardMaterial({ color: 0x26363c, metalness: .7, roughness: .34 });
const sand = new THREE.MeshStandardMaterial({ color: 0xbdb2a0, roughness: .88 });

function part(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material,
  x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function block(group: THREE.Group, width: number, height: number, depth: number,
  x: number, y: number, z: number, material: THREE.Material) {
  return part(group, new THREE.BoxGeometry(width, height, depth), material, x, y, z);
}
function cylinder(group: THREE.Group, top: number, bottom: number, height: number,
  x: number, y: number, z: number, material: THREE.Material, radial = 8) {
  return part(group, new THREE.CylinderGeometry(top, bottom, height, radial),
    material, x, y, z);
}
function ring(group: THREE.Group, radius: number, color: number, y: number, thickness = .03) {
  const mesh = part(group, new THREE.TorusGeometry(radius, thickness, 6, 48),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .35 }),
    0, y, 0);
  mesh.rotation.x = Math.PI / 2;
}

function baseModel(group: THREE.Group, color: { body: number; bright: number }) {
  const body = new THREE.MeshStandardMaterial({ color: color.body, metalness: .44, roughness: .38 });
  const light = new THREE.MeshStandardMaterial({
    color: color.bright, emissive: color.bright, emissiveIntensity: .85,
    metalness: .15, roughness: .36,
  });
  cylinder(group, .62, .74, .14, 0, .08, 0, charcoal);
  cylinder(group, .48, .58, .5, 0, .4, 0, body);
  cylinder(group, .36, .49, .16, 0, .72, 0, steel);
  cylinder(group, .3, .4, .1, 0, .83, 0, body);
  ring(group, .52, color.bright, .63, .035);
  ring(group, .37, color.bright, .87, .026);
  cylinder(group, .105, .125, .2, 0, 1.0, 0, light, 12);
  for (let k = 0; k < 8; k++) {
    const angle = k * Math.PI / 4;
    const plate = block(group, .22, .19, .055, Math.sin(angle) * .516, .45,
      Math.cos(angle) * .516, k % 2 === 0 ? light : steel);
    plate.rotation.y = angle;
    cylinder(group, .035, .035, .07, Math.sin(angle) * .58, .24,
      Math.cos(angle) * .58, light, 8);
  }
}

function outpostModel(group: THREE.Group, color: { body: number; bright: number }) {
  const body = new THREE.MeshStandardMaterial({ color: color.body, metalness: .5, roughness: .35 });
  const armor = new THREE.MeshStandardMaterial({
    color: color.bright, emissive: color.bright, emissiveIntensity: .6,
    metalness: .26, roughness: .28,
  });
  cylinder(group, .31, .4, .12, 0, .06, 0, steel);
  cylinder(group, .18, .22, .94, 0, .55, 0, body, 8);
  cylinder(group, .12, .12, .29, 0, 1.17, 0, steel, 12);
  ring(group, .24, color.bright, .96, .022);
  const rotor = new THREE.Group();
  rotor.position.y = .92;
  group.add(rotor);
  cylinder(rotor, .26, .26, .15, 0, 0, 0, charcoal, 12);
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI * 2 / 3;
    const plate = block(rotor, .27, .18, .045,
      Math.sin(a) * .28, .01, Math.cos(a) * .28, armor);
    plate.rotation.y = a;
  }
  cylinder(group, .19, .19, .12, 0, 1.36, 0, charcoal, 12);
  cylinder(group, .085, .12, .11, 0, 1.47, 0, armor, 12);
  group.userData.rotor = rotor;
}

function energyModel(group: THREE.Group, color: { body: number; bright: number }) {
  const shell = new THREE.MeshStandardMaterial({ color: color.body, metalness: .47, roughness: .42 });
  const glow = new THREE.MeshStandardMaterial({
    color: color.bright, emissive: color.bright, emissiveIntensity: .72,
    roughness: .3, metalness: .25,
  });
  block(group, 1.04, .08, .42, 0, .05, 0, charcoal);
  for (const dx of [-.34, 0, .34]) {
    const g = new THREE.Group();
    g.position.set(dx, .28, 0);
    group.add(g);
    part(g, new THREE.DodecahedronGeometry(.155), shell, 0, 0, 0);
    cylinder(g, .105, .105, .21, 0, 0, 0, glow, 6).rotation.z = Math.PI / 2;
    ring(g, .155, color.bright, -.03, .014);
    cylinder(g, .05, .05, .09, 0, .16, 0, steel, 6);
  }
}

function nameplate(text: string, color: string, x: number, y: number, z: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 80;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#142b32ec";
  context.fillRect(5, 4, 374, 70);
  context.strokeStyle = color;
  context.lineWidth = 4;
  context.strokeRect(5, 4, 374, 70);
  context.fillStyle = "#fff2dc";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "bold 32px system-ui, sans-serif";
  context.fillText(text, 192, 40);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: false,
  }));
  sprite.position.set(x, y, z);
  sprite.scale.set(1.5, .31, 1);
  return sprite;
}

function colorizeField(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i += 3) {
    const x = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3;
    const y = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
    const z = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;
    const side = Math.abs(normal.getY(i)) < .3;
    const boundary = x < 340 || x > 12260 || z < 340 || z > 8260;
    const hex = boundary ? (side ? 0x53676b : 0x83979a) :
      y > 350 ? (side ? 0x667a7d : 0xc6b69b) :
      y > 140 ? (side ? 0x8e8879 : 0xcbb590) :
      (side ? 0x849792 : 0x9aaba0);
    color.setHex(hex);
    for (let j = i; j < i + 3; j++)
      color.toArray(colors, j * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  // The CAD export has Y increasing downward: the full 520-mm backing
  // surface is the underside. Flip it to put the battlefield on top.
  geometry.scale(.001, -.001, .001);
  geometry.translate(-6.3, .52, -4.3);
  geometry.computeBoundingBox();
  return geometry;
}

export interface ArenaController {
  focus: (id: FacilityId | null) => void;
  dispose: () => void;
}
export function mountArena(host: HTMLDivElement, onSelect: (id: FacilityId) => void,
  onError: (message: string) => void, onReady: () => void): ArenaController {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101f28);
  scene.fog = new THREE.FogExp2(0x101f28, .025);

  const camera = new THREE.PerspectiveCamera(45, 1, .05, 100);
  camera.position.set(13, 11, 14);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label", "RMUL 2027 三维场地，可拖拽旋转、滚轮缩放、点击红蓝基地、前哨站及能量单元");
  renderer.domElement.setAttribute("role", "img");
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .08;
  controls.enablePan = true;
  controls.minDistance = 3;
  controls.maxDistance = 30;
  controls.maxPolarAngle = Math.PI * .49;
  controls.target.set(0, .18, 0);

  scene.add(new THREE.HemisphereLight(0xc4e2ec, 0x576760, 2.5));
  const sun = new THREE.DirectionalLight(0xffe6ba, 3.4);
  sun.position.set(-3, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -9;
  sun.shadow.normalBias = .025;
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 14), sand);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.06;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(19, 38, 0x617273, 0x617273);
  grid.position.y = -.055;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = .23;
  scene.add(grid);

  const raycastTargets: THREE.Object3D[] = [];
  const facilities = new Map<FacilityId, THREE.Group>();
  const rotors: THREE.Group[] = [];
  for (const item of FACILITIES) {
    const group = new THREE.Group();
    const p = center(item.x, item.z);
    group.position.set(p.x, item.y, p.z);
    group.userData.facilityId = item.id;
    const colors = palette[item.team];
    const highlight = new THREE.Mesh(new THREE.RingGeometry(.56, .6, 56),
      new THREE.MeshBasicMaterial({
        color: colors.bright, transparent: true, opacity: .85, side: THREE.DoubleSide,
        depthWrite: false,
      }));
    highlight.rotation.x = -Math.PI / 2;
    highlight.position.y = .025;
    group.add(highlight);
    if (item.kind === "base") baseModel(group, colors);
    if (item.kind === "outpost") {
      outpostModel(group, colors);
      rotors.push(group.userData.rotor as THREE.Group);
    }
    if (item.kind === "energy") energyModel(group, colors);
    group.add(nameplate(item.name, item.team === "red" ? "#f07c73" : "#83b6f8",
      0, item.kind === "outpost" ? 2.02 : item.kind === "base" ? 1.46 : .82, 0));
    scene.add(group);
    facilities.set(item.id, group);
    raycastTargets.push(group);
  }

  let disposed = false;
  new STLLoader().load(MODEL_URL, (geometry) => {
    if (disposed) { geometry.dispose(); return; }
    const mesh = new THREE.Mesh(colorizeField(geometry),
      new THREE.MeshStandardMaterial({
        vertexColors: true, flatShading: true, roughness: .87, metalness: .08,
        side: THREE.DoubleSide,
      }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    onReady();
  }, undefined, () => { if (!disposed) onError("无法加载原始三维场地模型"); });

  const resize = () => {
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const caster = new THREE.Raycaster();
  const cursor = new THREE.Vector2();
  let pointerStart = { x: 0, y: 0 };
  const down = (event: PointerEvent) => { pointerStart = { x: event.clientX, y: event.clientY }; };
  const up = (event: PointerEvent) => {
    if (Math.hypot(pointerStart.x - event.clientX, pointerStart.y - event.clientY) > 6) return;
    const bounds = renderer.domElement.getBoundingClientRect();
    cursor.set((event.clientX - bounds.left) / bounds.width * 2 - 1,
      -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    caster.setFromCamera(cursor, camera);
    for (const hit of caster.intersectObjects(raycastTargets, true)) {
      let node: THREE.Object3D | null = hit.object;
      while (node && !node.userData.facilityId) node = node.parent;
      if (node?.userData.facilityId) {
        onSelect(node.userData.facilityId as FacilityId);
        break;
      }
    }
  };
  renderer.domElement.addEventListener("pointerdown", down);
  renderer.domElement.addEventListener("pointerup", up);
  let frame = 0;
  const timer = new THREE.Clock();
  const render = () => {
    if (disposed) return;
    const time = timer.getElapsedTime();
    for (const rotor of rotors) rotor.rotation.y = time * .58;
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  };
  frame = requestAnimationFrame(render);

  return {
    focus(id) {
      const facility = id ? facilities.get(id) : undefined;
      const target = facility ? facility.position.clone() : new THREE.Vector3(0, .18, 0);
      if (facility) target.y += .6;
      controls.target.copy(target);
      camera.position.copy(target.clone().add(facility
        ? new THREE.Vector3(3.3, 4.3, 4.8) : new THREE.Vector3(13, 11, 14)));
      controls.update();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", up);
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) material.dispose();
        }
        if (object instanceof THREE.Sprite) {
          object.material.map?.dispose();
          object.material.dispose();
        }
      });
      steel.dispose(); charcoal.dispose(); sand.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
