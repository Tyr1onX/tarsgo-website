import type {MatchEvent,Team} from "./rmuc-3d-match.ts";
import type {PerspectiveCamera} from "three";
export type Cue="light"|"heavy"|"contact"|"hit"|"pickup"|"assembly"|"mechanism"|"major"|"countdown"|"start"|"end";
type Point={x:number;y:number;z:number};
const profiles:Record<Cue,{duration:number;hz:number;end:number;noise:number;volume:number;interval:number}> = {
 light:{duration:.085,hz:420,end:150,noise:.75,volume:.28,interval:.055},
 heavy:{duration:.19,hz:110,end:48,noise:.65,volume:.42,interval:.12},
 contact:{duration:.055,hz:920,end:320,noise:.7,volume:.13,interval:.09},
 hit:{duration:.13,hz:330,end:95,noise:.5,volume:.32,interval:.08},
 pickup:{duration:.16,hz:580,end:940,noise:.05,volume:.22,interval:.12},
 assembly:{duration:.19,hz:430,end:720,noise:.14,volume:.25,interval:.15},
 mechanism:{duration:.34,hz:150,end:80,noise:.36,volume:.25,interval:.3},
 major:{duration:.36,hz:410,end:780,noise:.03,volume:.35,interval:.35},
 countdown:{duration:.12,hz:600,end:600,noise:0,volume:.28,interval:.3},
 start:{duration:.42,hz:450,end:900,noise:0,volume:.38,interval:.4},
 end:{duration:.65,hz:520,end:230,noise:.02,volume:.38,interval:.5}
};
export function eventCue(e:MatchEvent):Cue|null{
 switch(e.type){
  case "match-start":return "start";
  case "match-end":return "end";
  case "energy-picked":return "pickup";
  case "assembly-step-complete":return "assembly";
  case "assembly-end":return e.reason?null:"major";
  case "cover-opening":case "rune-start":case "dart-launch":case "launcher-installed":return "mechanism";
  case "outpost-destroyed":case "outpost-rebuilt":case "rune-success":case "dart-hit":case "launcher-ready":return "major";
  case "robot-dead":case "robot-revived":return "hit";
  case "ammo":case "heal":return e.status==="completed"&&e.amount?"pickup":null;
  default:return null;
 }
}
export function audioVisible(visibility:"all"|Team,perspective:"all"|Team){return visibility==="all"||perspective==="all"||visibility===perspective;}
export function spatialGain(distance:number){return 1/(1+(Math.max(0,distance)/7)**2);}
export function cueSamples(cue:Cue,rate:number){
 const p=profiles[cue],data=new Float32Array(Math.ceil(rate*p.duration));let seed=0x51f73d21,phase=0,filtered=0;
 for(let i=0;i<data.length;i++){
  const t=i/rate,u=t/p.duration;seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  filtered=.36*filtered+.64*(seed/2147483648-1);
  phase+=2*Math.PI*(p.hz+(p.end-p.hz)*u)/rate;
  const envelope=Math.min(1,t/.004)*Math.pow(Math.max(0,1-u),2.2);
  data[i]=envelope*((1-p.noise)*Math.sin(phase)+p.noise*filtered);
 }
 return data;
}
export function createMatchAudio(camera:PerspectiveCamera){
 let enabled=true,volume=1,context:AudioContext|null=null,master:DynamicsCompressorNode|null=null,output:GainNode|null=null,disposed=false;
 const buffers=new Map<Cue,AudioBuffer>(),last=new Map<Cue,number>();
 const voices=new Map<AudioBufferSourceNode,()=>void>();
 function stop(){
  for(const [voice,cleanup] of voices){try{voice.stop();}catch{}cleanup();}
  voices.clear();last.clear();
 }
 function unlock(){
  if(!enabled||disposed||document.hidden)return;
  try{if(!context){context=new AudioContext();master=context.createDynamicsCompressor();master.threshold.value=-12;master.ratio.value=5;output=context.createGain();output.gain.value=volume;master.connect(output);output.connect(context.destination);}if(context.state==="suspended")void context.resume().catch(()=>{});}catch{}
 }
 function play(cue:Cue,point?:Point){
  if(!enabled||disposed||document.hidden||context?.state!=="running"||!master)return;
  const ctx=context,p=profiles[cue],now=ctx.currentTime;
  if(now-(last.get(cue)??-Infinity)<p.interval)return;
  const priority=cue==="major"||cue==="start"||cue==="end"||cue==="countdown";
  if(voices.size>=(priority?12:9))return;
  const distance=point?Math.hypot(point.x-camera.position.x,point.y-camera.position.y,point.z-camera.position.z):0;
  const volume=p.volume*(point?spatialGain(distance):1);
  if(volume<.009)return;
  try{
   let buffer=buffers.get(cue);
   if(!buffer){const data=cueSamples(cue,ctx.sampleRate);buffer=ctx.createBuffer(1,data.length,ctx.sampleRate);buffer.getChannelData(0).set(data);buffers.set(cue,buffer);}
   const source=ctx.createBufferSource(),gain=ctx.createGain(),pan=ctx.createStereoPanner();
   source.buffer=buffer;gain.gain.value=volume;
   if(point&&distance>.001){const e=camera.matrixWorld.elements;pan.pan.value=Math.max(-1,Math.min(1,((point.x-camera.position.x)*e[0]+(point.y-camera.position.y)*e[1]+(point.z-camera.position.z)*e[2])/distance));}
   source.connect(gain);gain.connect(pan);pan.connect(master);
   const cleanup=()=>{voices.delete(source);source.onended=null;source.disconnect();gain.disconnect();pan.disconnect();};
   source.onended=cleanup;voices.set(source,cleanup);try{source.start();last.set(cue,now);}catch{cleanup();}
  }catch{}
 }
 return {get enabled(){return enabled;},get activeCount(){return voices.size;},get state(){return context?.state??"locked";},unlock,play,stop,setVolume(value:number){volume=Math.max(0,Math.min(1,value));if(output)output.gain.value=volume;},setEnabled(value:boolean){if(enabled===value)return;enabled=value;if(value)unlock();else stop();},dispose(){disposed=true;stop();buffers.clear();master?.disconnect();output?.disconnect();master=null;output=null;if(context)void context.close().catch(()=>{});context=null;}};
}
