import * as THREE from "three";
import { FIELD_HALF_X, FIELD_HALF_Z } from "./rmuc-3d-terrain";

export function createStadium() {
  const stadium = new THREE.Group();
  stadium.name = "arena-stadium";
  const steel = new THREE.MeshStandardMaterial({ color: 0x26333e, metalness: .6, roughness: .54 });
  const wall = new THREE.MeshStandardMaterial({ color: 0x17222d, roughness: .92 });
  const seat = new THREE.MeshStandardMaterial({ color: 0x37434d, roughness: .9 });
  const red = new THREE.MeshStandardMaterial({ color: 0xa72b39, emissive: 0x8a1824, emissiveIntensity: .85, roughness: .45 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x2454ad, emissive: 0x1b499f, emissiveIntensity: .95, roughness: .45 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe6edf5, emissive: 0xc5d9ff, emissiveIntensity: 2.2 });
  const clear = new THREE.MeshStandardMaterial({ color: 0x9ac2dc, transparent: true, opacity: .14, roughness: .19, metalness: .05, depthWrite: false });
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const parts = new Map<THREE.Material, THREE.Matrix4[]>();
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), quaternion = new THREE.Quaternion();
  function box(material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) {
    matrix.compose(position.set(x,y,z), quaternion, scale.set(w,h,d));
    const list = parts.get(material) ?? [];
    list.push(matrix.clone());
    parts.set(material, list);
  }

  // The transparent panels, rails and corner columns match the physical
  // locomotion boundary; the stands themselves remain outside the field.
  for (const sign of [-1, 1]) {
    const z = sign * (FIELD_HALF_Z + .055);
    box(steel, 0, .22, z, 28.2, .42, .11);
    box(clear, 0, 1.07, z, 28.2, 1.28, .045);
    box(steel, 0, 1.73, z, 28.2, .065, .075);
    for (let x = -14; x <= 14; x += 2) box(steel, x, .96, z, .075, 1.62, .085);
    for (const side of [-1, 1]) box(side === 1 ? red : blue, side * 7, .38, z - sign * .07, 13.75, .045, .035);
    const x = sign * (FIELD_HALF_X + .055);
    box(steel, x, .22, 0, .11, .42, 15);
    box(clear, x, 1.07, 0, .045, 1.28, 15);
    box(steel, x, 1.73, 0, .075, .065, 15);
    for (let iz = -7.5; iz <= 7.5; iz += 1.875) box(steel, x, .96, iz, .085, 1.62, .075);
    box(sign === 1 ? red : blue, x - sign * .08, .38, 0, .035, .045, 14.9);
  }

  for (const side of [-1, 1]) {
    box(wall, 0, 3.3, side * 16.5, 42, 6.6, .5);
    box(wall, side * 21.3, 3.3, 0, .5, 6.6, 33);
    box(steel, 0, .05, side * 11.6, 42, .1, 8.1);
    box(steel, side * 17.5, .05, 0, 7.2, .1, 33);
    // Tiered seating and walkways, built as instanced repeating parts.
    for (let row = 0; row < 5; row++) {
      const z = side * (10.3 + row * 1.08), y = .28 + row * .42;
      box(steel, 0, y / 2, z, 39, y, 1.04);
      for (let i = -18; i <= 18; i++) {
        if (Math.abs(i) % 9 === 0) continue;
        box(seat, i, y + .2, z, .76, .22, .56);
        box(seat, i, y + .45, z + side * .28, .76, .5, .12);
      }
      box(steel, 0, y + .38, z + side * .49, 39, .045, .035);
    }
    for (const x of [-20, -10, 0, 10, 20]) {
      box(steel, x, 3.2, side * 16.1, .42, 6.4, .45);
      box(white, x, 5.9, side * 13.4, 1.5, .07, .24);
      box(steel, x, 6.15, side * 13.4, 2.4, .35, .45);
    }
    box(steel, 0, 6.5, side * 15.6, 42, .36, .6);
    box(steel, side * 20.9, 6.5, 0, .6, .36, 32);
    box(side === 1 ? red : blue, side * 20.9, 4.35, 0, .1, .12, 29);
    // Scoreboard shells without invented game data.
    box(steel, side * 20.8, 3.4, 0, .3, 2.35, 8.6);
    box(wall, side * 20.6, 3.4, 0, .15, 2.03, 8.2);
    box(side === 1 ? red : blue, side * 20.48, 2.39, 0, .08, .055, 8.2);
  }
  for (const [material, matrices] of parts) {
    const mesh = new THREE.InstancedMesh(cube, material, matrices.length);
    matrices.forEach((transform, index) => mesh.setMatrixAt(index, transform));
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    stadium.add(mesh);
  }
  const redLight = new THREE.PointLight(0xff344b, 18, 13, 2);
  redLight.position.set(13, 4.6, 0);
  const blueLight = new THREE.PointLight(0x477dff, 18, 13, 2);
  blueLight.position.set(-13, 4.6, 0);
  stadium.add(redLight, blueLight);
  return stadium;
}
