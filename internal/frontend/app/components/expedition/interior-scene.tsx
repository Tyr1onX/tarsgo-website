import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { ExpeditionEvolutionTarget, ExpeditionFacilityId } from "~/lib/expedition-data";
import type { ExpeditionTerminal } from "~/lib/expedition-navigation";

export interface SceneDevice { terminal: ExpeditionTerminal; name: string; x: number; y: number }
const DEVICES: Record<ExpeditionFacilityId, readonly SceneDevice[]> = {
  hangar: [{ terminal: "projects", name: "装配控制台", x: 815, y: 580 }, { terminal: "growth", name: "成员档案终端", x: 275, y: 485 }, { terminal: "journal", name: "赛季记录仪", x: 925, y: 295 }],
  mechanical: [{ terminal: "assignments", name: "加工工作台", x: 590, y: 570 }, { terminal: "skills", name: "设计终端", x: 260, y: 355 }, { terminal: "questions", name: "工艺资料库", x: 935, y: 280 }, { terminal: "projects", name: "协作调度台", x: 990, y: 565 }],
  controls: [{ terminal: "assignments", name: "电子实验台", x: 565, y: 545 }, { terminal: "skills", name: "控制系统终端", x: 255, y: 340 }, { terminal: "questions", name: "故障诊断台", x: 925, y: 320 }, { terminal: "projects", name: "系统联调站", x: 930, y: 575 }],
  vision: [{ terminal: "assignments", name: "标定工作台", x: 565, y: 575 }, { terminal: "skills", name: "感知终端", x: 280, y: 340 }, { terminal: "questions", name: "视觉档案库", x: 940, y: 320 }, { terminal: "projects", name: "感知协作站", x: 925, y: 580 }],
  ai: [{ terminal: "assignments", name: "仿真工作台", x: 580, y: 560 }, { terminal: "skills", name: "算法终端", x: 265, y: 340 }, { terminal: "questions", name: "研究资料库", x: 940, y: 320 }, { terminal: "projects", name: "系统集成站", x: 930, y: 580 }],
  operations: [{ terminal: "weekly", name: "周报终端", x: 570, y: 560 }, { terminal: "skills", name: "行动规划台", x: 265, y: 340 }, { terminal: "growth", name: "个人档案库", x: 940, y: 320 }, { terminal: "projects", name: "协作指挥台", x: 940, y: 580 }],
};
export function getSceneDevices(id: ExpeditionFacilityId) { return DEVICES[id]; }
const ACCENTS: Record<ExpeditionFacilityId, string> = { hangar: "#e5bd75", mechanical: "#e5b271", controls: "#70d6cf", vision: "#8cbfe9", ai: "#afa4ec", operations: "#d7c68a" };

