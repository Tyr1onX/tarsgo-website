import {useEffect,useRef,useState} from "react";
import {Link} from "react-router";
import {CommunitySprite,Memoir} from "./pixel-jijia-community-detail";
import {apiRequest} from "~/lib/api-client";
import {getCurrentUser,getCachedCurrentUser,subscribeAccountSessionChange} from "~/lib/auth-client";
import {ROBOT_MODELS} from "~/lib/pixel-jijia-robot";
import {BOARD_SIZE,GRID_SIZE,hasFive,replyMove,planRoute,communicationState,type Achievement,type BaseAction,type BaseRoomState} from "~/lib/pixel-jijia-base";

export function SaveAchievement({id}:{id:string}){
 const [status,setStatus]=useState<"idle"|"saving"|"saved">("idle"),[error,setError]=useState("");
 const pending=useRef<AbortController|null>(null),title=useRef("");
 useEffect(()=>{
  const stop=subscribeAccountSessionChange(()=>{pending.current?.abort();setStatus("idle");setError("");});
  return()=>{stop();pending.current?.abort();};
 },[]);
 async function save(){
  if(pending.current)return;
  const controller=new AbortController();pending.current=controller;setStatus("saving");setError("");
  try{
   const user=await getCurrentUser();if(controller.signal.aborted||getCachedCurrentUser()?.id!==user.id)return;
   const rows=await apiRequest<Achievement[]>("/api/pixel-home/achievements",{method:"POST",body:{id},signal:controller.signal});
   if(controller.signal.aborted||getCachedCurrentUser()?.id!==user.id)return;
   const row=rows.find(row=>row.id===id);if(!row)throw new Error("成果未保存");
   title.current=row.title;setStatus("saved");
  }catch(e){if(!controller.signal.aborted){setStatus("idle");setError(e instanceof Error?e.message:"保存失败");}}
  finally{if(pending.current===controller){pending.current=null;if(!controller.signal.aborted)setStatus(s=>s==="saving"?"idle":s);}}
 }
 return <div className="pixel-base-save">
  <button type="button" className="pixel-community-action" disabled={status!=="idle"} onClick={()=>void save()}>{status==="saved"?"已保存至个人成果":status==="saving"?"保存中…":"保存纪念成果"}</button>
  {error&&<span role="status">{error}</span>}
  {status==="saved"&&<><button type="button" className="pixel-community-action" onClick={()=>void navigator.clipboard.writeText("我在像素吉甲完成了一项基地纪念成果："+title.current+"，欢迎来我的研究室参观。").catch(()=>setError("复制失败"))}>复制分享内容</button><Link to="/dashboard">前往社区</Link></>}
 </div>;
}

