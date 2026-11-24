import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { installMechanisms, MECHANISM_ASSET, REPLACEMENTS, TEAMS } from "./rmuc-3d-mechanisms.ts";

import { createMatch, startMatch, updateMatch, purchaseAmmo } from "./rmuc-3d-match.ts";
import { resolveArenaShot, traceArenaShot } from "./rmuc-3d-shot.ts";
import { createArenaTerrain, supportedHeight } from "./rmuc-3d-terrain.ts";
import { createRobotPreview, ROBOT_PLACEMENTS, aimWeaponAt } from "./rmuc-3d-robots.ts";

// Node geometry tests do not render textures. Keep the actual mesh decoder.
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
async function load(url, hash) {
  const bytes = gunzipSync(await readFile(new URL("../../../../public" + url, import.meta.url)));
  if (hash) assert.equal(createHash("sha256").update(bytes).digest("hex"), hash);
  return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ""
  )).scene;
}
function meshes(root) {
  const result = [];
  root.traverse(o => { if (o.isMesh) result.push(o); });
  return result;
}
function target(o) {
  while (o && !o.userData.target) o = o.parent;
  return o?.userData.target;
}
function triangles(root, skip) {
  const result = new Set();
  const p = new THREE.Vector3();
  for (const mesh of meshes(root)) {
    if (skip?.has(mesh)) continue;
    const pos = mesh.geometry.attributes.position;
    const idx = mesh.geometry.index;
    for (let i = 0; i < (idx?.count ?? pos.count); i += 3) {
      const points = [i, i+1, i+2].map(j => {
        p.fromBufferAttribute(pos, idx ? idx.getX(j) : j).applyMatrix4(mesh.matrixWorld);
        return p.toArray().map(x => Math.round(x * 1e5)).join(",");
      });
      if (new Set(points).size === 3) result.add(points.sort().join("|"));
    }
  }
  return result;
}
test("actual CAD outposts replace original assemblies; carrier and hit geometry rotate together", async () => {
  const [field, parts] = await Promise.all([
    load("/assets/pixel-jijia/rmuc-2027-arena-3b2530d3.glb.gz"),
    load(MECHANISM_ASSET.url, MECHANISM_ASSET.sha256)
  ]);
  const root = new THREE.Group();
  root.add(field);
  root.rotation.x = -Math.PI / 2;
  root.updateMatrixWorld(true);
  const installed = installMechanisms(field, parts);
  const pose = { runeAngle: 0, outpostAngle: { red: 0, blue: 0 }, cover: {red: 0, blue: 0} };
  installed.apply(pose);
  for (const team of TEAMS) {
    const get = suffix => parts.getObjectByName(team + "-outpost-" + suffix);
    const assembly = get("assembly"), rotor = get("rotor"), carrier = get("carrier"), fixed = get("fixed-upper");
    assert.ok(assembly && rotor && carrier && fixed);
    assert.equal(field.getObjectByName(REPLACEMENTS[team + "-outpost-assembly"]), undefined);
    const moving = new Set(meshes(rotor));
    assert.ok(meshes(carrier).every(m => moving.has(m)));
    assert.ok(meshes(fixed).every(m => !moving.has(m)));
    const stationary = meshes(assembly).filter(m => !moving.has(m));
    const stat = triangles(assembly, moving), spin = triangles(rotor);
    const overlap = [...spin].filter(key => stat.has(key));
    console.log(team, "fixed triangles", stat.size, "moving triangles", spin.size, "coincident", overlap.length);
    assert.equal(overlap.length, 0, "fixed/moving coincident triangles");
    const fixedMesh = meshes(fixed)[0], carrierMesh = meshes(carrier)[0];
    const fixedRest = fixedMesh.matrixWorld.clone(), carrierRest = carrierMesh.matrixWorld.clone();
    const samples = [];
    for (let i=0; i<3; i++) {
      const module = get("armor-" + i);
      assert.equal(target(meshes(get("module-" + i))[0]), undefined);
      assert.ok(module);
      assert.deepEqual(target(meshes(module)[0]), {type:"outpost", team});
      // Use a real surface triangle and cast a ray from its normal.
      const mesh = meshes(module)[0], g = mesh.geometry, pos = g.attributes.position;
      const v = j => new THREE.Vector3().fromBufferAttribute(pos, g.index ? g.index.getX(j) : j);
      let a, b, c, normal;
      for (let j=0; j<(g.index?.count ?? pos.count); j+=3) {
        a=v(j); b=v(j+1); c=v(j+2);
        normal=b.clone().sub(a).cross(c.clone().sub(a));
        if (normal.lengthSq()>1e-15) break;
      }
      const point=a.clone().add(b).add(c).divideScalar(3);
      // Probe interior points across the entire actual plate. A coplanar
      // stationary surface with different triangulation would still be hit.
      for (let j=0; j<(g.index?.count ?? pos.count); j+=3) {
        const u=v(j), w=v(j+1), z=v(j+2);
        const n=w.clone().sub(u).cross(z.clone().sub(u));
        if(n.lengthSq()<1e-15)continue;
        const p=mesh.localToWorld(u.add(w).add(z).divideScalar(3));
        n.normalize().transformDirection(mesh.matrixWorld);
        const probe=new THREE.Raycaster(p.clone().addScaledVector(n,.001),n.negate(),0,.002);
        assert.equal(probe.intersectObjects(stationary,false).length,0,"stationary surface coincides with real armor");
      }
      samples.push({module, mesh, point, normal: normal.normalize(), rest: mesh.localToWorld(point.clone())});
    }
    for (const angle of [.7, 1.6, 0]) {
      pose.outpostAngle[team]=angle; installed.apply(pose);
      assert.ok(fixedMesh.matrixWorld.equals(fixedRest));
      assert.equal(carrierMesh.matrixWorld.equals(carrierRest), angle===0);
      assert.equal(target(carrierMesh), undefined);
      for (const {module,mesh,point,normal,rest} of samples) {
        const world=mesh.localToWorld(point.clone());
        if (angle!==0) assert.ok(world.distanceTo(rest)>.001);
        else assert.ok(world.distanceTo(rest)<1e-8);
        const n=normal.clone().transformDirection(mesh.matrixWorld);
        const ray=new THREE.Raycaster(world.clone().addScaledVector(n,.0001),n.negate(),0,.0002);
        const hit=ray.intersectObject(module,true)[0];
        assert.ok(hit && hit.point.distanceTo(world)<.0002);
        assert.deepEqual(target(hit.object),{type:"outpost",team});
      }
    }
  }
});

