import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { installMechanisms, installCoreGeometry, CORE_ASSET, DART_ASSET, MECHANISM_ASSET, REPLACEMENTS, TEAMS } from "./rmuc-3d-mechanisms.ts";

import { createMatch, startMatch, updateMatch, purchaseAmmo, energyStatus, pickupEnergy, dropEnergy, damageTarget, assemblyStatus, beginAssembly, assemblyAction, coreFrame, technologyLevel, openDart, selectDart, launchDart, dartPose, armorStatus, fortifyArmor } from "./rmuc-3d-match.ts";
import { resolveArenaShot, traceArenaShot, bindArmorFrame, armorHit } from "./rmuc-3d-shot.ts";
import { createArenaTerrain, supportedHeight, moveOnArena } from "./rmuc-3d-terrain.ts";
import { createRobotPreview, ROBOT_PLACEMENTS, aimWeaponAt, addRobotPreviews } from "./rmuc-3d-robots.ts";

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
test("actual technology cores preserve source placements, isolate columns and expose twelve original energy units", async () => {
  const [field, parts] = await Promise.all([
    load("/assets/pixel-jijia/rmuc-2027-arena-3b2530d3.glb.gz"),
    load(CORE_ASSET.url, CORE_ASSET.sha256)
  ]);
  const root = new THREE.Group();
  root.add(field); root.rotation.x = -Math.PI / 2;
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root), center = bounds.getCenter(new THREE.Vector3());
  root.position.set(-center.x, -bounds.min.y, -center.z);
  root.updateMatrixWorld(true);
  const sources = [2,3].map(i => field.getObjectByName("centre-platform_0_source_1751926_" + i));
  const oldBounds = sources.map(o => new THREE.Box3().setFromObject(o, true));
  const originalUnits = TEAMS.flatMap(team => Array.from({length:6}, (_,i) => field.getObjectByName(team+"-resource-zone_0_source_4056216_"+(i+1))));
  const unitMatrices = originalUnits.map(o=>o.matrixWorld.clone());
  const installed = installCoreGeometry(field,parts);
  assert.equal(installed.cores.length,2);
  assert.equal(installed.units.length,12);
  assert.equal(new Set(installed.units.map(u=>u.id)).size,12);
  const close=(a,b)=>a.elements.every((v,i)=>Math.abs(v-b.elements[i])<1e-7);
  for (const [i,core] of installed.cores.entries()) {
    assert.equal(field.getObjectByName(sources[i].name),undefined);
    const actual = new THREE.Box3().setFromObject(core.object,true);
    assert.ok(actual.min.distanceTo(oldBounds[i].min)<.0002);
    assert.ok(actual.max.distanceTo(oldBounds[i].max)<.0002);
    const fixed = ["pedestal-and-shoulder","arm-and-shared","head-fixed"].map(n=>core.object.getObjectByName(n));
    const shaft=core.object.getObjectByName("shaft");
    const rest = fixed.map(o=>o.matrixWorld.clone()), shaftRest=shaft.matrixWorld.clone();
    const fixedTriangles = new Set(fixed.flatMap(o=>[...triangles(o)]));
    assert.equal([...triangles(shaft)].filter(t=>fixedTriangles.has(t)).length,0);
    installed.rotateColumn(i,Math.PI/2);
    assert.ok(fixed.every((o,j)=>close(o.matrixWorld,rest[j])));
    assert.ok(!close(shaft.matrixWorld,shaftRest));
    installed.rotateColumn(i,0);
    assert.ok(close(shaft.matrixWorld,shaftRest));
  }
  for(const [i,unit] of installed.units.entries()){
    assert.equal(unit.object,originalUnits[i]);
    assert.equal(unit.object.parent,installed.group);
    assert.ok(close(unit.object.matrixWorld,unitMatrices[i]));
  }
  const first=installed.units[0].object,second=installed.units[1].object;
  first.position.x+=.2;root.updateMatrixWorld(true);
  assert.ok(!close(first.matrixWorld,unitMatrices[0]));
  assert.ok(close(second.matrixWorld,unitMatrices[1]));
  const roster=[
    {id:"r",team:"red",heavy:true,maxHp:400},
    {id:"r2",team:"red",heavy:true,maxHp:400},
    {id:"b",team:"blue",heavy:true,maxHp:400},
    {id:"i",team:"red",heavy:false,maxHp:200}
  ];
  const match=createMatch(roster,1,1,installed.energySpawns);
  const rack={x:12,z:-6.4,y:.13},blueRack={x:-12,z:6.4,y:.13};
  assert.equal(energyStatus(match,match.robots[0],rack).pickup,null);
  startMatch(match);
  for(const [id,p] of [["r",rack],["b",blueRack]]){
    const robot=match.robots.find(r=>r.id===id);
    const unit=energyStatus(match,robot,p).pickup;
    assert.ok(unit);
    assert.equal(pickupEnergy(match,"i",p,unit),false);
    assert.equal(pickupEnergy(match,id,{x:0,y:0,z:0},unit),false);
    assert.equal(pickupEnergy(match,id,p,unit),true);
    assert.equal(pickupEnergy(match,id==="r"?"r2":"r",p,unit),false);
    assert.equal(energyStatus(match,robot,p).carrying,1);
    const location=match.energyUnits.find(u=>u.id===unit).location;
    assert.equal(location.robot,id);
    installed.applyEnergy(match.energyUnits);
    const mesh=installed.units.find(u=>u.id===unit).object;
    const actual=mesh.localToWorld(new THREE.Vector3(0,.075,0));
    assert.ok(actual.distanceTo(new THREE.Vector3(location.position.x,location.position.y,location.position.z))<1e-6);
    const next={x:p.x*.8,y:.2,z:p.z*.8};
    updateMatch(match,.1,new Map([[id,next]]));
    installed.applyEnergy(match.energyUnits);
    assert.ok(Math.abs(location.position.y-.87)<1e-8);
    assert.ok(mesh.localToWorld(new THREE.Vector3(0,.075,0)).distanceTo(new THREE.Vector3(location.position.x,location.position.y,location.position.z))<1e-6);
    if(id==="r"){
      assert.equal(dropEnergy(match,id,next),true);
      assert.equal(match.energyUnits.find(u=>u.id===unit).location.kind,"ground");
      assert.equal(energyStatus(match,robot,next).carrying,0);
    }else{
      const shooter=match.robots[0];
      for(let i=0;i<10&&robot.hp>0;i++)damageTarget(match,shooter,{type:"robot",id});
      assert.equal(robot.hp,0);
      assert.equal(match.energyUnits.find(u=>u.id===unit).location.kind,"ground");
      assert.equal(energyStatus(match,robot,next).carrying,0);
    }
  }
  const reset=createMatch(roster,1,1,installed.energySpawns);
  installed.applyEnergy(reset.energyUnits);
  assert.ok(originalUnits.every((o,i)=>close(o.matrixWorld,unitMatrices[i])));
});

