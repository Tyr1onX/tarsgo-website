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