function RoomShell({ id, children, mastered }: { id: ExpeditionFacilityId; children: ReactNode; mastered: boolean }) {
  return <>
    <defs>
      <linearGradient id="room-wall" x2="0" y2="1"><stop stopColor="#19282c"/><stop offset="1" stopColor="#0b1419"/></linearGradient>
      <linearGradient id="room-floor" x2="0" y2="1"><stop stopColor="#25373a"/><stop offset="1" stopColor="#101b20"/></linearGradient>
      <linearGradient id="room-metal" x2=".7" y2="1"><stop stopColor="#56666b"/><stop offset=".45" stopColor="#25363d"/><stop offset="1" stopColor="#121d23"/></linearGradient>
      <linearGradient id="room-gold" x2=".9" y2="1"><stop stopColor="#d4ac66"/><stop offset=".5" stopColor="#8a6e41"/><stop offset="1" stopColor="#443c2b"/></linearGradient>
      <linearGradient id="room-screen" x2=".7" y2="1"><stop stopColor="#163d46"/><stop offset="1" stopColor="#071e26"/></linearGradient>
      <radialGradient id="room-atmosphere"><stop stopColor="var(--room-accent)" stopOpacity=".12"/><stop offset="1" stopColor="var(--room-accent)" stopOpacity="0"/></radialGradient>
      <linearGradient id="room-light-beam" x2="0" y2="1"><stop stopColor="var(--room-accent)" stopOpacity=".14"/><stop offset="1" stopColor="var(--room-accent)" stopOpacity="0"/></linearGradient>
      <filter id="room-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
      <pattern id="room-grate" width="12" height="8" patternUnits="userSpaceOnUse"><path d="M0 2h12" stroke="#94aaab" strokeOpacity=".13"/></pattern>
      <pattern id="room-hazard" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="9" height="20" fill="#bd985b"/></pattern>
    </defs>
    <rect width="1200" height="800" fill="#090f15"/>
    <path d="M0 0h1200l-180 145H180z" fill="#121d23"/>
    <path d="M0 0 180 145v285L0 800z" fill="#101c23"/>
    <path d="m1200 0-180 145v285l180 370z" fill="#12212a"/>
    <path d="M180 145h840v285H180z" fill="url(#room-wall)" stroke="#42535a"/>
    <path d="M0 800 180 430h840l180 370z" fill="url(#room-floor)"/>
    {[0,1,2,3,4,5,6,7,8].map(i=><path key={i} d={`M${180+i*105} 430 ${-200+i*200} 800`} stroke="#819f9e" strokeOpacity=".1"/>)}
    {[465,510,580,680,790].map(y=><path key={y} d={`M0 ${y}h1200`} stroke="#809c9e" strokeOpacity=".1"/>)}
    {[0,1,2,3,4].map(i=><g key={i}><path d={`M${120+i*240} 0 ${225+i*180} 145`} stroke="#293b42" strokeWidth="22"/><path d={`M${120+i*240} 0 ${225+i*180} 145`} stroke="#6d8586" strokeOpacity=".35" strokeWidth="2"/></g>)}
    <path d="M180 143h840M180 430h840" stroke="var(--room-accent)" strokeOpacity=".45"/>
    {[210,987].map(x=><g key={x}><path d={`M${x} 153v274`} stroke="#1a2c34" strokeWidth="22"/><path d={`M${x} 165v245`} stroke="var(--room-accent)" strokeWidth="3"/><path d={`M${x} 165v245`} stroke="var(--room-accent)" strokeWidth="10" filter="url(#room-glow)" opacity=".3"/></g>)}
    <path d="M290 32h185l-55 80H330zM725 32h185l-40 80H780z" fill="var(--room-accent)" opacity=".15"/>
    <path d="M330 110h90l210 600H80zM780 110h90l250 600H570z" fill="url(#room-light-beam)"/>
    <ellipse cx="610" cy="425" rx="540" ry="360" fill="url(#room-atmosphere)"/>
    <g fill="#728b91" opacity=".55"><rect x="450" y="160" width="300" height="3"/><text x="600" y="194" textAnchor="middle" fill="var(--room-accent)" fontSize="11" letterSpacing="5">TARS / {id.toUpperCase()}</text></g>
    {children}
    <g className={mastered ? "room-mastery is-active" : "room-mastery"} aria-label={mastered ? "已有经过确认的掌握技能" : undefined}>
      <path d="m1074 490 38-16 35 19-37 18z" fill="#162830" stroke="#5b7476"/><path d="M1110 511v52" stroke="#53696b" strokeWidth="6"/>
      <circle cx="1110" cy="485" r="12" fill="var(--room-accent)"/><circle cx="1110" cy="485" r="25" fill="none" stroke="var(--room-accent)"/>
    </g>
    <path d="M0 800h1200v-38H0z" fill="#071016" opacity=".35"/>
  </>;
}

