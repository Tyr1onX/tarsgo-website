// RMUC 2027 V1.0.0 table 3-1. Historic visual assets do not define match identities.
export const SYSTEM_NUMBERS={air:6,dart:8,radar:9} as const;
export const SYSTEM_NAMES={air:"空中系统",dart:"飞镖系统",radar:"雷达系统"} as const;
export function systemLabel(kind:keyof typeof SYSTEM_NUMBERS){
  return String(SYSTEM_NUMBERS[kind]).padStart(2,"0")+" "+SYSTEM_NAMES[kind];
}
export const GROUND_NAMES={heavy:"重装机器人",infantry:"步兵机器人",sentry:"哨兵机器人"} as const;
export const GROUND_LINEUP=[
  {number:"01",kind:"heavy",assetId:"2026-hero-01"},
  {number:"03",kind:"infantry",assetId:"2026-infantry-03"},
  {number:"04",kind:"infantry",assetId:"2026-infantry-04"},
  {number:"07",kind:"sentry",assetId:"2026-sentinel-07"},
] as const;
export const GROUND_ROSTER=(["blue","red"] as const).flatMap(team=>GROUND_LINEUP.map(entry=>({...entry,team,id:`${team}-2027-${entry.kind}-${entry.number}`})));
export type GroundIdentity=(typeof GROUND_ROSTER)[number];
export function groundIdentity(id:string){return GROUND_ROSTER.find(r=>r.id===id);}
export function groundLabel(id:string){
  const r=groundIdentity(id);
  return r?r.number+"号 "+GROUND_NAMES[r.kind]:id;
}
export function systemIdentity(team:"red"|"blue",kind:keyof typeof SYSTEM_NUMBERS){
  const number=SYSTEM_NUMBERS[kind];return {team,kind,number,id:`${team}-2027-${kind}-0${number}`};
}
