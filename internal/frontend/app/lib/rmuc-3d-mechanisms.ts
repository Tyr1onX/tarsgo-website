import * as THREE from "three";

export const MECHANISM_ASSET = {
  url: "/assets/pixel-jijia/rmuc-mechanisms-11e8e2f0.glb.gz",
  sha256: "11e8e2f0f7148026b8514e5fa59167c5686d192f758d68f4d21b6eab25e0d3a4",
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
  const runeAxis = new THREE.Vector3(.9355854080889134, -.35310047319580506, 0);
  const rotorAxis = new THREE.Vector3(0, 1, 0);
  for (const team of TEAMS) for (let i = 0; i < 3; i++)
    find(team + "-outpost-armor-" + i).userData.target = { type: "outpost", team };
  for (const [bankIndex, bank] of ["a","b"].entries()) for(let i=0;i<5;i++)
    find("rune-arm-"+bank+"-"+i).userData.target={type:"rune",arm:bankIndex*5+i};
  for(const team of TEAMS) find(team+"-base-assembly").userData.target={type:"base",team};
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
  return { parts, old, apply, rotors, banks, covers };
}