test("production heavy footprint follows actual CAD routes and installs all four levels through real unit/column geometry",async()=>{
  const [field,parts]=await Promise.all([load("/assets/pixel-jijia/rmuc-2027-arena-3b2530d3.glb.gz"),load(CORE_ASSET.url,CORE_ASSET.sha256)]);
  const root=new THREE.Group();root.add(field);root.rotation.x=-Math.PI/2;root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root),middle=bounds.getCenter(new THREE.Vector3());root.position.set(-middle.x,-bounds.min.y,-middle.z);root.updateMatrixWorld(true);
  const installed=installCoreGeometry(field,parts);
  installed.group.removeFromParent();const terrain=createArenaTerrain(root);field.add(installed.group);root.updateMatrixWorld(true);
  const scene=new THREE.Scene();scene.add(root);
  // Number-plate canvas texture is decorative and not needed in Node.
  globalThis.document={createElement:()=>({getContext:()=>null})};
  let exhibit;try{exhibit=addRobotPreviews(root,scene,terrain);}finally{delete globalThis.document;}
  const bots=TEAMS.map(team=>exhibit.children.find(o=>o.userData.team===team&&o.userData.area==="field"&&o.name.includes("hero")));
  const roster=bots.map(b=>({id:b.name,team:b.userData.team,heavy:true,maxHp:400}));
  const m=createMatch(roster,1,1,installed.energySpawns,installed.coreSockets);startMatch(m);
  const positions=new Map(bots.map(b=>[b.name,b.position]));
  const advance=dt=>{updateMatch(m,dt,positions);installed.applyTechnology(m);};
  const {findArenaPath}=await import("./rmuc-3d-navigation.ts");
  const {zonesAtPosition}=await import("./rmuc-3d-zones.ts");
  const fixed=installed.cores.map(c=>c.object.getObjectByName("pedestal-and-shoulder"));
  const fixedMatrices=fixed.map(o=>o.matrixWorld.clone());
  const shaft=installed.cores.map(c=>c.object.getObjectByName("shaft"));
  const tipLocal=new THREE.Vector3(-.6112806706969,-.7521826021449,-.675706394592);
  const shaftMatrices=shaft.map(o=>o.matrixWorld.clone());
  const vec=p=>new THREE.Vector3(p.x,p.y,p.z);
  const move=(b,x,z)=>{
    const goal=new THREE.Vector3(x,terrain.heightAt(x,z),z);
    const radius=b.userData.radius;assert.ok(radius<.425);
    const search=findArenaPath(terrain,b.position,goal,radius,.4,[]);
    let step=search.next();while(!step.done)step=search.next();
    assert.ok(step.value.length>0);
    for(const node of step.value){moveOnArena(terrain,b.position,node.x-b.position.x,node.z-b.position.z,radius,.23,[]);assert.ok(b.position.distanceTo(node)<.016);}
    assert.ok(b.position.distanceTo(goal)<.02,JSON.stringify({actual:b.position,goal}));
    advance(.1);
  };
  for(const [i,b] of bots.entries()){
    const team=TEAMS[i],other=TEAMS[1-i],sign=i===0?1:-1,r=m.robots[i];
    for(const level of [1,2,3,4]){
      if(m.elapsed<60*(level-1))advance(60*(level-1)-m.elapsed);
      move(b,12*sign,-6.4*sign);
      for(let j=0;j<(level===4?2:1);j++){
        const unit=energyStatus(m,r,b.position).pickup;assert.ok(unit);assert.ok(pickupEnergy(m,r.id,b.position,unit));advance(.1);
      }
      move(b,1.05*sign,1.05*sign);
      assert.ok(zonesAtPosition(b.position).includes(team+"-assembly"));
      assert.ok(beginAssembly(m,r.id,b.position,level));advance(1);
      for(const step of level===1?[2,6]:level===2?[2,3,6]:[2,3,4,5,6]){
        for(const core of level===4?[team,other]:[team]){
          const a=assemblyStatus(m,r,b.position).actions.find(a=>a.core===core&&a.step===step);assert.ok(a);
          assert.ok(assemblyAction(m,r.id,b.position,core,step,a.angle));
          if(step!==6){advance(step===5?1:.6);const frame=coreFrame(m,core);
            const j=TEAMS.indexOf(core),actual=shaft[j].localToWorld(tipLocal.clone());
            assert.ok(actual.distanceTo(vec(frame.tip))<.0005,"real column tip tracks referee frame");
            const u=m.energyUnits.find(u=>u.location.kind==="mounted"&&u.location.owner===team&&u.location.core===core);assert.ok(u);
            const object=installed.units.find(x=>x.id===u.id).object;
            assert.ok(object.localToWorld(new THREE.Vector3(0,.075,0)).distanceTo(vec(u.location.position))<1e-6);
            assert.ok(object.visible);
            assert.ok(fixed.every((o,k)=>o.matrixWorld.equals(fixedMatrices[k])));
          }else advance(.1);
        }
      }
      assert.equal(technologyLevel(m,team),level);
      assert.ok(shaft.every((o,k)=>o.matrixWorld.elements.every((v,j)=>Math.abs(v-shaftMatrices[k].elements[j])<1e-7)));
    }
  }
  assert.equal(m.energyUnits.filter(u=>u.location.kind==="spent").length,10);
  for(const u of m.energyUnits.filter(u=>u.location.kind==="spent")){
    const object=installed.units.find(x=>x.id===u.id).object;assert.equal(object.visible,false);assert.ok(meshes(object).every(o=>!o.layers.isEnabled(0)));
  }
  installed.applyTechnology(createMatch(roster,1,1,installed.energySpawns,installed.coreSockets));
  assert.ok(installed.units.every(u=>u.object.visible&&meshes(u.object).every(o=>o.layers.isEnabled(0))));
});

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
  for(const team of TEAMS){
    const rotor=parts.getObjectByName(team+"-outpost-rotor");
    for(let i=0;i<3;i++)bindArmorFrame(parts.getObjectByName(team+"-outpost-armor-"+i),rotor);
  }
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
    assert.ok(purchaseAmmo(match,shooter.name));updateMatch(match,6);
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
        updateMatch(match,1);
        const blocked=findRay(module,point,true);
        assert.ok(blocked,team+" tower occlusion at "+angle);
        const stop=resolveArenaShot(match,shooter.name,ray,roots,blocked.from,blocked.direction);
        assert.ok(stop.hit);
        assert.equal(stop.target,undefined);
        assert.equal(stop.damage,0);
        assert.equal(match.sides[team].outpost,before-20);
        console.log(team,plate,angle,"direct meters",aim.distance.toFixed(3),"blocked meters",blocked.distance.toFixed(3));
        updateMatch(match,1);
      }
    }
    // The tenth qualifying hit and the two armor classifications use the
    // same real CAD plate, legal purchase/fire and actual muzzle ray.
    const module=parts.getObjectByName(team+"-outpost-armor-0");
    match.pose.outpostAngle[team]=0;mechanisms.apply(match.pose);scene.updateMatrixWorld(true);
    const point=new THREE.Box3().setFromObject(module).getCenter(new THREE.Vector3());
    const aim=findRay(module,point,false);assert.ok(aim);
    const hit=resolveArenaShot(match,shooter.name,ray,roots,aim.from,aim.direction);
    assert.equal(hit.damage,20);assert.equal(armorStatus(match,shooter.userData.team).hits,10);
    const coordinate=armorHit(hit.hit);assert.ok(coordinate&&coordinate.area>0);
    updateMatch(match,1);
    if(team==="blue"){
      updateMatch(match,120-match.elapsed);
      assert.ok(fortifyArmor(match,team,coordinate));
      match.pose.outpostAngle[team]=0;mechanisms.apply(match.pose);scene.updateMatrixWorld(true);
      const next=findRay(module,point,false);assert.ok(next);
      const reinforced=resolveArenaShot(match,shooter.name,ray,roots,next.from,next.direction);
      assert.equal(reinforced.damage,10);
      assert.equal(armorStatus(match,team).lastHit,"reinforced");
      updateMatch(match,1);
      assert.ok(fortifyArmor(match,team,{x:1,y:1}));
      match.pose.outpostAngle[team]=0;mechanisms.apply(match.pose);scene.updateMatrixWorld(true);
      const exposedAim=findRay(module,point,false);assert.ok(exposedAim);
      const exposed=resolveArenaShot(match,shooter.name,ray,roots,exposedAim.from,exposedAim.direction);
      assert.equal(exposed.damage,30);assert.equal(armorStatus(match,team).lastHit,"exposed");
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

test("ten source rune disks resolve only front hits within 150 mm at rotating poses",async()=>{
  const {runeHit}=await import("./rmuc-3d-mechanisms.ts");
  const [field,parts]=await Promise.all([load("/assets/pixel-jijia/rmuc-2027-arena-3b2530d3.glb.gz"),load(MECHANISM_ASSET.url,MECHANISM_ASSET.sha256)]);
  const mechanisms=installMechanisms(field,parts);
  for(const angle of [0,.6,1.7]){
    mechanisms.apply({runeAngle:angle,outpostAngle:{red:0,blue:0},cover:{red:0,blue:0}});
    for(const bank of ["a","b"])for(let i=0;i<5;i++){
      const arm=parts.getObjectByName("rune-arm-"+bank+"-"+i),d=arm.userData.runeDetector;
      const center=arm.localToWorld(d.center.clone()),normal=d.normal.clone().transformDirection(arm.matrixWorld);
      const dir=normal.clone().negate(),ray=new THREE.Raycaster(center.clone().addScaledVector(normal,.4),dir);
      const hit=ray.intersectObject(parts,true)[0];assert.ok(hit);
      assert.ok(hit.point.distanceTo(center)<.003);
      assert.deepEqual(runeHit(arm,hit.point,dir),{type:"rune",team:d.team,arm:i,ring:10});
      const u=new THREE.Vector3(0,0,1).transformDirection(arm.matrixWorld);
      assert.equal(runeHit(arm,center.clone().addScaledVector(u,.149),dir)?.ring,1);
      assert.equal(runeHit(arm,center.clone().addScaledVector(u,.151),dir),undefined);
      assert.equal(runeHit(arm,hit.point,normal),undefined);
      assert.equal(runeHit(arm,center.clone().addScaledVector(normal,.02),dir),undefined);
    }
  }
});

test("base shells block actual muzzle shots without scoring arbitrary surfaces", async()=>{
 const [field,parts]=await Promise.all([load("/assets/pixel-jijia/rmuc-2027-arena-3b2530d3.glb.gz"),load(MECHANISM_ASSET.url,MECHANISM_ASSET.sha256)]);
 const scene=new THREE.Scene(),root=new THREE.Group();
 scene.add(root);root.add(field);root.rotation.x=-Math.PI/2;root.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(root),center=bounds.getCenter(new THREE.Vector3());
 root.position.set(-center.x,-bounds.min.y,-center.z);root.updateMatrixWorld(true);
 const terrain=createArenaTerrain(root),mechanism=installMechanisms(field,parts);
 const shooter=createRobotPreview("infantry04");scene.add(shooter);
 const match=createMatch([{id:"r",team:"red",heavy:false,maxHp:200},{id:"b",team:"blue",heavy:false,maxHp:200}],1,1);
 startMatch(match);
 const ray=new THREE.Raycaster();
 for(const team of TEAMS){
  const enemy=team==="red"?"blue":"red",id=enemy[0];
  const assembly=parts.getObjectByName(team+"-base-assembly");
  assert.ok(meshes(assembly).every(m=>!target(m)));
  const middle=new THREE.Box3().setFromObject(assembly).getCenter(new THREE.Vector3());
  match.sides[team].outpostArea.controller=enemy;
  match.sides[team].cover=true;
  assert.ok(purchaseAmmo(match,id));updateMatch(match,6);
  for(const open of [0,.5,1]){
   const pose={...match.pose,cover:{red:open,blue:open}};
   mechanism.apply(pose);
   let valid;
   for(const distance of [2.5,3,3.5,4]){
    for(let angle=0;angle<Math.PI*2;angle+=Math.PI/12){
     const x=middle.x+distance*Math.cos(angle),z=middle.z+distance*Math.sin(angle);
     const y=terrain.heightAt(x,z);
     if(!Number.isFinite(y)||supportedHeight(terrain,x,z,.35,y,.23)===null)continue;
     shooter.position.set(x,y,z);scene.updateMatrixWorld(true);
     const aim=aimWeaponAt(shooter,middle);if(!aim)continue;
     const hit=traceArenaShot(ray,[root],aim.origin,aim.direction);
     if(hit&&meshes(assembly).includes(hit.object)&&hit.distance>1.5){valid=aim;break;}
    }
    if(valid)break;
   }
   assert.ok(valid,team+" shell at "+open);
   const before=match.sides[team].base;
   const shot=resolveArenaShot(match,id,ray,[root],valid.origin,valid.direction);
   assert.ok(shot.hit);assert.equal(shot.target,undefined);assert.equal(shot.damage,0);assert.equal(match.sides[team].base,before);
   console.log(team,"cover",open,"blocked muzzle metres",shot.hit.distance.toFixed(3));
   updateMatch(match,1);
  }
 }
});

test("nearest rigid CAD bounds pruning preserves exact ray intersections",async()=>{
  const [field,parts]=await Promise.all([load("/assets/pixel-jijia/rmuc-2027-arena-3b2530d3.glb.gz"),load(MECHANISM_ASSET.url,MECHANISM_ASSET.sha256)]);
  const root=new THREE.Group();root.add(field);root.rotation.x=-Math.PI/2;root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root),center=bounds.getCenter(new THREE.Vector3());
  root.position.set(-center.x,-bounds.min.y,-center.z);root.updateMatrixWorld(true);
  const mechanisms=installMechanisms(field,parts);
  const pose={runeAngle:.63,outpostAngle:{red:.7,blue:1.6},cover:{red:1,blue:0}};
  mechanisms.apply(pose);
  const terrain=createArenaTerrain(root);
  const scene=new THREE.Scene();scene.add(root);
  const robots=ROBOT_PLACEMENTS.filter(r=>r.area==="field").map(r=>{
    const robot=createRobotPreview(r.kind);robot.position.set(r.x,terrain.heightAt(r.x,r.z),r.z);scene.add(robot);return robot;
  });
  scene.updateMatrixWorld(true);
  for(const mesh of meshes(scene))mesh.geometry.computeBoundingBox();
  const original=new THREE.Raycaster(),optimized=new THREE.Raycaster();
  const targets=[...robots.map(r=>r.position.clone().add(new THREE.Vector3(0,.4,0))),...TEAMS.flatMap(t=>[0,1,2].map(i=>new THREE.Box3().setFromObject(parts.getObjectByName(t+"-outpost-armor-"+i)).getCenter(new THREE.Vector3()))),new THREE.Vector3(0,20,0)];
  const originalTimes=[],optimizedTimes=[];
  for(const shooter of robots)for(const point of targets){
    const aim=aimWeaponAt(shooter,point);
    if(!aim)continue;
    scene.updateMatrixWorld(true);
    const roots=[root,...robots.filter(r=>r!==shooter)];
    original.set(aim.origin,aim.direction);original.near=0;original.far=35;
    let start=performance.now();const expected=original.intersectObjects(roots,true)[0];originalTimes.push(performance.now()-start);
    start=performance.now();const actual=traceArenaShot(optimized,roots,aim.origin,aim.direction);optimizedTimes.push(performance.now()-start);
    assert.equal(actual?.object,expected?.object);
    if(expected){assert.ok(Math.abs(actual.distance-expected.distance)<1e-8);assert.ok(actual.point.distanceTo(expected.point)<1e-8);}
  }
  assert.ok(originalTimes.length>=80);
  const p95=a=>a.sort((x,y)=>x-y)[Math.floor(a.length*.95)].toFixed(3);
  console.log("actual CAD/robot rays",originalTimes.length,"original P95",p95(originalTimes),"pruned P95",p95(optimizedTimes));
});

