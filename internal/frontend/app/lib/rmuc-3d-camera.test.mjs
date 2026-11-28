import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { frameArena, lookDirection, turnView } from "./rmuc-3d-camera.ts";
import { ROBOT_PREVIEWS, createRobotPreview } from "./rmuc-3d-robots.ts";
import { createStadium, STADIUM_WIDTH, STADIUM_DEPTH } from "./rmuc-3d-stadium.ts";

test("all four tactical presets frame the requested field on desktop and portrait screens", () => {
  const box = new THREE.Box3(new THREE.Vector3(-14,0,-8),new THREE.Vector3(14,3.8,8));
  for (const aspect of [16/9,1,390/844]) for (const view of ["all","red","blue","top"]) {
    const camera = new THREE.PerspectiveCamera(48,aspect,.025,160);
    const target = frameArena(camera,view,box);
    assert.deepEqual(camera.up.toArray(),[0,1,0]);
    if (view==="red") assert.ok(target.x>0);
    if (view==="blue") assert.ok(target.x<0);
    for(const x of [view==="red"?0:-14,view==="blue"?0:14])
      for(const y of [0,3.8]) for(const z of [-8,8]) {
        const p = new THREE.Vector3(x,y,z).project(camera);
        assert.ok(Math.abs(p.x)<=1 && Math.abs(p.y)<=1 && p.z<=1 && p.z>=-1,view+" "+aspect+" "+p.toArray());
      }
  }
});

test("look turns horizontally and vertically without moving the observer", () => {
  const initial = { yaw: 0, pitch: 0 };
  assert.deepEqual(lookDirection(initial).toArray(), [-0,0,-1]);
  const right = turnView(initial, Math.PI / .007, 0);
  assert.ok(lookDirection(right).distanceTo(new THREE.Vector3(1,0,0)) < 1e-9);
  assert.ok(lookDirection(turnView(initial, 0, -180)).y > .5);
  assert.equal(turnView(initial, 0, 1e5).pitch, -1.4);
  assert.deepEqual(initial, { yaw: 0, pitch: 0 });
});

test("every driveable model has a camera mount attached to its rotating gimbal", () => {
  for(const entry of ROBOT_PREVIEWS) {
    const model=createRobotPreview(entry.kind);
    if(!model.userData.driveable) continue;
    const gimbal=model.getObjectByName("gimbal");
    const eye=gimbal.getObjectByName("driver-eye");
    assert.ok(eye,entry.id);
    const before=eye.getWorldPosition(new THREE.Vector3());
    gimbal.rotation.y=Math.PI/2;
    const after=eye.getWorldPosition(new THREE.Vector3());
    assert.ok(before.distanceTo(after)>.05,entry.id);
    assert.ok(Math.abs(before.y-after.y)<1e-6,entry.id);
  }
});

test("stadium adds high and spacious red-blue stands with bounded instance draw calls", () => {
  const stadium = createStadium(16);
  stadium.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(stadium);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.x >= STADIUM_WIDTH && size.z >= STADIUM_DEPTH && size.y >= 15);
  const instances = stadium.children.filter(child => child.isInstancedMesh);
  assert.ok(instances.length <= 10);
  assert.ok(instances.some(mesh => mesh.material.color.getHex() === 0x63323b));
  assert.ok(instances.some(mesh => mesh.material.color.getHex() === 0x304a73));
  const textures = new Set(instances.map(mesh=>mesh.material.map).filter(Boolean));
  assert.equal(textures.size,2);
  assert.ok([...textures].every(texture=>texture.image.width===512 && texture.image.height===512 && texture.anisotropy===4 && texture.generateMipmaps));
});

test("free flight normalizes diagonal motion, uses wall delta, boosts, clamps, and stops immediately",async()=>{
 const {flightBounds,flightStep}=await import("./rmuc-3d-camera.ts");
 const bounds=flightBounds(new THREE.Box3(new THREE.Vector3(-14,0,-8),new THREE.Vector3(14,4,8))),look={yaw:0,pitch:0};
 const move=(keys,dt=.025)=>{const p=new THREE.Vector3(0,3,0);flightStep(p,look,new Set(keys),6,dt,bounds);return p;};
 assert.ok(Math.abs(move(["KeyW"]).distanceTo(new THREE.Vector3(0,3,0))-.15)<1e-8);
 assert.ok(Math.abs(move(["KeyW","KeyD","Space"]).distanceTo(new THREE.Vector3(0,3,0))-.15)<1e-8);
 assert.ok(Math.abs(move(["Space","ControlLeft"]).y-3.45)<1e-8);
 assert.ok(move(["ShiftLeft"]).y<3);
 const p=move([]);assert.equal(flightStep(p,look,new Set(),6,.05,bounds),false);
 assert.deepEqual(p.toArray(),[0,3,0]);
 const a=new THREE.Vector3(0,3,0),b=a.clone();for(let i=0;i<40;i++)flightStep(a,look,new Set(["KeyW"]),6,.025,bounds);for(let i=0;i<60;i++)flightStep(b,look,new Set(["KeyW"]),6,1/60,bounds);assert.ok(a.distanceTo(b)<1e-8);
 const slow=new THREE.Vector3(0,3,0);for(let i=0;i<10;i++)flightStep(slow,look,new Set(["KeyW"]),6,.1,bounds);assert.ok(a.distanceTo(slow)<1e-8);
 for(let i=0;i<1000;i++)flightStep(a,look,new Set(["Space","ControlLeft"]),24,.05,bounds);assert.equal(a.y,bounds.max.y);
});

test("CAD surface detail shares two textures without replacing positions, normals, side or markings",async()=>{
  const {applyArenaSurfaceDetail}=await import("./rmuc-3d-lighting.ts");
  const root=new THREE.Group(),floor=new THREE.Group();floor.name="floor_0_source_24844_0";root.add(floor);
  const make=(name,color)=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(2,3,4),new THREE.MeshStandardMaterial({name,color,side:THREE.DoubleSide}));
    m.geometry.deleteAttribute("uv");floor.add(m);return m;
  };
  const a=make("colour_0.2000,0.2000,0.2000",0x333333),b=make("colour_default",0x666666),c=make("colour_0.7843,0.7843,0.7059",0xc8c8b4),mark=make("colour_1.0000,1.0000,1.0000",0xffffff),road=make("colour_0.2549,0.2549,0.2549",0x414141);
  const roadRoot=new THREE.Group();roadRoot.name="red-road_0_source_3797438_0";root.add(roadRoot);roadRoot.add(road);
  const pos=a.geometry.attributes.position,norm=a.geometry.attributes.normal,markMaterial=mark.material;
  applyArenaSurfaceDetail(root,16);
  assert.equal(a.geometry.attributes.position,pos);assert.equal(a.geometry.attributes.normal,norm);assert.equal(a.material.side,THREE.DoubleSide);
  assert.equal(a.material.map,b.material.map);assert.equal(road.material.map,a.material.map);assert.notEqual(a.material.map,c.material.map);assert.equal(a.material.roughnessMap,a.material.map);assert.equal(mark.material,markMaterial);assert.equal(mark.geometry.hasAttribute("uv"),false);
  assert.ok([a,c].every(o=>o.geometry.attributes.uv.count===o.geometry.attributes.position.count&&o.material.map.anisotropy===4));
});
