import type {MatchEvent,Team} from "./rmuc-3d-match.ts";
import {groundIdentity} from "./rmuc-3d-identity.ts";

export const visibleEvent=(event:MatchEvent,perspective:"all"|Team)=>perspective==="all"||event.visibility==="all"||event.visibility===perspective;
const teamName=(t:Team)=>t==="red"?"红方":"蓝方";
const robotName=(id:string)=>{const r=groundIdentity(id);return r?teamName(r.team)+r.number+"号":id;};
const structure=(t:Team,kind:"outpost"|"base")=>teamName(t)+(kind==="outpost"?"位置前哨":"基地");
export function eventMessage(e:MatchEvent):{text:string;major:boolean;broadcast:boolean;local?:string}|null{
  switch(e.type){
    case "match-start":return {text:"比赛开始",major:true,broadcast:true};
    case "match-end":return {text:e.winner==="draw"?"比赛结束 · 平局":teamName(e.winner)+"胜利",major:true,broadcast:true};
    case "robot-dead":return {text:robotName(e.robot)+" 战亡",major:false,broadcast:true,local:"战亡"};
    case "robot-revived":return {text:robotName(e.robot)+" 复活",major:false,broadcast:true,local:"复活"};
    case "outpost-destroyed":return {text:structure(e.location,"outpost")+" 摧毁 · 原属"+teamName(e.team),major:true,broadcast:true,local:"已摧毁"};
    case "outpost-rebuilt":return {text:structure(e.location,"outpost")+" 重建 · "+teamName(e.team)+"接管",major:true,broadcast:true,local:"重建 +"+e.hp};
    case "territory":return {text:structure(e.location,e.structure)+"阵地 · "+teamName(e.team)+(e.full?"完全":"临时")+"控制",major:false,broadcast:true};
    case "cover-opening":return {text:teamName(e.location)+"基地护甲开始展开",major:true,broadcast:true,local:"护甲展开中"};
    case "cover-open":return {text:teamName(e.location)+"基地护甲展开完成",major:false,broadcast:true,local:"护甲已展开"};
    case "assembly-start":return {text:robotName(e.robot)+" 开始"+e.level+"级装配",major:false,broadcast:false,local:"装配 0/"+e.total};
    case "assembly-step-start":return {text:"装配动作进行中",major:false,broadcast:false,local:"装配 "+e.completed+"/"+e.total+" · 动作中"};
    case "assembly-step-complete":return {text:"装配步骤完成",major:false,broadcast:false,local:"装配 "+e.completed+"/"+e.total};
    case "assembly-end":return {text:teamName(e.team)+(e.reason?" · "+e.reason:" "+e.level+"级装配成功 · 科技 "+e.technology+"级"),major:!e.reason,broadcast:true,local:e.reason??"装配成功"};
    case "energy-picked":case "energy-dropped":case "energy-spent":{const text=e.type==="energy-picked"?"拾取能量单元":e.type==="energy-dropped"?"释放能量单元":"能量单元消耗";return {text,major:false,broadcast:false,local:text};}
    case "rune-start":case "rune-failed":case "rune-success":{const text=teamName(e.team)+(e.large?"大":"小")+"能量机关"+(e.type==="rune-start"?"挑战开始":e.type==="rune-failed"?"挑战失败":"激活成功");return {text,major:e.type==="rune-success",broadcast:e.type==="rune-success",local:text};}
    case "dart-launch":case "dart-miss":case "dart-hit":{const text=teamName(e.team)+(e.type==="dart-launch"?"飞镖发射":e.type==="dart-miss"?"飞镖未有效命中":"飞镖有效命中 · "+(e.mode==="outpost"?structure(e.location,"outpost"):teamName(e.location)+"基地"));return {text,major:e.type==="dart-hit",broadcast:e.type==="dart-hit",local:text};}
    case "launcher-unlocked":case "launcher-ready":case "launcher-installed":case "launcher-removed":{const local=e.type==="launcher-unlocked"?"发射机构解锁":e.type==="launcher-ready"?"发射机构就绪":e.type==="launcher-installed"?"发射机构已安装 · 待测试":"发射机构已拆卸";return {text:robotName(e.robot)+" "+local,major:false,broadcast:e.type==="launcher-unlocked"||e.type==="launcher-ready",local};}
    case "power-off":return {text:robotName(e.robot)+" 底盘断电",major:false,broadcast:false,local:"底盘断电"};
    case "ammo":case "heal":{if(e.status!=="completed"||!e.amount)return null;const local=(e.type==="ammo"?"补弹 ":"回血 ")+"+"+e.amount;return {text:local,major:false,broadcast:false,local};}
  }
}

type FeedItem={id:number;event:MatchEvent;text:string;major:boolean;received:number};
export function createEventFeed(){
  let serial=0;const recent:FeedItem[]=[];
  function add(event:MatchEvent,now:number){
    const message=eventMessage(event);if(!message?.broadcast)return;
    recent.push({id:++serial,event,text:message.text,major:message.major,received:now});
    if(recent.length>24)recent.shift();
  }
  function view(perspective:"all"|Team,now:number){
    while(recent.length&&now-recent[0].received>=4000)recent.shift();
    const legal=recent.filter(x=>visibleEvent(x.event,perspective));
    const banner=legal.filter(x=>x.major&&now-x.received<2000).at(-1);
    return {items:legal.slice(-3),banner:banner??null};
  }
  return {add,view,clear:()=>{recent.length=0;}};
}
