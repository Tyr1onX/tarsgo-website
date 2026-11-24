import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { resolveCadModel } from "./rmul-3d-cad-assets";
import { addRobotPreviews } from "./rmuc-3d-robots";
import { createArenaTerrain, moveOnArena, nearestDriveable, supportedHeight, PLAYER_RADIUS, type ArenaTerrain } from "./rmuc-3d-terrain";
import { createStadium } from "./rmuc-3d-stadium";

export type FieldView = "all" | "red" | "blue" | "top";
export type ArenaView = FieldView | "first" | "third";
export type ArenaStatus = { view: ArenaView; robot: string | null; nearby: string | null };
export interface ArenaController {
  view: (side: ArenaView) => void;
  interact: () => void;
  input: (key: string, pressed: boolean) => void;
  dispose: () => void;
}

type Robot = { object: THREE.Group; position: THREE.Vector3; radius: number; driveable: boolean; name: string; eyeHeight: number; wheelRadius: number };
const isPlaying = (view: ArenaView) => view === "first" || view === "third";

function createPlayer() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0x283a4b, roughness: .82 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x171d25, roughness: .8 });
  function part(geometry: THREE.BufferGeometry, y: number, x = 0, mat = material) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, 0);
    group.add(mesh);
  }
  part(new THREE.CapsuleGeometry(.13, .32, 4, 8), .92);
  part(new THREE.SphereGeometry(.135, 12, 8), 1.47, 0, dark);
  for (const x of [-.09, .09]) part(new THREE.CapsuleGeometry(.065, .48, 4, 6), .36, x, dark);
  return group;
}

