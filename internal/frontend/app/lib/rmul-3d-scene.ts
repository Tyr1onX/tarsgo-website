import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CAD_MODELS, resolveCadModel, type CadModelId } from "./rmul-3d-cad-assets";

export type FieldView = "all" | "red" | "blue";
export interface ArenaController {
  show: (id: CadModelId) => void;
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
  const camera = new THREE.PerspectiveCamera(45, 1, .01, 200);
  camera.position.set(14, 13, 16);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.role = "img";
  renderer.domElement.setAttribute(
    "aria-label", "2027 官方 CAD 三维模型。使用鼠标拖拽或触屏旋转，滚轮或双指缩放。",
  );
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
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(1, 20, 0x8ba5a8, 0x668086);
  scene.add(grid);

  let disposed = false;
  let requested = 0;
  let active: THREE.Group | null = null;
  let activeId: CadModelId | null = null;
  let span = 12.6;
  let height = .52;
  let frame = 0;
  const loader = new GLTFLoader();
  const cached = new Map<CadModelId, Promise<THREE.Group>>();
  const loaded = new Set<THREE.Group>();

  const disposeTree = (root: THREE.Object3D) => {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.map?.dispose();
          material.normalMap?.dispose();
          material.roughnessMap?.dispose();
        }
        material.dispose();
      }
    });
  };

  const fitCamera = (side: FieldView = "all") => {
    const distance = Math.max(.24, span * (side === "all" ? 1.7 : .85));
    controls.target.set(
      side === "all" ? 0 : side === "red" ? -span * .22 : span * .22,
      height * .32, 0,
    );
    const sign = side === "blue" ? -1 : 1;
    camera.position.set(
      controls.target.x + sign * distance * .75,
      controls.target.y + distance * .8,
      sign * distance * .95,
    );
    camera.near = Math.max(.0005, span / 600);
    camera.far = Math.max(30, span * 18);
    camera.updateProjectionMatrix();
    controls.minDistance = Math.max(.045, span * .16);
    controls.maxDistance = Math.max(.65, span * 5);
    controls.update();
  };

  const load = (id: CadModelId): Promise<THREE.Group> => {
    const local = "url" in CAD_MODELS[id];
    const old = cached.get(id);
    if (old) return old;
    // The source-derived 2027 whole-field / equipment meshes are loaded
    // separately on demand. Verify their catalog hash after decompression.
    const promise = resolveCadModel(id).then(async (asset) => {
      const response = await fetch(asset.url);
      if (!response.ok) throw new Error("CAD asset unavailable");
      const payload = await response.arrayBuffer();
      const signature = new Uint8Array(payload, 0, 2);
      const bytes = signature[0] === 0x1f && signature[1] === 0x8b
        ? await new Response(
          new Blob([payload]).stream().pipeThrough(new DecompressionStream("gzip")),
        ).arrayBuffer()
        : payload;
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const actualHash = Array.from(new Uint8Array(digest),
        (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (actualHash !== asset.sha256) throw new Error("2027 CAD mesh integrity mismatch");
      return loader.parseAsync(bytes, "");
    }).then((gltf) => {
      const root = new THREE.Group();
      root.add(gltf.scene);
      // Release package "full-map" and RMUC "base" use right-handed Z-up.
      // WebGL/Three.js uses Y-up; this is a rigid coordinate transform only.
      root.rotation.x = -Math.PI / 2;
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const mid = box.getCenter(new THREE.Vector3());
      root.position.set(-mid.x, -box.min.y, -mid.z);
      root.updateMatrixWorld(true);
      loaded.add(root);
      if (disposed) disposeTree(root);
      return root;
    });
    if (local) cached.set(id, promise);
    return promise;
  };

  const show = (id: CadModelId) => {
    const request = ++requested;
    onBusy();
    void load(id).then((root) => {
      if (disposed || request !== requested) {
        if (!("url" in CAD_MODELS[id]) && !disposed) {
          loaded.delete(root);
          disposeTree(root);
        }
        return;
      }
      if (active) {
        scene.remove(active);
        if (activeId && !("url" in CAD_MODELS[activeId])) {
          loaded.delete(active);
          disposeTree(active);
        }
      }
      active = root;
      activeId = id;
      scene.add(root);
      const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
      span = Math.max(size.x, size.z, size.y * 1.5);
      height = size.y;
      const groundSize = span * 1.25;
      ground.scale.set(groundSize, groundSize, 1);
      ground.position.y = -Math.max(.001, span * .002);
      grid.scale.setScalar(groundSize);
      grid.position.y = ground.position.y + .0005;
      fitCamera();
      onReady();
    }).catch(() => {
      if (disposed || request !== requested) return;
      onError("三维 CAD 模型加载失败，请重新选择或检查模型来源");
    });
  };

  const resize = () => {
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  const draw = () => {
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(draw);
  };
  draw();
  show("field");

  return {
    show,
    view: fitCamera,
    dispose() {
      disposed = true;
      requested++;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      for (const root of loaded) disposeTree(root);
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      grid.geometry.dispose();
      for (const material of (Array.isArray(grid.material) ? grid.material : [grid.material])) material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
