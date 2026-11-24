import * as THREE from "three";
import { dartPose, coreFrame, type EnergyUnit, type Match } from "./rmuc-3d-match.ts";

export const MECHANISM_ASSET = {
  url: "/assets/pixel-jijia/rmuc-mechanisms-51f0d28d.glb.gz",
  sha256: "51f0d28d08fc36449004deb020c4a0c2733cc1854a2521ec969f05147c249af3",
} as const;
export const DART_ASSET = {url:"/assets/pixel-jijia/rmuc-dart-c871c084.glb.gz",sha256:"c871c0845dc3caac8e6302dd1b5ffb4b9773247ceb8d2fc0cd80ccc322860375"} as const;
export const CORE_ASSET = {
  url: "/assets/pixel-jijia/rmuc-core-4a23964a.glb.gz",
  sha256: "4a23964ad0d25941aeb5c61b76b3a3e04cda89f0670453445b895b4c3f8144a8",
} as const;
export type Team = "red" | "blue";
export const TEAMS = ["red", "blue"] as const;
export const opposite = (team: Team): Team => team === "red" ? "blue" : "red";

export const REPLACEMENTS = {
  "red-base-assembly": "base_0_source_4774244_0",
  "blue-base-assembly": "base_1_source_4774244_0",
  "red-outpost-assembly": "centre-platform_0_source_2603236_12",
  "blue-outpost-assembly": "centre-platform_0_source_2603236_11",
  "rune-assembly": "centre-platform_0_source_1354629_1",
} as const;

