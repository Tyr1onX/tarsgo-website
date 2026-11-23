import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { resolveCadModel } from "./rmul-3d-cad-assets";
import { addRobotPreviews } from "./rmuc-3d-robots";

export type FieldView = "all" | "red" | "blue" | "top";
export interface ArenaController {
  view: (side: FieldView) => void;
  dispose: () => void;
}

export function mountArena(
  host: HTMLDivElement,
  onBusy: () => void,
  onReady: () => void,
  onError: (message: string) => void,
): ArenaController {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x13232d);
  const camera = new THREE.PerspectiveCamera(45, 1, .02, 250);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.role = "img";
  renderer.domElement.setAttribute("aria-label", "RMUC 2027 三维战场及 TARS-Go 2026 机器人外形草模，可拖动旋转或双指缩放");
  host.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .075;
  controls.enablePan = true;
  controls.maxPolarAngle = Math.PI;
  scene.add(new THREE.HemisphereLight(0xd8e5ee, 0x65737a, 2.1));
  const sun = new THREE.DirectionalLight(0xffedd7, 3.1);
  sun.position.set(-6, 13, 9);
  scene.add(sun);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0x475c60, roughness: .92 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  let disposed = false;
  let frame = 0;
  let span = 28;
  let height = 2;
  let map: THREE.Group | null = null;
  let robots: THREE.Group | null = null;

  const render = () => {
    frame = 0;
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
  };
  const invalidate = () => {
    if (!disposed && !frame) frame = requestAnimationFrame(render);
  };
  controls.addEventListener("change", invalidate);

  const fitCamera = (side: FieldView = "all") => {
    const distance = span * (side === "all" ? 1.08 : side === "top" ? 1.25 : .67);
    const x = side === "red" ? -span * .25 : side === "blue" ? span * .25 : 0;
    controls.target.set(x, height * .35, 0);
    if (side === "top") {
      camera.up.set(0, 0, -1);
      camera.position.set(x, controls.target.y + distance, .001);
    } else {
      camera.up.set(0, 1, 0);
      const sign = side === "blue" ? -1 : 1;
      camera.position.set(x + sign * distance * .57, controls.target.y + distance * .8, sign * distance * .78);
    }
    camera.near = Math.max(.01, span / 750);
    camera.far = Math.max(80, span * 10);
    camera.updateProjectionMatrix();
    controls.minDistance = Math.max(.2, span * .06);
    controls.maxDistance = span * 4;
    controls.update();
    invalidate();
  };

  const resize = () => {
    renderer.setSize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
    camera.aspect = Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight);
    camera.updateProjectionMatrix();
    invalidate();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  onBusy();

  void (async () => {
    const asset = await resolveCadModel("rmucField");
    const response = await fetch(asset.url);
    if (!response.ok) throw new Error("CAD asset unavailable");
    const payload = await response.arrayBuffer();
    const signature = new Uint8Array(payload, 0, 2);
    const bytes = signature[0] === 0x1f && signature[1] === 0x8b
      ? await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()
      : payload;
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (actual !== asset.sha256) throw new Error("CAD mesh integrity mismatch");
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.parseAsync(bytes, "");
    if (disposed) return;

    const root = new THREE.Group();
    root.add(gltf.scene);
    root.rotation.x = -Math.PI / 2;
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const middle = bounds.getCenter(new THREE.Vector3());
    root.position.set(-middle.x, -bounds.min.y, -middle.z);
    root.updateMatrixWorld(true);
    map = root;
    scene.add(map);
    const size = new THREE.Box3().setFromObject(map).getSize(new THREE.Vector3());
    span = Math.max(size.x, size.z, size.y * 1.5);
    height = size.y;
    ground.scale.set(span * 1.25, span * 1.25, 1);
    ground.position.y = -span * .002;

    robots = addRobotPreviews(map, scene);
    fitCamera("all");
    render();
    onReady();
  })().catch(() => {
    if (!disposed) onError("三维场地加载失败，请刷新页面重试");
  });

  return {
    view: fitCamera,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.removeEventListener("change", invalidate);
      controls.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      for (const root of [map, robots, ground]) {
        root?.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            geometries.add(object.geometry);
            for (const material of (Array.isArray(object.material) ? object.material : [object.material]))
              materials.add(material);
          } else if (object instanceof THREE.Sprite) {
            materials.add(object.material);
          }
        });
      }
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial) {
          if (material.map) textures.add(material.map);
          if (material.normalMap) textures.add(material.normalMap);
          if (material.roughnessMap) textures.add(material.roughnessMap);
        } else if (material instanceof THREE.SpriteMaterial && material.map) {
          textures.add(material.map);
        }
        material.dispose();
      }
      for (const texture of textures) texture.dispose();
      for (const geometry of geometries) geometry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