function Console({ x, y, scale=1, wide=false }: { x:number; y:number; scale?:number; wide?:boolean }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <ellipse cy="32" rx="68" ry="19" fill="#030b10" opacity=".6"/>
    <path d="M-18-30h36l20 62h-76z" fill="url(#room-metal)" stroke="#527178"/>
    <path d={`M${wide?-80:-57}-125h${wide?160:114}v87H${wide?-80:-57}z`} fill="#101c23" stroke="#6d858b" strokeWidth="3"/>
    <rect x={wide?-72:-49} y="-117" width={wide?144:98} height="68" rx="2" fill="url(#room-screen)"/>
    <path d="M-39-105h32M-39-99h21M-39-60h32M13-104h24v24H13zM-39-85l12-10 12 12 13-4 14 13 18-20" fill="none" stroke="var(--room-accent)" strokeWidth="1.5" opacity=".75"/>
    <path d="m-63-36 126 0 15 22H-78z" fill="#2c4147" stroke="#6b8286"/>
    {Array.from({length:9},(_,i)=><path key={i} d={`M${-48+i*12}-31v8`} stroke="#6c8386" strokeWidth="5"/>)}
    <circle cx="44" cy="-44" r="2" className="room-led" fill="var(--room-accent)"/>
  </g>;
}
function Arm({x,y,scale=1}:{x:number;y:number;scale?:number}) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <ellipse cy="24" rx="65" ry="19" fill="#030a0f" opacity=".6"/>
    <path d="m-40 5 40-20 40 20v20l-40 13-40-13z" fill="#27383c" stroke="#657b7d"/>
    <path d="M-21 8v-68h42V8" fill="url(#room-gold)" stroke="#c3a26c"/>
    <g className="room-arm"><path d="M0-57-55-130l12-25 72 84z" fill="url(#room-gold)" stroke="#d7b67b" strokeWidth="2"/><circle cx="-48" cy="-141" r="19" fill="#24353c" stroke="#bfa274" strokeWidth="7"/>
    <path d="m-48-145 85-74 15 20-90 70z" fill="url(#room-gold)" stroke="#d7b67b" strokeWidth="2"/><circle cx="43" cy="-207" r="13" fill="#213640" stroke="#d7b67b" strokeWidth="4"/><path d="m48-210 31 10v16M64-196l14-8 15 10M78-184l-8 11m17-13 9 10" fill="none" stroke="#b2c2bd" strokeWidth="6"/></g>
  </g>;
}
function Rack({x,y,scale=1}:{x:number;y:number;scale?:number}) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}><path d="m-60-210 112 0 22 17v229l-22 16H-60z" fill="#111d26" stroke="#547078"/><path d="M52-210v262l22-16v-229z" fill="#23323b"/>
    {Array.from({length:7},(_,i)=><g key={i} transform={`translate(0 ${-188+i*31})`}><rect x="-51" width="94" height="23" rx="2" fill="#1e303b" stroke="#3e5360"/><circle cx="-36" cy="11" r="6" fill="none" stroke="#7c97a3"/><path d="M-39 11h6m-3-3v6" stroke="#7c97a3" className="room-fan"/><path d="M-21 6h40m-40 5h40m-40 5h40" stroke="#435f69"/><circle cx="32" cy="11" r="2" fill="var(--room-accent)" className="room-led" style={{animationDelay:`${i*-.4}s`}}/></g>)}
  </g>;
}
function Bench({x,y,children}:{x:number;y:number;children?:ReactNode}) {
 return <g transform={`translate(${x} ${y})`}><ellipse cx="5" cy="62" rx="160" ry="30" fill="#040b0f" opacity=".5"/><path d="M-133-4v66h14V-4M120-4v66h14V-4" stroke="#65777b" strokeWidth="6"/><path d="m-160-20 230-18 90 36-246 23z" fill="#435154" stroke="#7b8e8e"/><path d="m-160-20 74 41v18l-74-40zM-86 21l246-23v18l-246 23z" fill="#26373d" stroke="#58696b"/>{children}</g>;
}