// The independently tessellated core uses product #1751926 local metres.
// Preserve each original occurrence's full transform, including its tilt.
// The assembly-column axis is measured from OCCT cylinder faces 2608/2610.
export function installCoreGeometry(field: THREE.Object3D, parts: THREE.Group) {
  const occurrences = [2, 3].map(i => {
    const node = field.getObjectByName("centre-platform_0_source_1751926_" + i);
    if (!node?.parent) throw new Error("Missing technology core occurrence " + i);
    return node;
  });
  const units = TEAMS.flatMap(team => Array.from({length: 6}, (_, i) => {
    const object = field.getObjectByName(team + "-resource-zone_0_source_4056216_" + (i+1));
    if (!object?.parent) throw new Error("Missing energy unit " + team + "/" + i);
    return {id: team + "-" + (i+1), team, object};
  }));
  const cores = occurrences.map((old, index) => {
    const object = parts.clone(true);
    object.name = "technology-core-" + index;
    object.position.copy(old.position);
    object.quaternion.copy(old.quaternion);
    object.scale.copy(old.scale);
    const shaft = object.getObjectByName("shaft");
    if (!shaft?.parent || !object.getObjectByName("pedestal-and-shoulder") ||
        !object.getObjectByName("arm-and-shared") || !object.getObjectByName("head-fixed"))
      throw new Error("Incomplete technology core parts");
    const pivot = new THREE.Group();
    pivot.position.set(-.6122676821376, -.7522130684465, -.5695109856506);
    shaft.parent.add(pivot);
    pivot.add(shaft);
    shaft.position.sub(pivot.position);
    old.parent!.add(object);
    old.removeFromParent();
    const head=object.getObjectByName("head-fixed")!;
    const arm=object.getObjectByName("arm-and-shared")!;
    return {object,pivot,head,arm,headRest:head.position.clone(),headRotation:head.quaternion.clone(),armRest:arm.position.clone(),pivotRest:pivot.position.clone()};
  });
  // These are the original twelve source occurrences, not copied geometry.
  // Detach them from the immutable height-field input; their initial world
  // transforms are preserved under the common arena root.
  const group = new THREE.Group();
  group.name = "energy-units";
  field.add(group);
  field.updateMatrixWorld(true);
  for (const unit of units) group.attach(unit.object);
  field.updateMatrixWorld(true);
  const poses=units.map(unit=>({unit,position:unit.object.position.clone(),rotation:unit.object.quaternion.clone()}));
  const center=new THREE.Vector3(0,.075,0);
  const energySpawns=units.map(unit=>{
    const position=unit.object.localToWorld(center.clone());
    return {id:unit.id,team:unit.team,position:{x:position.x,y:position.y,z:position.z}};
  });
  function applyEnergy(states:readonly EnergyUnit[],match?:Match){
    const upright=group.getWorldQuaternion(new THREE.Quaternion()).invert();
    for(const {unit,position,rotation} of poses){
      const state=states.find(s=>s.id===unit.id);
      if(!state)continue;
      const spent=state.location.kind==="spent";
      if(unit.object.visible===spent){
        unit.object.visible=!spent;
        unit.object.traverse(o=>spent?o.layers.disable(0):o.layers.enable(0));
      }
      if(spent)continue;
      if(state.location.kind==="rack"){
        unit.object.position.copy(position);unit.object.quaternion.copy(rotation);
      }else{
        const frame=state.location.kind==="mounted"&&match?coreFrame(match,state.location.core):null;
        unit.object.quaternion.copy(upright);
        if(frame){
          const axis=new THREE.Vector3(frame.axis.x,frame.axis.y,frame.axis.z);
          unit.object.quaternion.multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),axis)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),frame.twist));
        }
        unit.object.position.copy(group.worldToLocal(new THREE.Vector3(state.location.position.x,state.location.position.y,state.location.position.z)))
          .sub(center.clone().multiply(unit.object.scale).applyQuaternion(unit.object.quaternion));
      }
    }
    group.updateMatrixWorld(true);
  }
  const axis = new THREE.Vector3(-.009293893038593576, -.00028687666259608687, .9999567696925542);
  function rotateColumn(index: number, angle: number) {
    cores[index].pivot.quaternion.setFromAxisAngle(axis, angle);
    cores[index].object.updateMatrixWorld(true);
  }
  const vec=(p:{x:number;y:number;z:number})=>new THREE.Vector3(p.x,p.y,p.z);
  const tipLocal=new THREE.Vector3(-.6112806706969,-.7521826021449,-.675706394592);
  const coreSockets=Object.fromEntries(cores.map((c,i)=>{
    const position=c.object.localToWorld(tipLocal.clone());
    const direction=axis.clone().negate().transformDirection(c.object.matrixWorld);
    return [TEAMS[i],{position:{x:position.x,y:position.y,z:position.z},axis:{x:direction.x,y:direction.y,z:direction.z}}];
  })) as Match["coreSockets"];
  function applyTechnology(match:Match){
    for(const [i,c] of cores.entries()){
      const team=TEAMS[i],rest=coreSockets[team]!,frame=coreFrame(match,team)!;
      if(!frame.active){
        c.head.position.copy(c.headRest);c.head.quaternion.copy(c.headRotation);c.arm.position.copy(c.armRest);c.pivot.position.copy(c.pivotRest);c.pivot.quaternion.identity();c.object.updateMatrixWorld(true);continue;
      }
      const parent=c.head.parent!;
      const restTip=parent.worldToLocal(vec(rest.position)),newTip=parent.worldToLocal(vec(frame.head));
      const delta=newTip.clone().sub(restTip);
      // Keep the original pedestal fixed; exact joint linkage is not available.
      const headTurn=new THREE.Quaternion().setFromUnitVectors(vec(rest.axis).transformDirection(parent.matrixWorld.clone().invert()),vec(frame.baseAxis).transformDirection(parent.matrixWorld.clone().invert()));
      c.head.position.copy(c.headRest).sub(restTip).applyQuaternion(headTurn).add(newTip);
      c.head.quaternion.copy(headTurn).multiply(c.headRotation);
      c.arm.position.copy(c.armRest).addScaledVector(delta,.5);
      const outward=axis.clone().negate();
      const localAxis=vec(frame.axis).transformDirection(c.object.matrixWorld.clone().invert());
      const q=new THREE.Quaternion().setFromUnitVectors(outward,localAxis);
      c.pivot.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(outward,frame.twist));
      const targetBase=vec(frame.tip).addScaledVector(vec(frame.axis),-.1062);
      c.pivot.position.copy(c.pivot.parent!.worldToLocal(targetBase));
      c.object.updateMatrixWorld(true);
    }
    applyEnergy(match.energyUnits,match);
  }
  return {cores, units, group, energySpawns, coreSockets, applyEnergy, applyTechnology, old: occurrences, rotateColumn};
}

