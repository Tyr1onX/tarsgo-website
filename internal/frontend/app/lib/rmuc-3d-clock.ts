// One match tick = 25ms. Carry fractional wall-time debt across scheduled
// batches, independently of rendering; cap work per browser task.
export const SIM_STEP_MS=25;
export const MATCH_STEPS=420000/SIM_STEP_MS;
export const MAX_FRAME_STEPS=3;
export const PATH_CHECKS_PER_STEP=48;
export class ArenaClock {
  tick=0;
  debt=0;
  private last:number|null=null;
  reset(){this.tick=0;this.debt=0;this.last=null;}
  pause(){this.last=null;}
  deposit(now:number){
    if(this.last!==null)this.debt+=Math.max(0,now-this.last);
    this.last=now;
  }
  run(step:(tick:number)=>boolean,limit=MAX_FRAME_STEPS){
    let count=0;
    while(count<limit&&this.debt+1e-7>=SIM_STEP_MS&&this.tick<MATCH_STEPS){
      this.debt=Math.max(0,this.debt-SIM_STEP_MS);
      count++;
      if(!step(++this.tick)){this.debt=0;break;}
    }
    return count;
  }
}