function Hangar({targets,joint}:{targets:readonly ExpeditionEvolutionTarget[];joint:boolean}) {
 return <g data-room-art="hangar">
   <path d="M263 220v270M938 220v270" stroke="#3d4848" strokeWidth="25"/><path d="M250 221h700v37H250z" fill="url(#room-gold)" stroke="#e0c28a"/><rect x="250" y="250" width="700" height="8" fill="url(#room-hazard)"/>
   <path d="M303 258v205M898 258v205" stroke="#596c70" strokeWidth="4"/><rect x="543" y="220" width="112" height="45" rx="4" fill="#38484a" stroke="#899c99"/><path d="M599 264v77m-10 0q-4 26 12 26t10-17" stroke="#b4c2ba" strokeWidth="6" fill="none"/>
   <path d="M390 450h420l130 207H250z" fill="#19272d" stroke="#3c535b"/>
   <ellipse cx="600" cy="608" rx="243" ry="72" fill="#050e13"/><ellipse cx="600" cy="585" rx="243" ry="72" fill="#2a393d" stroke="#7d8e86" strokeWidth="2"/>
   <ellipse cx="600" cy="585" rx="211" ry="56" fill="url(#room-grate)" stroke="var(--room-accent)" strokeDasharray="25 10" opacity=".7"/>
   <path d="M472 554h256M488 599h225M600 523v102" stroke="#87968b" strokeOpacity=".3"/>
   {targets.includes("chassis")?<g className="room-assembly" data-assembly-part="chassis"><path d="m475 517 183-24 90 57-183 34z" fill="url(#room-gold)" stroke="#d9be88" strokeWidth="3"/><path d="m475 517 90 67v24l-90-65zM565 584l183-34v24l-183 34z" fill="#343b36" stroke="#a19572"/>{[0,1].map(i=><g key={i} transform={`translate(${506+i*183} ${556-i*10})`}><ellipse rx="24" ry="34" fill="#09141a" stroke="#809899" strokeWidth="5"/><ellipse rx="12" ry="20" fill="#203a43"/></g>)}</g>:<g><path d="M478 568v-28h45m153-10h44v28M552 604v-27h43" fill="none" stroke="#849285" strokeWidth="5"/><text x="600" y="661" textAnchor="middle" fontSize="11" letterSpacing="2" fill="#9daea4">待验收装配位</text></g>}
   {targets.includes("control")?<g data-assembly-part="control"><path d="m560 492 85-16 44 29-85 17z" fill="#317d7d" stroke="#9bddd0"/><path d="M604 522v40m-20-55v-20m28 16v-17m28 12v-17" stroke="#6ad5c2" strokeWidth="4"/><circle cx="603" cy="500" r="6" fill="#a3efcf" className="room-led"/></g>:null}
   {targets.includes("perception")?<g data-assembly-part="perception"><path d="M652 490v-71" stroke="#819a9c" strokeWidth="8"/><rect x="626" y="401" width="55" height="31" rx="6" fill="#142c38" stroke="#94c9df"/><circle cx="654" cy="416" r="10" fill="#326d89" stroke="#91dded"/><path d="m654 416 110-52v104z" fill="#83d9e0" opacity=".09"/></g>:null}
   {targets.includes("decision")?<g data-assembly-part="decision"><rect x="531" y="488" width="25" height="36" fill="#7766a3" stroke="#c2abef"/><circle cx="544" cy="500" r="3" fill="#d4c1ff"/></g>:null}
   {joint?<ellipse data-assembly-part="joint" className="room-scan" cx="600" cy="578" rx="222" ry="61" fill="none" stroke="#abd2a9" strokeWidth="3"/>:null}
   <Arm x={385} y={540} scale={.95}/><Console x={277} y={499} scale={.75}/><Console x={819} y={604} scale={1.1} wide/>
   <g transform="translate(860 233)"><rect width="112" height="100" rx="3" fill="#182b32" stroke="#5b7479"/><path d="M12 15h88M12 33h55M12 44h76M12 65h40M12 76h61" stroke="#89a49e" strokeWidth="2"/><circle className="room-led" cx="96" cy="79" r="3" fill="var(--room-accent)"/></g>
   <path d="M100 684h150m700 0h150" stroke="url(#room-hazard)" strokeWidth="8"/>
 </g>;
}
function Mechanical() {
 return <g data-room-art="mechanical">
   <g transform="translate(210 278)"><path d="m-42 25 139-37 82 37v214l-82 32-139-32z" fill="url(#room-metal)" stroke="#768c8b" strokeWidth="2"/><path d="M-23 45h158v158H-23z" fill="#0a171f" stroke="#55737b" strokeWidth="7"/><path d="M-14 52h140v143H-14z" fill="url(#room-screen)" opacity=".45"/>
   <path d="M-8 150h122v25H-8M53 66v69" stroke="#8caaa7" strokeWidth="8"/><path d="m43 132 20 0-5 25h-10z" fill="#d3bd83"/><ellipse className="room-spindle" cx="53" cy="166" rx="28" ry="7" fill="#a0b7af"/><path d="M-25 217h164" stroke="url(#room-hazard)" strokeWidth="10"/><rect x="141" y="61" width="28" height="54" fill="#344b50"/><circle cx="154" cy="76" r="5" fill="#e3b774"/>
   <text x="55" y="244" textAnchor="middle" fill="#99aaa5" fontSize="9" letterSpacing="3">CNC</text></g>
   <g transform="translate(790 215)"><rect width="210" height="150" fill="#1e2b2f" stroke="#627376"/><path d="M16 20h180M16 48h180M16 76h180M16 104h180M16 132h180" stroke="#718481" strokeDasharray="2 8"/>{[0,1,2,3,4].map(i=><g key={i} transform={`translate(${25+i*36} 36)`}><path d="M0 0v72m-9-72v17q9 15 18 0V0" stroke="#b4bdb0" strokeWidth="5" fill="none"/><circle cy="78" r="5" fill="#7d9696"/></g>)}</g>
   <Bench x={570} y={560}><path d="m-79-37 75-29 100 28-76 32z" fill="#93794e" stroke="#d5b985"/><path d="m-55-48 57-13 50 17-53 11z" fill="#203137" stroke="#8eaaac"/><path d="M-26-40v-32l26-12 32 12v32" fill="#415b62" stroke="#9ab9b8"/><path d="m-15-80 16-8 18 8-18 9zM0-92v-28" fill="#8daead" stroke="#9dbbb7"/><circle cx="0" cy="-132" r="22" fill="none" stroke="var(--room-accent)" strokeWidth="5" strokeDasharray="9 4"/><circle cx="0" cy="-132" r="11" fill="#19333d" stroke="#d0b67e"/></Bench>
   <Arm x={810} y={552} scale={1.12}/><Console x={261} y={387} scale={.72}/><Console x={991} y={597} scale={.8}/>
   <g transform="translate(425 210)"><rect width="254" height="132" rx="5" fill="#0c2029" stroke="#627f82"/><path d="m41 89 74-49 80 16-74 50zM115 40V19m80 37V35m-74 71v-21" stroke="#84b8bd" fill="none"/><circle cx="114" cy="67" r="26" fill="none" stroke="#d5b479" strokeDasharray="3 3"/><path d="M17 116h210M17 16h57" stroke="#68878b"/></g>
   <path d="M119 618h222v18H119M865 650h220v14H865" fill="url(#room-grate)" stroke="#435b5e"/>
   <g transform="translate(85 503)"><path d="m0 0 58-16 52 22-57 17z" fill="#354a4f" stroke="#809591"/><path d="M0 0v83l53 21V23m0 81 57-20V6" fill="#20333a" stroke="#617a7e"/><path d="M9 30l36 15m-36 9 36 15" stroke="#99aaa1" strokeWidth="3"/></g>
 </g>;
}
function Controls() {
 return <g data-room-art="controls">
   <g transform="translate(360 215)"><rect width="465" height="160" rx="5" fill="#0b2028" stroke="#4c8c90"/>{[0,1,2].map(i=><path key={i} d={`M20 ${45+i*44}h50l12-20 22 39 24-42 24 35 25-18h90l15-11 18 14h130`} fill="none" stroke="var(--room-accent)" strokeWidth="2" opacity={1-i*.2}/>)}<path d="M20 14h425M20 145h425" stroke="#395b66"/></g>
   <Bench x={565} y={545}><path d="m-104-30 152-17 54 22-150 19z" fill="#235c59" stroke="#81b5a0"/><path d="m-60-27 54-7 22 10-51 7z" fill="#0e2630" stroke="#91b9ac"/>{[0,1,2,3,4].map(i=><path key={i} d={`M${-70+i*24}-29v-12h${20+i*4}`} stroke="#d9b77e" fill="none"/>)}<path d="M-10-57h55v21h-55z" fill="#1b333a" stroke="#9cb8b0"/><path d="M-73-20v36m110-39v32" stroke="#8dc5b7"/></Bench>
   <Console x={256} y={381} scale={.85}/><Console x={930} y={610} scale={.9}/>
   <g transform="translate(859 255)"><rect width="120" height="100" rx="6" fill="#3b5157" stroke="#9aafad"/><rect x="10" y="10" width="78" height="58" fill="#0c2630"/><path d="M14 42h11l8-22 12 38 14-25 9 10h14" fill="none" stroke="#99e1b1"/><circle cx="101" cy="24" r="7" fill="#112c34" stroke="#95b4b3"/><circle cx="101" cy="49" r="7" fill="#112c34" stroke="#95b4b3"/><path d="M20 82c0 102-48 119-60 166m124-166c0 114 39 130 20 207" stroke="#526f72" strokeWidth="4" fill="none"/></g>
   <Rack x={123} y={585} scale={.66}/><Rack x={1078} y={492} scale={.55}/>
   <path d="M420 642c-90 34-190 0-160-70M698 609c90 56 109 54 139-21" stroke="#b1945c" strokeWidth="5" fill="none"/>
 </g>;
}
function Vision() {
 return <g data-room-art="vision">
   <g transform="translate(414 226)"><rect x="-9" y="-9" width="378" height="185" fill="#20353f" stroke="#587b91"/>{Array.from({length:40},(_,i)=><rect key={i} x={(i%10)*36} y={Math.floor(i/10)*41} width="36" height="41" fill={(i+Math.floor(i/10))%2?"#b6c6c4":"#213640"}/>)}<path d="M0 165h360" stroke="#78d6de" strokeWidth="2"/></g>
   {[{x:362,y:531,s:.95},{x:833,y:526,s:1.1}].map(({x,y,s})=><g key={x} transform={`translate(${x} ${y}) scale(${s})`}><path d="M0-86v84m0-2-45 49m45-49 46 49M0 0v53" stroke="#617d8c" strokeWidth="9"/><path d="m-32-143 65 0 19 13v47l-52 10-32-17z" fill="#354957" stroke="#9db8c3"/><ellipse cy="-109" cx="30" rx="24" ry="29" fill="#0d222c" stroke="#87b7c9" strokeWidth="5"/><ellipse cy="-109" cx="34" rx="12" ry="16" fill="#36778c"/><path d="M37-107 180-176v125z" fill="#8bcedf" opacity=".07"/></g>)}
   <Bench x={570} y={584}><circle cy="-30" r="38" fill="#263e4b" stroke="#9dbbc5"/><circle cy="-30" r="23" fill="none" stroke="#95d6dc" strokeDasharray="4 5"/><path d="M0-76v92m-45-46h90" stroke="#a7ccd3"/><ellipse className="room-scan" cy="-33" rx="67" ry="20" fill="none" stroke="var(--room-accent)"/></Bench>
   <Console x={280} y={380} scale={.8}/><Console x={927} y={611} scale={.84}/>
   <g transform="translate(867 237)"><rect width="120" height="107" fill="#122d3c" stroke="#6b91a6"/><path d="M15 18h90v71H15zM22 25v13m0-13h13m63 0H85m13 0v13M22 82V69m0 13h13m63 0H85m13 0V69" stroke="#91c4d7" fill="none"/><circle cx="60" cy="53" r="21" fill="none" stroke="#d4c18f"/><path d="M60 32v42M39 53h42" stroke="#d4c18f"/></g>
   <path d="m252 650 340-190 344 190" stroke="#8bc0d4" strokeWidth="2" strokeDasharray="7 10" fill="none" opacity=".5"/>
 </g>;
}
function AI() {
 return <g data-room-art="ai">
   {[0,1,2].map(i=><Rack key={i} x={162+i*65} y={513-i*39} scale={1-i*.12}/>)}
   {[0,1,2].map(i=><Rack key={i} x={1035-i*68} y={511-i*39} scale={1-i*.12}/>)}
   <g transform="translate(600 290)"><ellipse cy="111" rx="150" ry="28" fill="#1d3542" stroke="#6e7d9f"/><path d="M-110 110-70-45H70l40 155" fill="#ac9cee" opacity=".04"/>{[-1,0,1].map((l)=><g key={l}>{[-1,0,1].map(n=><g key={n}>{[-1,0,1].map(m=><path key={m} d={`M${-90+l*90} ${n*45} ${l*90} ${m*45}`} stroke="#a69ace" strokeOpacity=".35"/>)}<circle cx={-90+l*90} cy={n*45} r="7" fill="#b4aaef" className="room-led"/></g>)}</g>)}<ellipse className="room-scan" rx="156" ry="90" fill="none" stroke="#a997e2" strokeDasharray="4 8"/></g>
   <Bench x={578} y={568}><path d="m-87-61 130-9 21 60-131 13z" fill="#142637" stroke="#a0a2cb"/><path d="m-79-54 113-7 18 44-113 12z" fill="url(#room-screen)"/><path d="M-65-37h47m-45 9h72m-70 9h40" stroke="#b0a2dc" strokeWidth="2"/></Bench>
   <Console x={265} y={380} scale={.8}/><Console x={930} y={611} scale={.84}/>
   <path d="M432 430 380 635M763 430l62 205" stroke="#9a8ccc" strokeWidth="2" strokeDasharray="8 10"/>
 </g>;
}
function Operations() {
 return <g data-room-art="operations">
   <g transform="translate(365 219)"><path d="M-20 0h510v180H-20z" fill="#0e2833" stroke="#759092" strokeWidth="4"/><path d="m20 35 47-12 36 17 63-8 40 39 40-21 50 21 66-14 85 28-40 59-80 4-60-22-38 20-57-37-53 14-54-44-45 13z" fill="#355257" stroke="#6d9695"/>{[0,1,2,3].map(i=><g key={i}><circle cx={65+i*100} cy={64+i%2*34} r="7" fill="#deca8e"/><path d={`M${65+i*100} ${64+i%2*34} ${165+i*100} ${64+(i+1)%2*34}`} stroke="#bcb47e" strokeDasharray="4 4"/></g>)}<path d="M0 158h460" stroke="#5d8184"/></g>
   <path d="M317 521q280-112 568 0l-33 89q-250-90-505 0z" fill="#374b4f" stroke="#879d99" strokeWidth="3"/><path d="M347 610v52m505-52v52" stroke="#4a6368" strokeWidth="16"/>
   {[0,1,2].map(i=><g key={i} transform={`translate(${430+i*170} ${510+(i===1?-28:0)})`}><path d="M-50-55h100v60H-50z" fill="#152b36" stroke="#88aaa7"/><path d="M-40-44h80v38h-80z" fill="url(#room-screen)"/><path d="M-31-35h32m-32 9h56m-56 9h42" stroke="#a7c6b6"/><path d="M0 5v20m-35 0h70" stroke="#688486" strokeWidth="5"/></g>)}
   <Console x={265} y={380} scale={.8}/><Console x={940} y={610} scale={.84}/>
   <g transform="translate(875 232)"><rect width="110" height="112" fill="#1c343b" stroke="#7c9696"/><circle cx="55" cy="50" r="35" fill="#102a36" stroke="#5e929b"/><path d="M55 15v70M20 50h70m-60-24 50 48m0-48L30 74" stroke="#4f7c83"/><path className="room-scan" d="M55 50 79 25" stroke="#d6c17e" strokeWidth="3"/><circle cx="55" cy="50" r="5" fill="#d6c17e"/></g>
 </g>;
}