export type MechanismPose = {
  runeAngle: number;
  outpostAngle: Record<Team, number>;
  cover: Record<Team, number>;
};

// Centers of the ten 308 mm circular STEP faces, measured in product-local
// metres. Detection is the official 300 mm disk; CAD front skin is ~1.7 mm
// ahead of the analytical face. The skin still blocks unrelated shots.
const RUNE_CENTERS = [
  [[-.410530,-.322195,-.472098],[-.500127,-.559595,.308848],[-.265558,.061927,.791500],[-.030989,.683448,.308848],[-.120586,.446048,-.472098]],
  [[.185999,-.547332,-.472098],[.475943,.220911,-.472098],[.565540,.458311,.308848],[.330971,-.163210,.791500],[.096402,-.784732,.308848]]
] as const;
const RUNE_AXIS=new THREE.Vector3(.9355854080889134,-.35310047319580506,0);
export function runeHit(arm:THREE.Object3D,point:THREE.Vector3,direction:THREE.Vector3){
  const detector=arm.userData.runeDetector as {team:Team;arm:number;center:THREE.Vector3;normal:THREE.Vector3}|undefined;
  if(!detector)return undefined;
  const normal=detector.normal.clone().transformDirection(arm.matrixWorld);
  if(direction.dot(normal)>=0)return undefined;
  const delta=arm.worldToLocal(point.clone()).sub(detector.center);
  const depth=delta.dot(detector.normal);
  if(Math.abs(depth)>.003)return undefined;
  const radius=delta.addScaledVector(detector.normal,-depth).length();
  if(radius>.15)return undefined;
  return {type:"rune" as const,team:detector.team,arm:detector.arm,ring:Math.max(1,10-Math.floor(Math.round(radius*1000)/15))};
}