export function mountArena(
  host: HTMLDivElement,
  onBusy: () => void,
  onReady: () => void,
  onError: (message: string) => void,
  onStatus: (status: ArenaStatus) => void,
): ArenaController {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111922);
  scene.fog = new THREE.Fog(0x111922, 29, 83);
  const camera = new THREE.PerspectiveCamera(64, 1, .025, 130);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "RMUC 2027 三维战场");
  host.appendChild(canvas);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = .12;
  controls.enablePan = true;
  controls.enabled = false;
  scene.add(new THREE.HemisphereLight(0xdceaff, 0x50515b, 2.15));
  const sun = new THREE.DirectionalLight(0xfff4e7, 2.8);
  sun.position.set(-6, 13, 9);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(47, 36),
    new THREE.MeshStandardMaterial({ color: 0x202b35, roughness: .85 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.06;
  scene.add(ground);
  const player = createPlayer();
  player.visible = false;
  scene.add(player);
  const stadium = createStadium();
  scene.add(stadium);

  let disposed = false, ready = false, frame = 0;
  let map: THREE.Group | null = null;
  let exhibit: THREE.Group | null = null;
  let terrain: ArenaTerrain | null = null;
  let robots: Robot[] = [];
  let driving: Robot | null = null;
  let mode: ArenaView = "first";
  let lastPerspective: "first" | "third" = "first";
  let yaw = -.7, pitch = -.08;
  let lastTime: number | null = null;
  let lastStatus = "";
  const keys = new Set<string>();
  const clock = new THREE.Vector3(), forward = new THREE.Vector3(), eye = new THREE.Vector3(), desired = new THREE.Vector3();
  const abort = new AbortController();

  const nearby = () => ready && !driving && isPlaying(mode) ? nearestDriveable(player.position, robots) : null;
  function publish() {
    const status = { view: mode, robot: driving?.name ?? null, nearby: nearby()?.name ?? null };
    const signature = JSON.stringify(status);
    if (signature !== lastStatus) { lastStatus = signature; onStatus(status); }
  }

  function invalidate() {
    if (!disposed && !frame) frame = requestAnimationFrame(render);
  }

  function updateVisibility() {
    player.visible = ready && !driving && mode !== "first";
    for (const robot of robots) robot.object.visible = mode !== "first" || driving !== robot;
  }

  function syncCamera() {
    if (!ready || !terrain || !isPlaying(mode)) return;
    const target = driving?.position ?? player.position;
    const h = driving?.eyeHeight ?? 1.6;
    forward.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    eye.copy(target).y += h;
    camera.up.set(0, 1, 0);
    if (mode === "first") {
      camera.position.copy(eye);
      camera.lookAt(clock.copy(eye).add(forward));
    } else {
      // Shorten the follow camera before it crosses a CAD obstruction.
      desired.copy(eye).addScaledVector(forward, driving ? -3.4 : -3.1);
      desired.y += driving ? .85 : .7;
      const safe = terrain.cameraDistance(eye, desired);
      camera.position.copy(eye).add(desired.sub(eye).normalize().multiplyScalar(safe));
      camera.lookAt(clock.copy(eye).addScaledVector(forward, 1.2));
    }
    if (driving) {
      const gimbal = driving.object.getObjectByName("gimbal");
      if (gimbal) gimbal.rotation.y = yaw - driving.object.rotation.y;
    } else {
      player.rotation.y = yaw;
    }
    updateVisibility();
  }

  function render(time: number) {
    frame = 0;
    if (disposed) return;
    if (ready && terrain && isPlaying(mode)) {
      const dt = lastTime === null ? 0 : Math.min(.05, (time - lastTime) / 1000);
      const f = Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown"));
      const r = Number(keys.has("KeyD") || keys.has("ArrowRight")) - Number(keys.has("KeyA") || keys.has("ArrowLeft"));
      if (f || r) {
        const target = driving?.position ?? player.position;
        const radius = driving?.radius ?? PLAYER_RADIUS;
        const speed = driving ? 2.6 : keys.has("ShiftLeft") || keys.has("ShiftRight") ? 3.6 : 2.2;
        const norm = Math.hypot(f, r);
        const dx = (-Math.sin(yaw) * f + Math.cos(yaw) * r) * speed * dt / norm;
        const dz = (-Math.cos(yaw) * f - Math.sin(yaw) * r) * speed * dt / norm;
        const oldX = target.x, oldZ = target.z;
        moveOnArena(terrain, target, dx, dz, radius, driving ? .23 : .34,
          robots.filter(robot => robot !== driving && Math.abs(robot.position.y - target.y) < 1.15));
        const traveled = Math.hypot(target.x - oldX, target.z - oldZ);
        if (driving && traveled > .00001) {
          driving.object.rotation.y = Math.atan2(-(target.x - oldX), -(target.z - oldZ));
          const direction = f < 0 && !r ? -1 : 1;
          driving.object.traverse(object => {
            if (object.name.startsWith("wheel-")) object.rotation.x += direction * traveled / driving!.wheelRadius;
          });
        }
        lastTime = time;
        invalidate();
      } else lastTime = null;
      syncCamera();
      publish();
    } else if (controls.enabled) controls.update();
    renderer.render(scene, camera);
  }

  function setView(next: ArenaView) {
    if (!ready) return;
    keys.clear();
    lastTime = null;
    mode = next;
    if (isPlaying(next)) {
      lastPerspective = next as "first" | "third";
      controls.enabled = false;
      camera.fov = 64;
      syncCamera();
      canvas.focus({ preventScroll: true });
    } else {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      controls.enabled = true;
      camera.fov = 48;
      const distance = Math.max(29, 38 / Math.max(.7, camera.aspect));
      const x = next === "red" ? 7 : next === "blue" ? -7 : 0;
      controls.target.set(x, .65, 0);
      if (next === "top") {
        camera.up.set(0, 0, -1);
        camera.position.set(x, distance, .001);
      } else {
        camera.up.set(0, 1, 0);
        const side = next === "red" ? 1 : next === "blue" ? -1 : 1;
        const d = next === "all" ? distance : distance * .64;
        camera.position.set(x + side * d * .4, d * .72, d * .68);
      }
      controls.minDistance = 2.5;
      controls.maxDistance = 100;
      controls.update();
    }
    camera.updateProjectionMatrix();
    updateVisibility();
    publish();
    invalidate();
  }

  function interact() {
    if (!ready || !terrain || !isPlaying(mode)) return;
    if (driving) {
      const robot = driving;
      for (let i = 0; i < 12; i++) {
        const angle = yaw + i * Math.PI / 6;
        const distance = robot.radius + PLAYER_RADIUS + .16;
        const x = robot.position.x + Math.cos(angle) * distance, z = robot.position.z + Math.sin(angle) * distance;
        const y = supportedHeight(terrain, x, z, PLAYER_RADIUS, robot.position.y, .48);
        if (y === null || robots.some(other => other !== robot && Math.abs(other.position.y - y) < 1.15
          && Math.hypot(x - other.position.x, z - other.position.z) < PLAYER_RADIUS + other.radius)) continue;
        player.position.set(x, y, z);
        driving = null;
        break;
      }
    } else {
      const robot = nearby();
      if (robot) {
        driving = robot;
        yaw = robot.object.rotation.y;
        pitch = -.05;
      }
    }
    syncCamera();
    publish();
    invalidate();
  }

  const movement = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight"]);
  function input(key: string, pressed: boolean) {
    if (!movement.has(key)) return;
    if (!pressed) keys.delete(key);
    else if (ready && isPlaying(mode)) keys.add(key);
    invalidate();
  }

  function keydown(event: KeyboardEvent) {
    if (!ready || event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (movement.has(event.code) && isPlaying(mode)) {
      event.preventDefault();
      input(event.code, true);
    } else if (!event.repeat && event.code === "KeyE") interact();
    else if (!event.repeat && event.code === "KeyV") setView(isPlaying(mode) && mode === "first" ? "third" : "first");
    else if (!event.repeat && event.code === "KeyM") setView(isPlaying(mode) ? "all" : lastPerspective);
  }
  function keyup(event: KeyboardEvent) { input(event.code, false); }
  function clearInput() { keys.clear(); lastTime = null; }
  function turn(dx: number, dy: number) {
    if (!ready || !isPlaying(mode)) return;
    yaw -= dx * .0035;
    pitch = THREE.MathUtils.clamp(pitch - dy * .0035, -1.16, 1.16);
    invalidate();
  }
  let drag: { id: number; x: number; y: number } | null = null;
  function pointerdown(event: PointerEvent) {
    if (!ready || !isPlaying(mode) || event.button !== 0) return;
    canvas.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  }
  function pointermove(event: PointerEvent) {
    if (document.pointerLockElement === canvas || drag?.id !== event.pointerId) return;
    turn(event.clientX - drag.x, event.clientY - drag.y);
    drag.x = event.clientX; drag.y = event.clientY;
  }
  function pointerup(event: PointerEvent) { if (drag?.id === event.pointerId) drag = null; }
  function lock() {
    if (ready && isPlaying(mode) && canvas.requestPointerLock) {
      try { const result = canvas.requestPointerLock(); if (result) void result.catch(() => {}); } catch { /* drag remains available */ }
    }
  }
  function mousemove(event: MouseEvent) {
    if (document.pointerLockElement === canvas) turn(event.movementX, event.movementY);
  }
  function lockchange() { if (document.pointerLockElement !== canvas) clearInput(); }

  controls.addEventListener("change", invalidate);
  const resize = () => {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    invalidate();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  canvas.addEventListener("pointerdown", pointerdown);
  canvas.addEventListener("pointermove", pointermove);
  canvas.addEventListener("pointerup", pointerup);
  canvas.addEventListener("pointercancel", pointerup);
  canvas.addEventListener("lostpointercapture", pointerup);
  canvas.addEventListener("dblclick", lock);
  document.addEventListener("mousemove", mousemove);
  document.addEventListener("pointerlockchange", lockchange);
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  window.addEventListener("blur", clearInput);
  onBusy();

  void (async () => {
    const asset = await resolveCadModel("rmucField");
    const response = await fetch(asset.url, { signal: abort.signal });
    if (!response.ok) throw new Error("CAD asset unavailable");
    const payload = await response.arrayBuffer();
    const signature = new Uint8Array(payload, 0, 2);
    const bytes = signature[0] === 0x1f && signature[1] === 0x8b
      ? await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()
      : payload;
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    if (actual !== asset.sha256) throw new Error("CAD mesh integrity mismatch");
    if (disposed) return;
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes, "");
    if (disposed) { disposeObjects(gltf.scene); return; }
    const root = new THREE.Group();
    root.add(gltf.scene);
    root.rotation.x = -Math.PI / 2;
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const middle = bounds.getCenter(new THREE.Vector3());
    root.position.set(-middle.x, -bounds.min.y, -middle.z);
    root.updateMatrixWorld(true);
    map = root;
    scene.add(root);
    terrain = createArenaTerrain(root);
    exhibit = addRobotPreviews(map, scene, terrain);
    robots = exhibit.children.map(object => {
      const group = object as THREE.Group;
      return { object: group, position: group.position, radius: group.userData.radius,
        driveable: group.userData.driveable === true, name: group.userData.name,
        eyeHeight: group.userData.eyeHeight ?? 1, wheelRadius: group.userData.wheelRadius ?? .12 };
    });
    player.position.set(-10, terrain.heightAt(-10, -1.25), -1.25);
    ready = true;
    setView("first");
    onReady();
  })().catch(() => {
    if (!disposed) onError("三维场地加载失败，请刷新重试");
  });

  return {
    view: setView, interact, input,
    dispose() {
      disposed = true;
      abort.abort();
      clearInput();
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      canvas.removeEventListener("pointerdown", pointerdown);
      canvas.removeEventListener("pointermove", pointermove);
      canvas.removeEventListener("pointerup", pointerup);
      canvas.removeEventListener("pointercancel", pointerup);
      canvas.removeEventListener("lostpointercapture", pointerup);
      canvas.removeEventListener("dblclick", lock);
      document.removeEventListener("mousemove", mousemove);
      document.removeEventListener("pointerlockchange", lockchange);
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", clearInput);
      controls.removeEventListener("change", invalidate);
      controls.dispose();
      disposeObjects(scene);
      renderer.dispose();
      canvas.remove();
    },
  };
}

function disposeObjects(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      if (object instanceof THREE.InstancedMesh) object.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    } else if (object instanceof THREE.Sprite) materials.add(object.material);
  });
  for (const material of materials) {
    if (material instanceof THREE.MeshStandardMaterial) {
      for (const texture of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap]) if (texture) textures.add(texture);
    } else if (material instanceof THREE.SpriteMaterial && material.map) textures.add(material.map);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
  for (const geometry of geometries) geometry.dispose();
}
