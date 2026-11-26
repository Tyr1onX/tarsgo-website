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
export function arenaPixelRatio(quality:ArenaQuality,dpr:number){
  return Math.min(dpr,quality==="low"?1:quality==="medium"?1.5:2);
}

type QualityWindow={intervals:number[];gpu:number[]};
function percentile(values:readonly number[],p:number){
  return [...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))]??0;
}
export function needsArenaQualityTrial(sample:QualityWindow,gpuSupported=false){
  return sample.intervals.length>=90&&percentile(sample.intervals,.5)>22&&percentile(sample.intervals,.9)>28&&
    (!gpuSupported||sample.gpu.length>=8&&percentile(sample.gpu,.5)>16);
}
// Compare high/lower/high only under sustained pressure. A GPU timer can
// establish real headroom even when RAF is quantized to the same refresh rate.
export function calibratedArenaPixelRatio(ratio:number,high:QualityWindow,low:QualityWindow,repeat:QualityWindow,gpuSupported:boolean){
  if(ratio<=1||!needsArenaQualityTrial(high,gpuSupported)||!needsArenaQualityTrial(repeat,gpuSupported)||low.intervals.length<90)return ratio;
  const gain=gpuSupported?1.05:.8;
  if(![high,repeat].every(s=>percentile(low.intervals,.5)<=percentile(s.intervals,.5)*gain&&percentile(low.intervals,.9)<=percentile(s.intervals,.9)*gain))return ratio;
  if(gpuSupported&&(low.gpu.length<8||![high,repeat].every(s=>percentile(low.gpu,.5)<=percentile(s.gpu,.5)*.8)))return ratio;
  return ratio>1.5?1.5:1;
}

export function createArenaQualityCalibration(renderer:import("three").WebGLRenderer){
  const gl=renderer.getContext() as WebGL2RenderingContext,ext=gl.getExtension("EXT_disjoint_timer_query_webgl2");
  const fresh=():QualityWindow=>({intervals:[],gpu:[]});
  let windows:QualityWindow[]=[],sample=fresh(),base=0,last=0,warmup=0,nextCheck=0,view="";
  let pending:WebGLQuery|null=null,active=false;
  function endFrame(){if(active){gl.endQuery(ext.TIME_ELAPSED_EXT);active=false;}}
  function releaseQuery(){endFrame();if(pending){gl.deleteQuery(pending);pending=null;}}
  function reset(){releaseQuery();windows=[];sample=fresh();base=last=warmup=nextCheck=0;view="";}
  function finish(ratio:number,time:number){reset();nextCheck=time+10000;if(renderer.getPixelRatio()!==ratio)renderer.setPixelRatio(ratio);}
  function beginFrame(time:number,eligible:boolean,nextView:string){
    if(!eligible||base&&view!==nextView&&!ext){if(base)finish(base,time);return;}
    if(time<nextCheck)return;
    if(!base){const ratio=renderer.getPixelRatio();if(ratio<=1)return;base=ratio;view=nextView;}
    if(pending&&gl.getQueryParameter(pending,gl.QUERY_RESULT_AVAILABLE)){
      if(!gl.getParameter(ext.GPU_DISJOINT_EXT))sample.gpu.push(gl.getQueryParameter(pending,gl.QUERY_RESULT)/1e6);
      gl.deleteQuery(pending);pending=null;
    }
    const interval=last?time-last:0;last=time;
    if(interval>=250||interval<0){finish(base,time);return;}
    if(interval>0&&warmup++>=20){
      sample.intervals.push(interval);
      if(sample.intervals.length>=90){
        windows.push(sample);
        if(windows.length===1&&!needsArenaQualityTrial(sample,!!ext)){finish(base,time);return;}
        if(windows.length===3){finish(calibratedArenaPixelRatio(base,windows[0],windows[1],windows[2],!!ext),time);return;}
        releaseQuery();sample=fresh();last=warmup=0;
        renderer.setPixelRatio(windows.length===1?(base>1.5?1.5:1):base);
        return;
      }
      if(ext&&!pending&&sample.intervals.length%6===0&&!gl.getQuery(ext.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)){
        pending=gl.createQuery();if(pending){gl.beginQuery(ext.TIME_ELAPSED_EXT,pending);active=true;}
      }
    }
  }
  return {beginFrame,endFrame,reset};
}