export function installMechanisms(field: THREE.Object3D, parts: THREE.Group, dartParts?: THREE.Group) {
  const find = (name: string) => {
    const object = parts.getObjectByName(name);
    if (!object) throw new Error("Missing mechanism " + name);
    return object;
  };
  const old = Object.entries(REPLACEMENTS).map(([name, source]) => {
    find(name);
    const object = field.getObjectByName(source);
    if (!object) throw new Error("Missing original assembly " + source);
    return object;
  });
  // Both assets use the same STEP source coordinates. The existing field root
  // performs the one shared Z-up -> Y-up transform.
  const rotors = TEAMS.map(team => find(team + "-outpost-rotor"));
  const banks = ["a", "b"].map(side => find("rune-bank-" + side));
  const covers = TEAMS.flatMap(team => {
    const assembly = find(team + "-base-assembly");
    const center = new THREE.Box3().setFromObject(assembly).getCenter(new THREE.Vector3());
    return [0, 1, 2].map(index => {
      const object = find(team + "-cover-" + index);
      const p = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
      const outward = p.sub(center);
      outward.z = 0;
      outward.normalize().multiplyScalar(.17);
      outward.z = -.045;
      // Source review specifies an inspection translation, not a measured linkage.
      const parent = object.parent!;
      const local = parent.worldToLocal(parent.getWorldPosition(new THREE.Vector3()).add(outward));
      return { team, object, rest: object.position.clone(), local };
    });
  });
  const runeAxis = RUNE_AXIS;
  const rotorAxis = new THREE.Vector3(0, 1, 0);
  for (const team of TEAMS) for (let i = 0; i < 3; i++)
    find(team + "-outpost-armor-" + i).userData.target = { type: "outpost", team };
  const runeArms = ["a","b"].flatMap((bank,bankIndex)=>RUNE_CENTERS[bankIndex].map((center,i)=>{
    const object=find("rune-arm-"+bank+"-"+i),team=TEAMS[bankIndex];
    object.userData.runeDetector={team,arm:i,center:new THREE.Vector3(...center),normal:RUNE_AXIS.clone().multiplyScalar(bankIndex===0?-1:1)};
    const lights:THREE.MeshStandardMaterial[]=[];
    object.traverse(node=>{
      if(!(node instanceof THREE.Mesh)||!(node.material instanceof THREE.MeshStandardMaterial))return;
      const m=node.material;
      if(team==="red"?m.color.r<.9||m.color.b>.1:m.color.b<.9||m.color.r>.1)return;
      node.material=m.clone();lights.push(node.material as THREE.MeshStandardMaterial);
    });
    return {team,i,lights};
  }));
  function setRuneLights(red:readonly number[],blue:readonly number[]){
    for(const a of runeArms)for(const m of a.lights){
      m.emissive.copy(m.color);m.emissiveIntensity=(a.team==="red"?red:blue).includes(a.i)?1.5:0;
    }
  }
  // The six base detector faces have not been bound to verified source geometry.
  // The housing and covers are blockers, not damage targets.
  // Preserve fixed original collision envelope for locomotion; only new
  // source meshes participate in visible scene and projectile queries.
  const dartBindings: {team:Team;door:THREE.Object3D;carriage:THREE.Object3D;doorRest:THREE.Vector3;carriageRest:THREE.Vector3}[]=[];
  if(dartParts){
    const clone=(name:string)=>{const node=dartParts.getObjectByName(name);if(!node)throw new Error("Missing dart part "+name);return node.clone(true);};
    const replacement=(original:THREE.Object3D,names:string[])=>{
      const g=new THREE.Group();g.position.copy(original.position);g.quaternion.copy(original.quaternion);g.scale.copy(original.scale);
      original.parent!.add(g);for(const name of names)g.add(clone(name));return g;
    };
    for(const [i,team] of TEAMS.entries()){
      const station=field.getObjectByName(team+"-ramp-dart-station_0_source_3749800_7");
      if(!station)throw new Error("Missing dart station "+team);
      const gate=replacement(station,["dart-deck","dart-door","dart-frame","dart-guides"]);
      old.push(station);
      const base=replacement(old[i],["base-fixed","base-rail","base-carriage"]);
      const parent=find(team+"-cover-0").parent!;
      for(const child of [...parent.children])if(!child.name.startsWith(team+"-cover-")){child.removeFromParent();old.push(child);}
      const door=gate.getObjectByName("dart-door")!,carriage=base.getObjectByName("base-carriage")!;
      dartBindings.push({team,door,carriage,doorRest:door.position.clone(),carriageRest:carriage.position.clone()});
    }
  }
  function applyDart(match:Match){
    for(const b of dartBindings){
      const p=dartPose(match,b.team);
      b.door.position.copy(b.doorRest).addScaledVector(new THREE.Vector3(0,-.9659258262890824,.25881904510246795),-1.157991188781261*(1-p.door));
      b.carriage.position.copy(b.carriageRest);b.carriage.position.x+=p.target;
    }
    field.updateMatrixWorld(true);
  }
  for (const object of old) object.removeFromParent();
  field.add(parts);
  field.updateMatrixWorld(true);
  function apply(pose: MechanismPose) {
    for (const bank of banks) bank.quaternion.setFromAxisAngle(runeAxis, pose.runeAngle);
    for (const [i, rotor] of rotors.entries()) rotor.quaternion.setFromAxisAngle(rotorAxis, pose.outpostAngle[TEAMS[i]]);
    for (const { team, object, rest, local } of covers)
      object.position.copy(rest).addScaledVector(local, pose.cover[team]);
    parts.updateMatrixWorld(true);
  }
  return { parts, old, apply, rotors, banks, rotorAxis, runeAxis, covers, setRuneLights, applyDart, dartBindings };
}
