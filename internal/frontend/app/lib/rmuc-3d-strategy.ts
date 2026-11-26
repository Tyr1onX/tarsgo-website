export const WEIGHT_KEYS=["attack","defense","resources","technology","cooperation"] as const;
export type WeightKey=typeof WEIGHT_KEYS[number];
export type StrategyWeights=Record<WeightKey,number>;
export type Strategy={algorithm:"priority"|"utility";weights:StrategyWeights};
export const STRATEGY_PRESETS:Record<string,StrategyWeights>={
  balanced:{attack:50,defense:50,resources:50,technology:50,cooperation:50},
  attack:{attack:90,defense:25,resources:40,technology:30,cooperation:55},
  defense:{attack:25,defense:90,resources:60,technology:40,cooperation:65},
  technology:{attack:35,defense:40,resources:60,technology:95,cooperation:65}
};
export const defaultStrategy=():Strategy=>({algorithm:"priority",weights:{...STRATEGY_PRESETS.balanced}});
export function validStrategy(s:Strategy){
  return !!s&&["priority","utility"].includes(s.algorithm)&&!!s.weights&&WEIGHT_KEYS.every(k=>Number.isInteger(s.weights[k])&&s.weights[k]>=0&&s.weights[k]<=100);
}
export type TaskKind="launcher"|"recover"|"fortress"|"defend"|"attack"|"resource"|"technology"|"rune"|"support"|"crossing"|"revive"|"command";
export type TaskCandidate<T>={kind:TaskKind;weight:WeightKey;priority:number;urgency:number;distance:number;required?:boolean;execute:()=>T};
export function chooseTask<T>(strategy:Strategy,tasks:readonly TaskCandidate<T>[]){
  const required=strategy.algorithm==="utility"&&tasks.some(t=>t.required);
  let best:TaskCandidate<T>|undefined,score=-Infinity;
  for(const task of tasks){
    if(required&&!task.required)continue;
    const value=strategy.algorithm==="priority"||required?task.priority:strategy.weights[task.weight]*task.urgency-task.distance*1.5;
    if(value>score){best=task;score=value;}
  }
  if(!best)throw new Error("No legal task");
  return {task:best,score};
}


// AI-only reproducible draws: unrelated referee, robot and render work cannot
// advance these streams. Sample keys are simulation ticks, never wall time.
export function aiSample(seed:number,id:string,tick:number,channel:number){
  let n=(seed^Math.imul(tick,0x9e3779b1)^Math.imul(channel+1,0x85ebca6b))>>>0;
  for(let i=0;i<id.length;i++)n=Math.imul(n^id.charCodeAt(i),0x01000193)>>>0;
  n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);
  return ((n^(n>>>16))>>>0)/4294967296;
}
export function aiBurst(seed:number,id:string,tick:number,role:"heavy"|"sentry"|"infantry"){
  const r=aiSample(seed,id,tick,0);
  return role==="heavy"?1:role==="sentry"?3+Math.floor(r*4):2+Math.floor(r*3);
}
// This is presentation/AI behavior only. The referee retains the real
// ammunition, cooldown and thermal decisions at every projectile launch.
export function aiFireDelay(seed:number,id:string,tick:number,role:"heavy"|"sentry"|"infantry",remaining:number,heatFraction:number){
  const r=aiSample(seed,id,tick,1);
  const base=role==="heavy"?.75+r*.45:remaining>0?.19+r*.08:.38+r*.38;
  return base+(heatFraction>.75?(heatFraction-.75)*1.2:0);
}


// Virtual dart choices operate only on public objectives and existing legal
// windows; no change to the referee's qualified virtual hit model.
export function aiDartPlan(seed:number,team:"red"|"blue",window:number,strategy:Strategy,hostileOutpost:boolean){
  const w=strategy.weights,r=aiSample(seed,team+"-dart",window,0);
  const baseMode=w.defense>w.attack?"randomFixed":w.technology>w.attack?"terminalMoving":r<.25?"fixed":r<.7?"randomMoving":"terminalMoving";
  const mode=hostileOutpost&&(window===0||w.cooperation>=w.attack)&&r<.85?"outpost":baseMode;
  return {mode,baseMode,openDelay:2+aiSample(seed,team+"-dart",window,1)*8+(100-w.attack)*.06,
    fireDelay:.6+aiSample(seed,team+"-dart",window,2)*2.4,spacing:5+aiSample(seed,team+"-dart",window,3)*4} as const;
}