export function InteriorScene({ id, name, targets, joint, mastered, onOpen }: { id: ExpeditionFacilityId; name:string; targets:readonly ExpeditionEvolutionTarget[]; joint:boolean; mastered:boolean; onOpen:(terminal:ExpeditionTerminal)=>void }) {
  const devices=DEVICES[id];
  const [mobile,setMobile]=useState(false);
  const [deviceIndex,setDeviceIndex]=useState(0);
  useEffect(()=>{ const media=matchMedia("(max-width: 640px)"); const update=()=>setMobile(media.matches); update(); media.addEventListener("change",update); return()=>media.removeEventListener("change",update); },[]);
  const device=devices[deviceIndex]??devices[0];
  const left=Math.max(0,Math.min(640,device.x-280));
  return <div className={`interior-scene interior-scene--${id}`} style={{"--room-accent":ACCENTS[id]} as CSSProperties} data-room={id}>
    <svg className="interior-scene__art" viewBox={mobile?`${left} 100 560 640`:"0 0 1200 800"} preserveAspectRatio="xMidYMid slice" role="group" aria-label={`${name}独立室内场景`}>
      <RoomShell id={id} mastered={mastered}>
        {id==="hangar"?<Hangar targets={targets} joint={joint}/>:id==="mechanical"?<Mechanical/>:id==="controls"?<Controls/>:id==="vision"?<Vision/>:id==="ai"?<AI/>:<Operations/>}
      </RoomShell>
      {devices.map((item,i)=><g key={item.terminal} className={`interior-device ${mobile&&i!==deviceIndex?"is-away":""}`} transform={`translate(${item.x} ${item.y})`} role="button" tabIndex={mobile&&i!==deviceIndex?-1:0} aria-label={`打开${item.name}`} onClick={()=>onOpen(item.terminal)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();onOpen(item.terminal)}}}>
        <rect className="interior-device__target" x="-84" y="-37" width="168" height="66" rx="6"/>
        <circle className="interior-device__halo" cy="-14" r="14"/><circle cy="-14" r="4" className="interior-device__dot"/>
        <rect className="interior-device__label" x="-70" y="8" width="140" height="30" rx="4"/><text y="28" textAnchor="middle">{item.name} ↗</text>
      </g>)}
    </svg>
    <div className="interior-scene__mobile-controls" aria-label="室内设备探索">
      <button type="button" aria-label="上一个设备" onClick={()=>setDeviceIndex(i=>(i+devices.length-1)%devices.length)}>‹</button>
      <button type="button" className="interior-scene__activate" onClick={()=>onOpen(device.terminal)}><small>0{deviceIndex+1} / 0{devices.length}</small><strong>{device.name}</strong><span>打开终端 ↗</span></button>
      <button type="button" aria-label="下一个设备" onClick={()=>setDeviceIndex(i=>(i+1)%devices.length)}>›</button>
    </div>
  </div>;
}
