export type BaseAction="power"|"take"|"assembly"|"communication"|"vision"|"planning"|"history"|"drink"|"water"|"game"|"links";
const ACTIONS:Record<string,Record<string,BaseAction>>={
 mechanical:{"tool-storage":"take",assembly:"assembly","assembly-kit":"assembly",machine:"power",calibration:"power"},
 electrical:{components:"take",oscilloscope:"power",embedded:"communication",solder:"power"},
 vision:{camera:"power",compute:"power","lens-calibration":"vision",dataset:"vision"},
 ai:{models:"power",planning:"planning"},
 honors:{history:"history",trophies:"history",memoir:"history"},
 guild:{"weekly-meeting":"game",burger:"drink","decor-3":"water","decor-4":"water","welcome-wall":"links",board:"links","journey-map":"links"},
};
export function baseAction(room:string|undefined,id:string):BaseAction|undefined{return room?ACTIONS[room]?.[id]:undefined;}
export type BaseRoomState={power:Record<string,boolean>;item:"source"|"held"|"placed";watered:string[];drank:boolean};
export const freshBaseRoom=():BaseRoomState=>({power:{},item:"source",watered:[],drank:false});
export function togglePower(state:BaseRoomState,id:string):BaseRoomState{return {...state,power:{...state.power,[id]:!(state.power[id]??false)}};}
export function transferItem(state:BaseRoomState,to:BaseRoomState["item"]):BaseRoomState{return {...state,item:to};}
export const carriedLabel=(room:string|undefined)=>room==="mechanical"?"装配零件盒":room==="electrical"?"数据连接线":"";
export type Achievement={id:string;title:string;displayed:boolean;createdAt:string};
export const EXHIBIT_IDS=["assembly-guodong","communication","vision","planning","training-guodong","history-2026","fish"] as const;
export const RESEARCH_IDS=EXHIBIT_IDS.slice(0,5);
export function communicationState(power:boolean,cable:"charge"|"data"){return !power?"off":cable==="charge"?"no-data":"connected";}
export const GRID_SIZE=8;
export function planRoute(start:number,goal:number,obstacles:readonly number[]):number[]{
 const valid=(p:number)=>Number.isInteger(p)&&p>=0&&p<GRID_SIZE*GRID_SIZE;
 const blocked=new Set(obstacles);
 if(!valid(start)||!valid(goal)||blocked.has(start)||blocked.has(goal))return [];
 const queue=[start],previous=new Map<number,number>([[start,-1]]);
 for(let i=0;i<queue.length;i++){
  const n=queue[i];if(n===goal){const path:number[]=[];for(let x=n;x!==-1;x=previous.get(x)!)path.unshift(x);return path;}
  const neighbors=[n-GRID_SIZE,n+GRID_SIZE,...(n%GRID_SIZE?[n-1]:[]),...(n%GRID_SIZE!==GRID_SIZE-1?[n+1]:[])];
  for(const next of neighbors)if(valid(next)&&!blocked.has(next)&&!previous.has(next)){previous.set(next,n);queue.push(next);}
 }
 return [];
}
export const BOARD_SIZE=11;
export function hasFive(board:readonly number[],at:number):boolean{
 const side=board[at];if(!side)return false;
 const x=at%BOARD_SIZE,y=Math.floor(at/BOARD_SIZE);
 for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]){
  let n=1;
  for(const sign of [-1,1])for(let step=1;step<5;step++){
   const a=x+dx*sign*step,b=y+dy*sign*step;
   if(a<0||b<0||a>=BOARD_SIZE||b>=BOARD_SIZE||board[b*BOARD_SIZE+a]!==side)break;
   n++;
  }
  if(n>=5)return true;
 }
 return false;
}
export function replyMove(board:readonly number[]):number{
 let best=-1,score=-Infinity;const test=[...board];
 for(let i=0;i<board.length;i++){
  if(board[i])continue;
  test[i]=2;if(hasFive(test,i))return i;
  test[i]=1;const block=hasFive(test,i);test[i]=0;
  let value=block?10000:0;
  const x=i%BOARD_SIZE,y=Math.floor(i/BOARD_SIZE);
  for(let a=-2;a<=2;a++)for(let b=-2;b<=2;b++){
   if(!a&&!b||x+a<0||x+a>=BOARD_SIZE||y+b<0||y+b>=BOARD_SIZE)continue;
   const cell=board[(y+b)*BOARD_SIZE+x+a];if(cell)value+=(cell===2?3:2)/(Math.abs(a)+Math.abs(b));
  }
  value-=Math.hypot(x-5,y-5)*.2;
  if(value>score){score=value;best=i;}
 }
 return best;
}
