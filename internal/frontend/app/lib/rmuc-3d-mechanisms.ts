import * as THREE from "three";

export const MECHANISM_ASSET = {
  url: "/assets/pixel-jijia/rmuc-mechanisms-51f0d28d.glb.gz",
  sha256: "51f0d28d08fc36449004deb020c4a0c2733cc1854a2521ec969f05147c249af3",
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

export function installMechanisms(field: THREE.Object3D, parts: THREE.Group) {
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
  return { parts, old, apply, rotors, banks, covers, setRuneLights };
}
