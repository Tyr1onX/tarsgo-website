import type { Direction } from "./pixel-jijia-world.ts";

export const EXPLORER_ACTIONS = ["walk","idle","run","sit","stand","observe","wade","swim","enter","exit","cast","wait","bite","reel","catch","turn","swim-turn","stretch","sit-rest"] as const;
export type ExplorerAction = typeof EXPLORER_ACTIONS[number];
export const EXPLORER_FRAME_WIDTH=40,EXPLORER_FRAME_HEIGHT=54,EXPLORER_FRAME_COUNT=6;
const DIRECTIONS:Record<Direction,number>={down:0,left:1,right:2,up:3};
export type ExplorerAnimation={action:ExplorerAction;frame:number;direction:Direction;since:number;water:0|1|2;seated:boolean;turnFrom?:Direction};
export const initialExplorerAnimation:ExplorerAnimation={action:"idle",frame:0,direction:"down",since:0,water:0,seated:false};
type Input={direction:Direction;moving:boolean;sprinting:boolean;distance:number;water:0|1|2;seated:boolean;fishing:"cast"|"wait"|"bite"|"reel"|"catch"|null;now:number;motion:boolean;idleAllowed?:boolean};

export function explorerAnimation(previous:ExplorerAnimation,input:Input):ExplorerAnimation {
  const {direction,moving,sprinting,distance,water,seated,fishing,now,motion}=input;
  const age=now-previous.since,idleAllowed=input.idleAllowed!==false;
  let action:ExplorerAction;
  if(fishing)action=fishing;
  else if(seated)action=motion&&idleAllowed&&((previous.action==="sit-rest"&&age<900)||(previous.action==="sit"&&age>10500))?"sit-rest":"sit";
  else if(previous.seated||(previous.action==="stand"&&age<360))action="stand";
  else if(water>previous.water&&water===2)action="enter";
  else if(water<previous.water&&previous.water===2)action="exit";
  else if((previous.action==="enter"||previous.action==="exit")&&age<360)action=previous.action;
  else if(water===2&&motion&&moving&&(previous.direction!==direction||previous.action==="swim-turn"&&age<180))action="swim-turn";
  else if(water===2)action="swim";
  else if(water===1)action="wade";
  else if(moving&&motion&&(previous.direction!==direction||previous.action==="turn"&&age<150))action="turn";
  else if(moving)action=sprinting?"run":"walk";
  else if(previous.action==="observe"&&age<700)action="observe";
  else if(motion&&idleAllowed&&((previous.action==="stretch"&&age<1200)||(previous.action==="idle"&&age>18000+(Math.imul(Math.floor(previous.since)+1,2654435761)>>>0)%5000)))action="stretch";
  else action="idle";
  const since=action==="sit"&&previous.action==="sit-rest"?now-360:action==="idle"&&!idleAllowed?now:action===previous.action?previous.since:now,elapsed=now-since;
  let frame=0;
  if(action==="walk")frame=Math.floor(distance/.5)%4;
  else if(action==="run")frame=Math.floor(distance/.42)%6;
  else if(action==="wade"||action==="swim")frame=moving?Math.floor(distance/.35)%6:0;
  else if(action==="idle"){
    const cycle=Math.floor(elapsed/5300), blink=2300+(Math.imul(cycle+1,2654435761)>>>0)%2700;
    const within=elapsed%5300;
    const glance=elapsed>6500&&elapsed%11300>=10700&&elapsed%11300<11150;
    frame=motion&&idleAllowed?(within>=blink&&within<blink+150?5:glance?4:Math.floor(elapsed/420)%4):0;
  }
  else if(action==="stretch")frame=Math.min(5,Math.floor(elapsed/200));
  else if(action==="sit-rest")frame=Math.min(5,Math.floor(elapsed/150));
  else if(action==="wait")frame=2;
  else if(action==="bite")frame=motion?Math.floor(elapsed/95)%6:0;
  else frame=Math.min(5,Math.floor(elapsed/60));
  if(!motion&&["sit","stand","enter","exit","cast","reel","catch","observe"].includes(action))frame=5;
  const turnFrom=action==="turn"||action==="swim-turn"?previous.action===action?previous.turnFrom:previous.direction:undefined;
  if(action==="turn"||action==="swim-turn")frame=Math.min(5,Math.floor(elapsed/30));
  return {action,frame,direction,since,water,seated,turnFrom};
}
export function explorerFrameBox(pose:ExplorerAnimation):[number,number,number,number]{
  const turning=pose.action==="turn"||pose.action==="swim-turn";
  const first=turning&&pose.frame===0&&pose.turnFrom;
  const action=first?(pose.action==="swim-turn"?"swim":"idle"):pose.action;
  const direction=first?pose.turnFrom!:pose.direction;
  return [pose.frame*EXPLORER_FRAME_WIDTH,(EXPLORER_ACTIONS.indexOf(action)*4+DIRECTIONS[direction])*EXPLORER_FRAME_HEIGHT,EXPLORER_FRAME_WIDTH,EXPLORER_FRAME_HEIGHT];
}