function RobotSprite({model=ROBOT_MODELS.guodong,upper=true,body=true}:{model?:typeof ROBOT_MODELS.guodong|typeof ROBOT_MODELS.wheelLeg;upper?:boolean;body?:boolean}){
 const w=model.width*model.nativeScale,h=model.height*model.nativeScale;
 const image={backgroundImage:`url(${model.atlas})`,backgroundSize:`${w*8}px ${h*(model.wheelFrames+1)}px`};
 return <span className="pixel-base-robot" style={{width:w,height:h}}>
  {body&&<span style={{...image,backgroundPosition:`-${2*w}px 0`}}/>}
  {upper&&<span style={{...image,backgroundPosition:`0 -${h*model.wheelFrames}px`}}/>}
 </span>;
}
const PARTS=[["底盘","part-chassis"],["动力模块","part-drive"],["上部机构","part-turret"],["装甲","part-armor"]] as const;
function Assembly({ready,returnKit}:{ready:boolean;returnKit:()=>void}){
 const [installed,setInstalled]=useState<number[]>([]),[selected,setSelected]=useState<number|null>(null);
 const [checked,setChecked]=useState(false),[wrong,setWrong]=useState(false);
 const done=installed.length===PARTS.length;
 function place(slot:number,part=selected){
  if(part===null||installed.includes(slot))return;
  if(part!==slot||(slot>0&&!installed.includes(0))){setWrong(true);return;}
  setInstalled(old=>[...old,slot]);setSelected(null);setWrong(false);
 }
 if(!ready)return <p>先从工具储藏柜拿取零件盒，再回到工作台。</p>;
 return <div className="pixel-community-interaction">
  <div className="pixel-base-assembly-board">
   <RobotSprite body={installed.includes(0)&&installed.includes(1)&&installed.includes(3)} upper={installed.includes(2)}/>
   <div className="pixel-base-assembly-slots">
    {PARTS.map(([name,sprite],i)=><button type="button" key={name} aria-label={`安装位置：${name}`} data-installed={installed.includes(i)} disabled={installed.includes(i)} onClick={()=>place(i)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const value=e.dataTransfer.getData("text/plain");if(/^[0-3]$/.test(value))place(i,Number(value));}}>
     <CommunitySprite id={sprite} maxWidth={44} maxHeight={33}/><span>{installed.includes(i)?"已安装":name}</span>
    </button>)}
   </div>
  </div>
  {!done&&<div className="pixel-community-controls" aria-label="零件盒">
   {PARTS.map(([name,sprite],i)=>!installed.includes(i)&&<button type="button" key={name} draggable aria-pressed={selected===i} onClick={()=>{setSelected(i);setWrong(false);}} onDragStart={e=>e.dataTransfer.setData("text/plain",String(i))}><CommunitySprite id={sprite} maxWidth={34} maxHeight={27}/>{name}</button>)}
  </div>}
  {wrong&&<span role="status">部件未对准，先安装底盘。</span>}
  {done&&!checked&&<button type="button" className="pixel-community-action" onClick={()=>setChecked(true)}>整机检查并启动</button>}
  {checked&&<><span role="status">整机检查通过 · 过洞步兵</span><SaveAchievement id="assembly-guodong"/></>}
  <button type="button" className="pixel-community-action" onClick={()=>{setInstalled([]);setSelected(null);setChecked(false);setWrong(false);returnKit();}}>归还零件盒</button>
 </div>;
}
type RoomProps={state:BaseRoomState;setState:(state:BaseRoomState)=>void};
function Communication({state,setState}:RoomProps){
 const power=state.power.oscilloscope===true;
 const cable=state.item==="placed"?"data":"charge";
 const signal=communicationState(power,cable);
 const [tested,setTested]=useState<string|null>(null);
 function update(next:BaseRoomState){setTested(null);setState(next);}
 return <div className="pixel-community-interaction">
  <div className="pixel-base-screen" data-signal={signal}>
   <svg viewBox="0 0 240 80" role="img" aria-label="虚拟示波器波形"><path d="M0 40H240 M40 0V80 M80 0V80 M120 0V80 M160 0V80 M200 0V80" stroke="#314d47" fill="none"/>
   {power&&<path d={signal==="connected"?"M0 55H20V25H40V55H70V25H90V55H120V25H150V55H180V25H200V55H240":"M0 55H240"} stroke="#a7dc9b" strokeWidth="2" fill="none"/>}</svg>
   <span>{power?"供电正常":"电源关闭"} · {signal==="connected"?"通信已连接":signal==="off"?"无信号":"通信未建立"}</span>
  </div>
  <div className="pixel-base-cable"><span>设备</span><span className={cable==="data"?"connected":""}>{cable==="data"?"数据连接线":"仅充电线"}</span><span>信号台</span></div>
  <div className="pixel-community-controls">
   <button type="button" aria-pressed={power} onClick={()=>update({...state,power:{...state.power,oscilloscope:!power}})}>{power?"关闭电源":"开启电源"}</button>
   <button type="button" disabled={state.item==="source"} onClick={()=>update({...state,item:state.item==="placed"?"held":"placed"})}>{state.item==="placed"?"拔出数据线":"连接数据线"}</button>
   <button type="button" onClick={()=>setTested(signal)}>通信测试</button>
  </div>
  {state.item==="source"&&<span>数据连接线在元件收纳柜。</span>}
  {tested&&<span role="status">{tested==="connected"?"测试通过：设备已建立通信":tested==="off"?"测试失败：设备未供电":"测试失败：连接线无数据通路"}</span>}
  {tested==="connected"&&signal==="connected"&&<SaveAchievement id="communication"/>}
 </div>;
}
function Vision({state,setState}:RoomProps){
 const power=state.power.camera===true;
 const [kind,setKind]=useState<"guodong"|"wheelLeg">("guodong"),[direction,setDirection]=useState<"left"|"right">("left");
 const [dark,setDark]=useState(false),[cover,setCover]=useState(false),[marked,setMarked]=useState<string|null>(null);
 const [result,setResult]=useState(""),[acquired,setAcquired]=useState(false),[lost,setLost]=useState(false),[done,setDone]=useState(false);
 const visible=direction==="left"?"guodong":"wheelLeg";
 const tracked=power&&!dark&&!cover&&visible===kind&&marked===kind;
 function check(){
  setResult(tracked?"目标已获取 / 追踪中":!power?"摄像头未开启":dark||cover?"目标丢失：视野受限":"未获取指定目标");
  if(tracked){setAcquired(true);if(lost)setDone(true);}
  else if(acquired)setLost(true);
 }
 return <div className="pixel-community-interaction">
  <div className="pixel-base-feed" data-dark={dark} data-cover={cover} data-power={power}>
   {power&&<button type="button" aria-label={visible==="guodong"?"标注过洞步兵":"标注轮腿机器人"} className="pixel-base-feed-target" aria-pressed={marked===visible} onClick={()=>{setMarked(visible);setResult("");}}><RobotSprite model={ROBOT_MODELS[visible]}/></button>}
   {cover&&power&&<span className="pixel-base-cover"/>}
   <span className="pixel-base-feed-caption">{!power?"CAM OFF":direction==="left"?"CAM · 西":"CAM · 东"}</span>
  </div>
  <div className="pixel-community-controls">
   <button type="button" onClick={()=>{setState({...state,power:{...state.power,camera:!power}});setResult("");}}>{power?"关闭摄像头":"开启摄像头"}</button>
   <button type="button" onClick={()=>{setDirection(direction==="left"?"right":"left");setMarked(null);setResult("");}}>切换视野</button>
   <label>目标 <select aria-label="识别目标" value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setMarked(null);setResult("");setAcquired(false);setLost(false);setDone(false);}}><option value="guodong">过洞步兵</option><option value="wheelLeg">轮腿机器人</option></select></label>
   <button type="button" aria-pressed={dark} onClick={()=>{setDark(!dark);setResult("");}}>弱光</button>
   <button type="button" aria-pressed={cover} onClick={()=>{setCover(!cover);setResult("");}}>遮挡</button>
   <button type="button" onClick={check}>识别测试</button>
  </div>
  {result&&<span role="status">{result}</span>}
  {acquired&&!done&&<span>改变视野、光照或遮挡，观察丢失与重新获取。</span>}
  {done&&<SaveAchievement id="vision"/>}
 </div>;
}
function Planning({state,setState}:RoomProps){
 const power=state.power.models===true;
 const [start,setStart]=useState(0),[goal,setGoal]=useState(63),[walls,setWalls]=useState([18,19,20,26,34,42]);
 const [tool,setTool]=useState<"start"|"goal"|"wall">("wall"),[path,setPath]=useState<number[]|null>(null),[running,setRunning]=useState(false),[done,setDone]=useState(false);
 const marker=useRef<HTMLDivElement>(null),animation=useRef<Animation|null>(null);
 useEffect(()=>()=>animation.current?.cancel(),[]);
 function edit(i:number){if(running)return;animation.current?.cancel();setPath(null);setDone(false);if(tool==="start"&&!walls.includes(i))setStart(i);else if(tool==="goal"&&!walls.includes(i))setGoal(i);else if(tool==="wall"&&i!==start&&i!==goal)setWalls(old=>old.includes(i)?old.filter(x=>x!==i):[...old,i]);}
 function run(){
  if(!path?.length||!marker.current)return;
  const a=marker.current.animate(path.map(i=>({left:`${(i%GRID_SIZE+.5)*100/GRID_SIZE}%`,top:`${(Math.floor(i/GRID_SIZE)+.5)*100/GRID_SIZE}%`})),{duration:matchMedia("(prefers-reduced-motion: reduce)").matches?0:Math.max(300,path.length*150),easing:"linear",fill:"forwards"});
  animation.current=a;setRunning(true);setDone(false);
  void a.finished.then(()=>{setRunning(false);setDone(true);},()=>{});
 }
 return <div className="pixel-community-interaction">
  <div className="pixel-base-grid-wrap">
   <div className="pixel-base-grid" style={{gridTemplateColumns:`repeat(${GRID_SIZE},1fr)`}}>
    {Array.from({length:GRID_SIZE*GRID_SIZE},(_,i)=><button key={i} type="button" aria-label={`${Math.floor(i/GRID_SIZE)+1}行${i%GRID_SIZE+1}列`} data-cell={i===start?"start":i===goal?"goal":walls.includes(i)?"wall":path?.includes(i)?"path":"empty"} disabled={running} onClick={()=>edit(i)}>{i===start?"起":i===goal?"终":""}</button>)}
   </div>
   <div ref={marker} className="pixel-base-path-marker" style={{left:`${(start%GRID_SIZE+.5)*100/GRID_SIZE}%`,top:`${(Math.floor(start/GRID_SIZE)+.5)*100/GRID_SIZE}%`}}/>
  </div>
  <div className="pixel-community-controls">
   {(["start","goal","wall"] as const).map(t=><button key={t} type="button" aria-pressed={tool===t} disabled={running} onClick={()=>setTool(t)}>{{start:"起点",goal:"目标",wall:"障碍"}[t]}</button>)}
   <button type="button" disabled={running} onClick={()=>{setState({...state,power:{...state.power,models:!power}});setPath(null);setDone(false);animation.current?.cancel();}}>{power?"关闭计算站":"启动计算站"}</button>
   <button type="button" disabled={running||!power} onClick={()=>{animation.current?.cancel();setPath(planRoute(start,goal,walls));setDone(false);}}>计算路径</button>
   <button type="button" disabled={running||!path?.length} onClick={run}>执行路径</button>
  </div>
  {path&&<span role="status">{!path.length?"目标不可达":done?"自主导航完成":`可通行路径：${path.length-1} 格`}</span>}
  {done&&<SaveAchievement id="planning"/>}
 </div>;
}
function Gomoku(){
 const [board,setBoard]=useState<number[]>(()=>Array(BOARD_SIZE*BOARD_SIZE).fill(0)),[result,setResult]=useState("");
 function play(i:number){
  if(board[i]||result)return;
  const next=[...board];next[i]=1;
  if(hasFive(next,i))setResult("黑棋获胜");
  else if(next.every(Boolean))setResult("和棋");
  else {const j=replyMove(next);if(j>=0){next[j]=2;if(hasFive(next,j))setResult("白棋获胜");else if(next.every(Boolean))setResult("和棋");}}
  setBoard(next);
 }
 return <div className="pixel-community-interaction">
  <div className="pixel-base-gomoku" style={{gridTemplateColumns:`repeat(${BOARD_SIZE},1fr)`}}>
   {board.map((v,i)=><button key={i} type="button" aria-label={`${Math.floor(i/BOARD_SIZE)+1}行${i%BOARD_SIZE+1}列 ${v===1?"黑":v===2?"白":"空"}`} data-piece={v} disabled={!!v||!!result} onClick={()=>play(i)}/>)}
  </div>
  <div className="pixel-community-controls"><span role="status">{result||"黑棋 · 轮到你"}</span><button type="button" onClick={()=>{setBoard(Array(BOARD_SIZE*BOARD_SIZE).fill(0));setResult("");}}>重新开始</button></div>
 </div>;
}
export function BaseObjectDetail({action,state,setState,objectId}:RoomProps&{action:BaseAction;objectId:string}){
 if(action==="assembly")return <Assembly ready={state.item==="placed"} returnKit={()=>setState({...state,item:"source"})}/>;
 if(action==="communication")return <Communication state={state} setState={setState}/>;
 if(action==="vision")return <Vision state={state} setState={setState}/>;
 if(action==="planning")return <Planning state={state} setState={setState}/>;
 if(action==="history")return <Memoir collect={<SaveAchievement id="history-2026"/>}/>;
 if(action==="game")return <Gomoku/>;
 if(action==="links")return <div className="pixel-community-interaction">
  {objectId==="board"?<Link className="pixel-world-detail-link" to="/programs">查看公开活动</Link>:objectId==="journey-map"?<><Link className="pixel-world-detail-link" to="/dashboard/assignments">新人作业</Link><Link className="pixel-world-detail-secondary-link" to="/dashboard/workbench">成员工作台</Link></>:<Link className="pixel-world-detail-link" to="/dashboard">成员社区</Link>}
 </div>;
 return null;
}