test("actual field and robots: meter-range shots follow rotating modules, stop at tower, and settle damage once", async () => {
  const [field,parts] = await Promise.all([
    load("/assets/pixel-jijia/rmuc-2027-arena-3b2530d3.glb.gz"),
    load(MECHANISM_ASSET.url,MECHANISM_ASSET.sha256),
  ]);
  const scene=new THREE.Scene(), root=new THREE.Group();
  scene.add(root);root.add(field);root.rotation.x=-Math.PI/2;
  root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root), center=bounds.getCenter(new THREE.Vector3());
  root.position.set(-center.x,-bounds.min.y,-center.z);
  root.updateMatrixWorld(true);
  const terrain=createArenaTerrain(root);
  const mechanisms=installMechanisms(field,parts);
  const robots=ROBOT_PLACEMENTS.filter(e=>e.area==="field").map(e=>{
    const model=createRobotPreview(e.kind);
    model.name=e.instanceId;model.userData.team=e.team;
    model.position.set(e.x,terrain.heightAt(e.x,e.z),e.z);
    model.rotation.y=e.team==="red"?Math.PI/2:-Math.PI/2;
    model.traverse(o=>{if(o.userData.hitPlate)o.userData.target={type:"robot",id:model.name};});
    scene.add(model);
    return model;
  });
  scene.updateMatrixWorld(true);
  for(const mesh of meshes(scene))mesh.geometry.computeBoundingBox();
  const roster=robots.map(r=>({id:r.name,team:r.userData.team,heavy:false,maxHp:200}));
  const match=createMatch(roster,1,1);
  const ray=new THREE.Raycaster();
  startMatch(match);
  for(const team of TEAMS){
    const shooter=robots.find(r=>r.userData.team!==team&&r.name.includes("infantry-04"));
    assert.ok(shooter);
    const saved=shooter.position.clone();
    const roots=[root,...robots.filter(r=>r!==shooter)];
    assert.ok(purchaseAmmo(match,shooter.name));
    const rotor=parts.getObjectByName(team+"-outpost-rotor");
    const pivot=rotor.getWorldPosition(new THREE.Vector3());
    const size=new THREE.Box3().setFromObject(shooter).getSize(new THREE.Vector3());
    const radius=Math.hypot(size.x,size.z)/2;
    const aimAt=(point,angle,distance)=>{
      const x=pivot.x+Math.cos(angle)*distance,z=pivot.z+Math.sin(angle)*distance;
      const y=terrain.heightAt(x,z);
      if(!Number.isFinite(y)||supportedHeight(terrain,x,z,radius,y,.23)===null)return;
      if(robots.some(r=>r!==shooter&&Math.abs(r.position.y-y)<1.15&&
          Math.hypot(r.position.x-x,r.position.z-z)<radius+.5))return;
      shooter.position.set(x,y,z);
      scene.updateMatrixWorld(true);
      const shot=aimWeaponAt(shooter,point);
      if(!shot)return;
      return {from:shot.origin,direction:shot.direction};
    };
    const findRay=(module,point,blocked)=>{
      const radial=Math.atan2(point.z-pivot.z,point.x-pivot.x)+(blocked?Math.PI:0);
      for(const dist of [2.5,3,3.5,4])for(const offset of [0,.15,-.15,.3,-.3,.5,-.5]){
        const aim=aimAt(point,radial+offset,dist);
        if(!aim)continue;
        const local=traceArenaShot(ray,[module],aim.from,aim.direction);
        const hit=traceArenaShot(ray,roots,aim.from,aim.direction);
        if(!local||!hit)continue;
        if(blocked?(!target(hit.object)&&hit.distance<local.distance-.05):target(hit.object)?.team===team&&target(hit.object)?.type==="outpost"&&hit.object===local.object){
          return {...aim,distance:hit.distance};
        }
      }
    };
    for(let plate=0;plate<3;plate++){
      const module=parts.getObjectByName(team+"-outpost-armor-"+plate);
      let previous;
      for(const angle of [0,.7,1.6]){
        match.pose.outpostAngle[team]=angle;mechanisms.apply(match.pose);
        scene.updateMatrixWorld(true);
        const point=new THREE.Box3().setFromObject(module).getCenter(new THREE.Vector3());
        if(previous)assert.ok(previous.distanceTo(point)>.05);
        previous=point.clone();
        const aim=findRay(module,point,false);
        assert.ok(aim,team+" visible shot at "+angle);
        assert.ok(aim.distance>1.5);
        const before=match.sides[team].outpost;
        const result=resolveArenaShot(match,shooter.name,ray,roots,aim.from,aim.direction);
        assert.deepEqual(result.target,{type:"outpost",team});
        assert.equal(result.damage,20);
        assert.equal(match.sides[team].outpost,before-20);
        assert.ok(result.hit.point.distanceTo(result.to)<1e-9);
        assert.equal(resolveArenaShot(match,shooter.name,ray,roots,aim.from,aim.direction),null);
        assert.equal(match.sides[team].outpost,before-20);
        updateMatch(match,.18);
        const blocked=findRay(module,point,true);
        assert.ok(blocked,team+" tower occlusion at "+angle);
        const stop=resolveArenaShot(match,shooter.name,ray,roots,blocked.from,blocked.direction);
        assert.ok(stop.hit);
        assert.equal(stop.target,undefined);
        assert.equal(stop.damage,0);
        assert.equal(match.sides[team].outpost,before-20);
        console.log(team,plate,angle,"direct meters",aim.distance.toFixed(3),"blocked meters",blocked.distance.toFixed(3));
        updateMatch(match,.18);
      }
    }
    shooter.position.copy(saved);
  }
  updateMatch(match,420);
  assert.equal(match.phase,"finished");
  assert.equal(resolveArenaShot(match,robots[0].name,ray,[root],new THREE.Vector3(),new THREE.Vector3(1,0,0)),null);
  mechanisms.apply(createMatch(roster).pose);
});

