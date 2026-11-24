import type { WeatherKind } from "./pixel-jijia-climate.ts";
import type { GroundKind } from "./pixel-jijia-world.ts";

export type FootstepMaterial="grass"|"stone"|"wood"|"soil"|"snow"|"wet"|"water";
export type LocalSound="none"|"fountain"|"trees"|"device";
export function footstepMaterial(roomId:string|null,ground:GroundKind,wet:number,snow:number):FootstepMaterial{
  if(roomId)return roomId==="guild"||roomId==="honors"||roomId==="study"?"wood":"stone";
  if(ground===3)return "water";
  if(snow>=.25)return "snow";
  if(wet>=.45)return "wet";
  return ground===0||ground===5?"grass":ground===6?"wood":ground===4||ground===7?"soil":"stone";
}
export function distanceVolume(distance:number,range:number):number{
  const t=Math.max(0,Math.min(1,1-distance/range));return t*t;
}

type Channel={filter:BiquadFilterNode;gain:GainNode};
const STEP_SOUND:Record<FootstepMaterial,readonly [number,number,number]>={
  grass:[780,.085,.14],stone:[2400,.065,.12],wood:[520,.08,.18],soil:[1050,.09,.15],
  snow:[1250,.13,.19],wet:[1850,.10,.17],water:[1500,.15,.21],
};

// One shared noise buffer and two spatial channels. No timers or autoplay;
// the route calls unlock only from trusted input, and updates from its RAF.
export class PixelWorldAudio{
  private context:AudioContext|null=null;
  private buffer:AudioBuffer|null=null;
  private master:GainNode|null=null;
  private weather:Channel|null=null;
  private local:Channel|null=null;
  unlock(){
    if(typeof AudioContext==="undefined")return;
    if(!this.context){
      let c:AudioContext;
      try{c=new AudioContext();}catch{return;}
      this.context=c;
      const buffer=this.buffer=c.createBuffer(1,c.sampleRate*2,c.sampleRate);
      const data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      const master=this.master=c.createGain();master.gain.value=.38;master.connect(c.destination);
      const channel=():Channel=>{
        const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
        source.buffer=buffer;source.loop=true;filter.type="lowpass";gain.gain.value=0;
        source.connect(filter);filter.connect(gain);gain.connect(master);source.start();
        return {filter,gain};
      };
      this.weather=channel();this.local=channel();
    }
    if(this.context.state!=="running"&&this.context.state!=="closed")void this.context.resume().catch(()=>{});
  }
  silence(){
    const c=this.context;
    if(!c||c.state==="closed")return;
    this.weather?.gain.gain.setTargetAtTime(0,c.currentTime,.06);
    this.local?.gain.gain.setTargetAtTime(0,c.currentTime,.06);
    void c.suspend().catch(()=>{});
  }
  dispose(){
    if(this.context&&this.context.state!=="closed")void this.context.close().catch(()=>{});
    this.context=null;this.buffer=null;this.master=null;this.weather=null;this.local=null;
  }
  get running(){return this.context?.state==="running";}
  update(weather:WeatherKind|null,indoor:boolean,wind:number,local:LocalSound,volume:number){
    const c=this.context;if(!c||c.state!=="running"||!this.weather||!this.local)return;
    const rain=weather==="rain"||weather==="storm",now=c.currentTime;
    const weatherVolume=(rain?(weather==="storm"?.13:.085):.015+Math.abs(wind)*.0025)*(indoor?.23:1);
    this.weather.gain.gain.setTargetAtTime(weatherVolume,now,.23);
    this.weather.filter.frequency.setTargetAtTime(indoor?(rain?530:180):rain?2100:380,now,.25);
    this.local.gain.gain.setTargetAtTime(local==="none"?0:volume,now,.20);
    this.local.filter.frequency.setTargetAtTime(local==="fountain"?1100:local==="device"?170:440,now,.25);
  }
  step(material:FootstepMaterial,sprinting:boolean){
    const c=this.context,buffer=this.buffer,master=this.master;
    if(!c||c.state!=="running"||!buffer||!master)return;
    const [frequency,duration,volume]=STEP_SOUND[material],now=c.currentTime;
    const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
    source.buffer=buffer;source.playbackRate.value=.9+Math.random()*.2;
    filter.type=material==="wood"?"lowpass":"bandpass";filter.frequency.value=frequency;filter.Q.value=.65;
    gain.gain.setValueAtTime(0,now);
    gain.gain.linearRampToValueAtTime(volume*(sprinting?1.25:1),now+.009);
    gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    source.connect(filter);filter.connect(gain);gain.connect(master);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
    source.start(now,Math.random(),duration+.01);
  }
}