test("actual dart parts replace original assemblies and move both doors and detector carriages independently",async()=>{
 const [field,parts,darts]=await Promise.all([load("/assets/pixel-jijia/rmuc-2027-arena-3b2530d3.glb.gz"),load(MECHANISM_ASSET.url,MECHANISM_ASSET.sha256),load(DART_ASSET.url,DART_ASSET.sha256)]);
 const root=new THREE.Group();root.add(field);root.rotation.x=-Math.PI/2;root.updateMatrixWorld(true);
 const originals=TEAMS.map(t=>field.getObjectByName(t+"-ramp-dart-station_0_source_3749800_7"));
 const bounds=originals.map(o=>new THREE.Box3().setFromObject(o,true));
 const installed=installMechanisms(field,parts,darts);
 assert.equal(installed.dartBindings.length,2);
 const m=createMatch([],1,1);startMatch(m);
 for(const [i,b] of installed.dartBindings.entries()){
   assert.equal(originals[i].parent,null);
   const box=new THREE.Box3().setFromObject(b.door.parent,true);
   assert.ok(box.min.distanceTo(bounds[i].min)<.002,JSON.stringify([box.min,bounds[i].min]));
   assert.ok(box.max.distanceTo(bounds[i].max)<.002);
   assert.ok(meshes(b.carriage).every(o=>!target(o)));
 }
 installed.applyDart(m);
 const closed=installed.dartBindings.map(b=>b.door.getWorldPosition(new THREE.Vector3()));
 updateMatch(m,30);
 for(const team of TEAMS){assert.ok(selectDart(m,team,"randomFixed"));assert.ok(openDart(m,team));}
 updateMatch(m,7);installed.applyDart(m);
 for(const [i,b] of installed.dartBindings.entries()){
   assert.ok(Math.abs(closed[i].distanceTo(b.door.getWorldPosition(new THREE.Vector3()))-1.157991188781261)<.001);
   assert.ok(Math.abs(b.carriage.position.x-b.carriageRest.x)<=.28+1e-8);
 }
 updateMatch(m,40);installed.applyDart(m);
 assert.ok(installed.dartBindings.every(b=>b.carriage.position.equals(b.carriageRest)));
 installed.applyDart(createMatch([]));
 assert.ok(installed.dartBindings.every((b,i)=>b.door.getWorldPosition(new THREE.Vector3()).distanceTo(closed[i])<1e-7));
});