test("reviewed rune hubs move with five arms while source logos stay fixed", async () => {
  const [field,parts]=await Promise.all([
    load("/assets/pixel-jijia/rmuc-2027-arena-3b2530d3.glb.gz"),
    load(MECHANISM_ASSET.url,MECHANISM_ASSET.sha256),
  ]);
  const root=new THREE.Group();root.add(field);root.rotation.x=-Math.PI/2;
  root.updateMatrixWorld(true);
  const mechanism=installMechanisms(field,parts);
  const pose={runeAngle:0,outpostAngle:{red:0,blue:0},cover:{red:0,blue:0}};
  mechanism.apply(pose);
  const assembly=parts.getObjectByName("rune-assembly");
  assert.equal(field.getObjectByName(REPLACEMENTS["rune-assembly"]),undefined);
  const samples=[];
  for (const side of ["a","b"]) {
    const hub=parts.getObjectByName("rune-hub-"+side);
    const logo=parts.getObjectByName("rune-logo-"+side);
    const bank=parts.getObjectByName("rune-bank-"+side);
    assert.ok(hub&&logo&&bank);
    const moving=new Set(meshes(bank));
    assert.ok(meshes(hub).every(m=>moving.has(m)));
    assert.ok(meshes(logo).every(m=>!moving.has(m)));
    for(let i=0;i<5;i++)assert.ok(meshes(parts.getObjectByName("rune-arm-"+side+"-"+i)).every(m=>moving.has(m)));
    assert.equal(target(meshes(hub)[0]),undefined);
    assert.equal(target(meshes(logo)[0]),undefined);
    const fixed=triangles(assembly,moving), spin=triangles(bank);
    assert.equal([...spin].filter(t=>fixed.has(t)).length,0);
    const hm=meshes(hub)[0],lm=meshes(logo)[0];
    samples.push({hm,lm,hubRest:hm.matrixWorld.clone(),logoRest:lm.matrixWorld.clone()});
  }
  for (const angle of [.7,1.6,0]) {
    pose.runeAngle=angle;mechanism.apply(pose);
    for (const {hm,lm,hubRest,logoRest} of samples) {
      assert.ok(lm.matrixWorld.equals(logoRest));
      assert.equal(hm.matrixWorld.equals(hubRest),angle===0);
    }
    assert.ok(mechanism.banks[0].quaternion.equals(mechanism.banks[1].quaternion));
  }
});
