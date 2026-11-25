import test from "node:test";
import assert from "node:assert/strict";
import {baseAction,freshBaseRoom,togglePower,transferItem,communicationState,planRoute,hasFive,replyMove,BOARD_SIZE,EXHIBIT_IDS,RESEARCH_IDS} from "./pixel-jijia-base.ts";
import {equipmentProgress} from "./pixel-jijia-room-art.ts";
import {ROOMS,roomInteractable} from "./pixel-jijia-room.ts";
test("六馆的新增入口复用原物件且可交互",()=>{
 for(const [room,id] of [["mechanical","tool-storage"],["mechanical","assembly-kit"],["electrical","embedded"],["vision","lens-calibration"],["ai","planning"],["honors","history"],["guild","weekly-meeting"],["guild","decor-3"]]){
  assert.ok(baseAction(room,id));assert.ok(roomInteractable(ROOMS[room],ROOMS[room].objects.find(o=>o.id===id)));
 }
});
test("临时物件唯一位置及场景恢复",()=>{
 const empty=freshBaseRoom(),held=transferItem(empty,"held"),placed=transferItem(held,"placed");
 assert.equal(empty.item,"source");assert.equal(held.item,"held");assert.equal(placed.item,"placed");
 assert.equal(freshBaseRoom().item,"source");assert.equal(transferItem(placed,"source").item,"source");
});
test("手动开关优先于昼夜自动行为，关闭后不再运行",()=>{
 const s=togglePower(freshBaseRoom(),"machine");
 assert.equal(s.power.machine,true);assert.ok(equipmentProgress("machine",21000,1000,1,true)>=0);
 const off=togglePower(s,"machine");assert.equal(equipmentProgress("machine",21000,1000,12,off.power.machine),-1);
});
test("通信结果由电源和连接物件实际决定",()=>{
 assert.equal(communicationState(false,"data"),"off");
 assert.equal(communicationState(true,"charge"),"no-data");assert.equal(communicationState(true,"data"),"connected");
});
test("实际网格规划绕障、不可达及不跨行",()=>{
 const path=planRoute(0,63,[18,19,20,26,34,42]);
 assert.equal(path[0],0);assert.equal(path.at(-1),63);
 for(let i=1;i<path.length;i++){assert.ok([1,8].includes(Math.abs(path[i]-path[i-1])));assert.ok(![18,19,20,26,34,42].includes(path[i]));}
 assert.deepEqual(planRoute(0,63,[1,8]),[]);assert.deepEqual(planRoute(7,8,[]).length,9);
 assert.deepEqual(planRoute(-1,0,[]),[]);
});
test("五子棋四方向胜负，陪练优先获胜或阻止四连",()=>{
 for(const delta of [1,BOARD_SIZE,BOARD_SIZE+1,BOARD_SIZE-1]){
  const b=Array(BOARD_SIZE**2).fill(0),start=delta===BOARD_SIZE-1?6:0;
  for(let i=0;i<5;i++)b[start+i*delta]=1;
  assert.ok(hasFive(b,start+delta*4));
 }
 const b=Array(BOARD_SIZE**2).fill(0);for(let i=0;i<4;i++)b[i]=1;
 assert.equal(replyMove(b),4);for(let i=0;i<4;i++)b[20+i*BOARD_SIZE]=2;
 assert.ok([9,64].includes(replyMove(b)));
});
test("研究纪念为独立成果引用，固定展位无重复",()=>{assert.equal(new Set(EXHIBIT_IDS).size,EXHIBIT_IDS.length);assert.deepEqual(RESEARCH_IDS,EXHIBIT_IDS.slice(0,5));});
