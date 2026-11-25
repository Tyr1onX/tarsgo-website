import type {DamageEvent,MatchEvent,Match,Team} from './rmuc-3d-match.ts';
export type Shot={kind:'all'}|{kind:'follow'|'ai-first';robot:string}|{kind:'detail';team:Team;object:'base'|'outpost'|'core'|'rune'};
type Candidate={shot:Shot;priority:number;until:number};
// Only presentation candidates; never writes Match or consumes its random streams.
export function createDirector(){
 let current:Shot={kind:'all'},since=0,pending:Candidate|null=null,enabled=false;
 let combat:{robot:string;at:number;hits:number}|null=null;
 const offer=(shot:Shot,priority:number,at:number,life=7)=>{if(enabled&&(!pending||pending.until<at||priority>=pending.priority))pending={shot,priority,until:at+life};};
 function event(e:MatchEvent){
  if(!enabled)return;
  switch(e.type){
   case 'assembly-start':case 'assembly-step-start':case 'assembly-step-complete':offer({kind:'detail',team:e.core??e.team,object:'core'},8,e.at,14);break;
   case 'assembly-end':offer({kind:'detail',team:e.team,object:'core'},8,e.at);break;
   case 'rune-start':case 'rune-success':offer({kind:'detail',team:e.team,object:'rune'},7,e.at,10);break;
   case 'outpost-destroyed':case 'outpost-rebuilt':offer({kind:'detail',team:e.location,object:'outpost'},9,e.at);break;
   case 'cover-opening':case 'cover-open':offer({kind:'detail',team:e.location,object:'base'},10,e.at);break;
   case 'robot-dead':case 'robot-revived':offer({kind:'follow',robot:e.robot},5,e.at);break;
   case 'dart-launch':offer({kind:'detail',team:e.location,object:e.mode==='outpost'?'outpost':'base'},8,e.at);break;
   case 'dart-hit':offer({kind:'detail',team:e.location,object:e.mode==='outpost'?'outpost':'base'},9,e.at);break;
  }
 }
 function damage(e:DamageEvent){if(!enabled)return;if(e.target.type==='robot'){const id=e.target.id;combat=combat?.robot===id&&e.at-combat.at<2?{robot:id,at:e.at,hits:combat.hits+1}:{robot:id,at:e.at,hits:1};offer({kind:combat.hits>=3?'ai-first':'follow',robot:id},4,e.at);}else offer({kind:'detail',team:e.target.team,object:e.target.type},4,e.at);}
 function choose(m:Match):Shot|null{
  if(!enabled||m.phase!=='running')return null;
  const at=m.elapsed,age=at-since;
  if(pending&&pending.until<at)pending=null;
  const shot=current;
  if(shot.kind==='detail'&&shot.object==='core'&&Object.values(m.sides).some(s=>s.tech.attempt?.deadAt===null&&s.tech.attempt.slots.some(slot=>slot.core===shot.team)))return null;
  if(age<4&&!(age>=2&&pending&&pending.priority>=9))return null;
  let next:Shot={kind:'all'};
  if(pending){
   if(current.kind==="detail"&&current.object==="rune"&&m.sides[current.team].rune.attempt&&age<8&&pending.priority<9)return null;
   next=pending.shot;pending=null;
  }
  else if(current.kind==='detail'&&current.object==='rune'&&m.sides[current.team].rune.attempt&&age<14)return null;
  else if(age<7)return null;
  if(next.kind==="ai-first"){const id=next.robot;if(!m.robots.some(r=>r.id===id&&r.hp>0))next={kind:"follow",robot:id};}
  if(JSON.stringify(next)===JSON.stringify(current)){if(current.kind!=="all")since=at;return null;}
  current=next;since=at;return next;
 }
 return {get enabled(){return enabled;},start(at:number){enabled=true;current={kind:'all'};since=at;pending=null;combat=null;},stop(){enabled=false;pending=null;combat=null;},event,damage,choose};
}
