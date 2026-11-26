import type {MatchEvent,Team} from "./rmuc-3d-match.ts";
import {groundLabel,groundIdentity,systemLabel} from "./rmuc-3d-identity.ts";

export const visibleEvent=(event:MatchEvent,perspective:"all"|Team)=>perspective==="all"||event.visibility==="all"||event.visibility===perspective;
const teamName=(t:Team)=>t==="red"?"红方":"蓝方";
const robotName=(id:string)=>{const r=groundIdentity(id);return r?teamName(r.team)+groundLabel(id):id;};
const structure=(t:Team,kind:"outpost"|"base")=>teamName(t)+(kind==="outpost"?"位置前哨":"基地");
export function eventMessage(e:MatchEvent):{text:string;major:boolean}|null{
  switch(e.type){
    case "match-start":return {text:"比赛开始",major:true};
    case "match-end":return {text:e.winner==="draw"?"比赛结束 · 平局":teamName(e.winner)+"胜利",major:true};
    case "robot-dead":return {text:robotName(e.robot)+" 战亡",major:false};
    case "outpost-destroyed":return {text:structure(e.location,"outpost")+" 摧毁 · 原属"+teamName(e.team),major:true};
    case "outpost-rebuilt":return {text:structure(e.location,"outpost")+" 重建 · "+teamName(e.team)+"接管",major:false};
    case "territory":return {text:structure(e.location,e.structure)+"阵地 · "+teamName(e.team)+(e.full?"完全":"临时")+"控制",major:e.full};
    case "cover-opening":return {text:teamName(e.location)+"基地护甲开始展开",major:true};
    case "assembly-end":return e.reason?null:{text:teamName(e.team)+" "+e.level+"级装配成功 · 科技 "+e.technology+"级",major:e.level>1};
    case "rune-success":return {text:teamName(e.team)+(e.large?"大":"小")+"能量机关激活成功",major:true};
    case "dart-hit":return {text:teamName(e.team)+systemLabel("dart")+" · 有效命中 · "+(e.mode==="outpost"?structure(e.location,"outpost"):teamName(e.location)+"基地"),major:true};
    default:return null;
  }
}

type FeedItem={id:number;event:MatchEvent;text:string;major:boolean;received:number};
export function createEventFeed(){
  let serial=0;const recent:FeedItem[]=[];
  function add(event:MatchEvent,now:number){
    const message=eventMessage(event);if(!message)return;
    if(recent.some(x=>x.event.at===event.at&&x.event.type===event.type&&x.event.visibility===event.visibility&&eventMessage(x.event)?.text===message.text))return;
    // The referee emits a cascade for a single outpost transition. Present
    // its final strategic outcome once, without removing any raw events.
    if(event.type==="territory"||event.type==="outpost-rebuilt"||event.type==="dart-hit"){
      const related=recent.find(x=>x.event.at===event.at&&x.event.visibility===event.visibility&&
        (x.event.type==="outpost-destroyed"||x.event.type==="cover-opening")&&x.event.location===event.location&&
        (event.type==="dart-hit"?(event.mode==="outpost")===(x.event.type==="outpost-destroyed"):x.event.type==="outpost-destroyed"&&(event.type==="outpost-rebuilt"||"structure" in event&&event.structure==="outpost")));
      if(related){
        const suffix=event.type==="dart-hit"?teamName(event.team)+"飞镖命中":event.type==="outpost-rebuilt"?teamName(event.team)+"接管":"full" in event&&event.full?teamName(event.team)+"完全控制":teamName(event.team)+"临时控制";
        if(!related.text.includes(suffix)){
          if(event.type==="outpost-rebuilt")related.text=related.text.replace(" · "+teamName(event.team)+"完全控制","");
          related.text+=" · "+suffix;
        }
        return;
      }
    }
    recent.push({id:++serial,event,text:message.text,major:message.major,received:now});
    if(recent.length>24){const ordinary=recent.findIndex(x=>!x.major);recent.splice(ordinary<0?0:ordinary,1);}
  }
  function view(perspective:"all"|Team,now:number){
    while(recent.length&&now-recent[0].received>=4000)recent.shift();
    const legal=recent.filter(x=>visibleEvent(x.event,perspective));
    // Highest priority last: compact and manual HUDs show only this item.
    const items=legal.sort((a,b)=>Number(a.major)-Number(b.major)||a.id-b.id).slice(-3);
    // Give a new major event a short readable window before an overlapping
    // major event takes over the single-line compact HUD. Terminal wins.
    const hold=items.find(x=>x.major&&now-x.received<1200);
    if(hold&&items.at(-1)?.event.type!=="match-end"){items.splice(items.indexOf(hold),1);items.push(hold);}
    return {items};
  }
  return {add,view,clear:()=>{recent.length=0;}};
}
