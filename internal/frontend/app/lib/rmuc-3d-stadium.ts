import * as THREE from "three";
import { FIELD_HALF_X, FIELD_HALF_Z } from "./rmuc-3d-terrain.ts";

export const STADIUM_WIDTH = 72;
export const STADIUM_DEPTH = 54;

export function createStadium() {
  const stadium = new THREE.Group();
  stadium.name = "arena-stadium";
  const steel = new THREE.MeshStandardMaterial({ color: 0x26333e, metalness: .6, roughness: .54 });
  const wall = new THREE.MeshStandardMaterial({ color: 0x17222d, roughness: .92 });
  const seat = new THREE.MeshStandardMaterial({ color: 0x37434d, roughness: .9 });
  const redSeat = new THREE.MeshStandardMaterial({ color: 0x63323b, roughness: .88 });
  const blueSeat = new THREE.MeshStandardMaterial({ color: 0x304a73, roughness: .88 });
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

  // Keep the 28 × 15 m competition boundary unchanged. A wide concourse,
  // two seating tiers and an open central roof aperture establish the scale.
  for (const side of [-1, 1]) {
    const endColor = side === 1 ? red : blue;
    box(wall, 0, 8, side * 26.8, 72, 16, .6);
    box(wall, side * 35.8, 8, 0, .6, 16, 54);
    box(steel, 0, .04, side * 17.25, 72, .1, 19.5);
    box(steel, side * 25, .04, 0, 22, .1, 54);
    // Long-side grandstands, aisle breaks and contrasting team blocks.
    for (let tier = 0; tier < 2; tier++) {
      for (let row = 0; row < 7; row++) {
        const z = side * (13.1 + tier * 7.5 + row * .92);
        const y = .35 + tier * 4.2 + row * .38;
        box(steel, 0, y / 2, z, 64, y, .9);
        for (let i = -34; i <= 34; i++) {
          if (Math.abs(i) % 10 <= 1) continue;
          const x = i * .9;
          const mat = Math.abs(x) < 3 ? seat : x > 0 ? redSeat : blueSeat;
          box(mat, x, y + .17, z, .69, .20, .53);
          box(mat, x, y + .39, z + side * .25, .69, .46, .12);
        }
        box(steel, 0, y + .4, z + side * .43, 64, .045, .035);
      }
      const z = side * (19.3 + tier * 6.7);
      box(steel, 0, 3.05 + tier * 4.3, z, 66, .3, 1.4);
      for (const faction of [-1,1]) box(faction === 1 ? red : blue, faction * 16.5, 3.26+tier*4.3, z-side*.74, 32, .08, .07);
    }
    // Faction end zones: large scoreboard housing, entry portals, balconies.
    box(steel, side*29.5, 2.7, 0, 9, 5.4, 35);
    box(wall, side*24.95, 2.3, 0, .28, 4.3, 26);
    for (const z of [-11, 11]) {
      box(steel, side*24.75, 2.25, z, .45, 4.5, 5.4);
      box(wall, side*24.45, 1.9, z, .15, 3.65, 4.4);
      box(endColor, side*24.35, 3.85, z, .09, .12, 4.5);
    }
    box(steel, side*30.4, 10.4, 0, 1.05, 5.2, 16);
    box(wall, side*29.8, 10.4, 0, .2, 4.5, 15.1);
    box(endColor, side*29.62, 7.98, 0, .13, .16, 15.2);
    box(endColor, side*29.62, 12.82, 0, .13, .16, 15.2);
    for (const z of [-18,-9,9,18]) {
      box(steel, side*34.5, 7.9, z, .72, 15.8, .72);
      box(endColor, side*33.98, 10.4, z, .14, 4, .56);
    }
    // High perimeter trusses. No opaque ceiling above the official field:
    // tactical overhead views must remain readable.
    box(steel,0,15.3,side*25.7,72,.6,.7);
    box(steel,side*34.8,15.3,0,.7,.6,52);
    box(steel,0,12.8,side*21.8,70,.45,.6);
    for(const x of [-32,-24,-16,-8,0,8,16,24,32]){
      box(steel,x,7.6,side*26.1,.6,15.2,.65);
      box(steel,x,14.1,side*23.75,.32,.4,4.6);
      box(steel,x,12.9,side*21.8,2.6,.38,.6);
      box(white,x,12.6,side*21.6,2.2,.09,.34);
      box(white,x,15.0,side*25.4,1.4,.075,.24);
    }
    box(endColor,side*34.3,6.0,0,.12,.14,50);
  }
  for (const [material, matrices] of parts) {
    const mesh = new THREE.InstancedMesh(cube, material, matrices.length);
    matrices.forEach((transform, index) => mesh.setMatrixAt(index, transform));
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    stadium.add(mesh);
  }
  const redLight = new THREE.PointLight(0xff344b, 18, 13, 2);
  redLight.position.set(13, 7, 0);
  const blueLight = new THREE.PointLight(0x477dff, 18, 13, 2);
  blueLight.position.set(-13, 7, 0);
  stadium.add(redLight, blueLight);
  return stadium;
}