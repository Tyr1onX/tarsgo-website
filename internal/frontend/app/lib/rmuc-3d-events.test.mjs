import assert from "node:assert/strict";
import {test} from "node:test";
import {createEventFeed,eventMessage,visibleEvent} from "./rmuc-3d-events.ts";

const death=(at=1,visibility="all")=>({type:"robot-dead",at,team:"red",robot:"red-2027-heavy-01",hp:0,visibility});
const start={type:"match-start",at:0,visibility:"all"};
const rebuild={type:"outpost-rebuilt",at:2,team:"blue",location:"red",hp:500,visibility:"all"};
test("feed filters private events before priority selection and expires old events",()=>{
 const feed=createEventFeed();
 const privateEvent=death(1,"red");
 feed.add(privateEvent,0);
 assert.equal(visibleEvent(privateEvent,"blue"),false);
 assert.equal(feed.view("blue",1).items.length,0);
 assert.equal(feed.view("red",1).items.length,1);
 feed.add(rebuild,100);
 assert.equal(feed.view("blue",101).items[0].text,"红方位置前哨 重建 · 蓝方接管");
 assert.equal(feed.view("all",4100).items.length,0);
 feed.add(privateEvent,5000);
 feed.clear();
 assert.equal(feed.view("red",5001).items.length,0);
});
test("ordinary local events never enter the global feed",()=>{
 const feed=createEventFeed();
 for(const type of ["ammo","heal","robot-revived","power-off","launcher-ready","launcher-unlocked","launcher-installed","launcher-removed","energy-picked","energy-dropped","energy-spent","assembly-start","assembly-step-start","assembly-step-complete","rune-start","rune-failed","dart-launch","dart-miss","cover-open"]){
  const e={...death(),type,status:"completed",amount:20};
  assert.equal(eventMessage(e),null,type);
  feed.add(e,0);
 }
 assert.equal(eventMessage({type:"assembly-end",reason:"cancelled"}),null);
 assert.equal(feed.view("all",1).items.length,0);
});
test("major events survive ordinary bursts, compact HUD sees priority last, duplicate receipts collapse",()=>{
 const feed=createEventFeed();
 feed.add(start,0);
 feed.add(start,1);
 for(let i=1;i<=30;i++)feed.add(death(i),i*10);
 const items=feed.view("all",500).items;
 assert.equal(items.length,3);
 assert.equal(items.at(-1).event.type,"match-start");
 assert.equal(items.filter(i=>i.event.type==="match-start").length,1);
 assert.equal(items[1].event.at,30);
 assert.equal(feed.view("all",4000).items.some(i=>i.event.type==="match-start"),false);
 const end={type:"match-end",winner:"red",visibility:"all",at:420};
 feed.add(end,4010);
 assert.equal(feed.view("all",4011).items.at(-1).event.type,"match-end");
});
test("strategic successes have higher priority than routine war reports",()=>{
 assert.equal(eventMessage(rebuild).major,false);
 assert.equal(eventMessage({type:"territory",team:"blue",location:"red",structure:"outpost",full:true}).major,true);
 assert.equal(eventMessage({type:"territory",team:"blue",location:"red",structure:"outpost",full:false}).major,false);
 assert.equal(eventMessage({type:"assembly-end",team:"blue",level:3,technology:3}).major,true);
 assert.equal(eventMessage({type:"assembly-end",team:"blue",level:1,technology:1}).major,false);
});

test("same-tick outpost transitions and impacts merge without hiding either team's major outcome",()=>{
 const f=createEventFeed(),at=46.75;
 const destroy=(location,at)=>({type:"outpost-destroyed",team:location,location,hp:0,at,visibility:"all"});
 f.add(destroy("red",at),0);
 f.add({type:"territory",team:"blue",location:"red",structure:"outpost",full:true,at,visibility:"all"},0);
 f.add({type:"outpost-rebuilt",team:"blue",location:"red",hp:500,at,visibility:"all"},0);
 f.add({type:"dart-hit",team:"blue",location:"red",mode:"outpost",at,visibility:"all"},0);
 f.add(destroy("red",at),1);
 f.add(destroy("blue",at+.125),125);
 const early=f.view("all",150).items;
 assert.equal(early.length,2);
 assert.match(early.at(-1).text,/红方位置前哨.*蓝方接管.*蓝方飞镖命中/);
 assert.equal(f.view("all",1300).items.at(-1).event.location,"blue");
});
