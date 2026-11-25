// RMUC 2027 V1.0.0 table 3-1. Historic visual assets do not define match identities.
export const SYSTEM_NUMBERS={air:6,dart:8,radar:9} as const;
export const GROUND_LINEUP=[
  {number:"01",kind:"heavy",assetId:"2026-hero-01"},
  {number:"03",kind:"infantry",assetId:"2026-infantry-03"},
  {number:"04",kind:"infantry",assetId:"2026-infantry-04"},
  {number:"07",kind:"sentry",assetId:"2026-sentinel-07"},
] as const;
export const GROUND_ROSTER=(["blue","red"] as const).flatMap(team=>GROUND_LINEUP.map(entry=>({...entry,team,id:`${team}-2027-${entry.kind}-${entry.number}`})));
export type GroundIdentity=(typeof GROUND_ROSTER)[number];
export function groundIdentity(id:string){return GROUND_ROSTER.find(r=>r.id===id);}
export function systemIdentity(team:"red"|"blue",kind:keyof typeof SYSTEM_NUMBERS){
  const number=SYSTEM_NUMBERS[kind];return {team,kind,number,id:`${team}-2027-${kind}-0${number}`};
}
