export type ArenaQuality = "auto" | "low" | "medium" | "high";
export type ArenaSettings = {quality:ArenaQuality; muted:boolean; volume:number; sensitivity:number; invertY:boolean};
export const DEFAULT_ARENA_SETTINGS: ArenaSettings = {quality:"auto",muted:false,volume:1,sensitivity:1,invertY:false};
export const ARENA_SETTINGS_KEY="tarsgo:arena-settings";
const clamp=(value:unknown,min:number,max:number,fallback:number)=>typeof value==="number"&&Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback;
export function normalizeArenaSettings(value:unknown):ArenaSettings{
  if(!value||typeof value!=="object")return {...DEFAULT_ARENA_SETTINGS};
  const v=value as Partial<ArenaSettings>;
  return {
    quality:v.quality==="low"||v.quality==="medium"||v.quality==="high"?v.quality:"auto",
    muted:v.muted===true,
    volume:clamp(v.volume,0,1,1),
    sensitivity:clamp(v.sensitivity,.25,2,1),
    invertY:v.invertY===true,
  };
}
export function loadArenaSettings():ArenaSettings{
  try{return normalizeArenaSettings(JSON.parse(localStorage.getItem(ARENA_SETTINGS_KEY)??"null"));}
  catch{return {...DEFAULT_ARENA_SETTINGS};}
}
export function saveArenaSettings(value:ArenaSettings){
  try{localStorage.setItem(ARENA_SETTINGS_KEY,JSON.stringify(value));}catch{}
}
export function arenaPixelRatio(quality:ArenaQuality,dpr:number,cores:number,memory?:number){
  const recommended=cores<=4||memory!==undefined&&memory<=4?1:1.5;
  return Math.min(dpr,quality==="low"?1:quality==="medium"?1.5:quality==="high"?2:recommended);
}


// One stable sample window per automatic-quality selection. Never change
// simulation cadence or oscillate between pixel ratios.
export function calibratedArenaPixelRatio(ratio:number,intervals:readonly number[]){
  if(ratio<=1||intervals.length<90)return ratio;
  const sorted=[...intervals].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length*.5)]>22&&sorted[Math.floor(sorted.length*.9)]>28?1:ratio;
}
