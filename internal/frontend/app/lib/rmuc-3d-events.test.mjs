import assert from "node:assert/strict";
import {test} from "node:test";
import {createEventFeed,eventMessage,visibleEvent} from "./rmuc-3d-events.ts";
test("bounded feed filters private events before selecting latest three and retains important events without duplicating them",()=>{
 const feed=createEventFeed();
 const event={type:"launcher-unlocked",at:20,team:"red",robot:"red-2027-heavy-01",hp:400,visibility:"red"};
 feed.add(event,0);
 for(let i=0;i<3;i++)feed.add({type:"outpost-rebuilt",at:21+i,team:"blue",location:"red",hp:500,visibility:"all"},100+i);
 assert.equal(visibleEvent(event,"blue"),false);
 assert.equal(feed.view("all",200).items.length,3);assert.equal(feed.view("blue",200).items.length,3);
 assert.ok(feed.view("all",200).items.at(-1).text.includes("红方位置前哨"));
 assert.equal(feed.view("all",4103).items.length,0);
 feed.add(event,5000);assert.equal(feed.view("blue",5001).items.length,0);assert.equal(feed.view("red",5001).items.length,1);
 feed.clear();assert.equal(feed.view("red",5002).items.length,0);
});
test("ordinary requests do not display fake success or global spam",()=>{
 assert.equal(eventMessage({type:"ammo",status:"requested",amount:100}),null);
 const heal={type:"heal",status:"completed",amount:20,robot:"red-2027-heavy-01",visibility:"red",team:"red",at:1};
 assert.ok(eventMessage(heal).text.includes("01号"));
 const feed=createEventFeed();feed.add(heal,0);assert.equal(feed.view("blue",10).items.length,0);assert.equal(feed.view("red",10).items.length,1);
 const pending=eventMessage({type:"assembly-step-start",completed:0,total:2});assert.equal(pending.broadcast,false);
});

test("important announcements remain in one bounded feed without sacrificing the newest event",()=>{
 const feed=createEventFeed();
 feed.add({type:"match-start",at:0,visibility:"all"},0);
 for(let i=1;i<=4;i++)feed.add({type:"robot-dead",robot:"red-2027-heavy-01",team:"red",visibility:"all",at:i},i*100);
 const items=feed.view("all",500).items;
 assert.equal(items.length,3);assert.equal(items[0].event.type,"match-start");assert.equal(items.at(-1).event.at,4);
 assert.equal(new Set(items.map(i=>i.id)).size,3);
 assert.ok(!feed.view("all",2200).items.some(i=>i.event.type==="match-start"));
});
