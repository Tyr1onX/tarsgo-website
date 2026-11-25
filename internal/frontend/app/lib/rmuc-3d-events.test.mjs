import assert from "node:assert/strict";
import {test} from "node:test";
import {createEventFeed,eventMessage,visibleEvent} from "./rmuc-3d-events.ts";
test("bounded feed filters private events before selecting latest three and expires banners separately",()=>{
 const feed=createEventFeed();
 const event={type:"launcher-unlocked",at:20,team:"red",robot:"red-2027-heavy-01",hp:400,visibility:"red"};
 feed.add(event,0);
 for(let i=0;i<3;i++)feed.add({type:"outpost-rebuilt",at:21+i,team:"blue",location:"red",hp:500,visibility:"all"},100+i);
 assert.equal(visibleEvent(event,"blue"),false);
 assert.equal(feed.view("all",200).items.length,3);assert.equal(feed.view("blue",200).items.length,3);
 assert.ok(feed.view("all",200).banner.text.includes("红方位置前哨"));
 assert.equal(feed.view("all",2103).banner,null);
 assert.equal(feed.view("all",4103).items.length,0);
 feed.add(event,5000);assert.equal(feed.view("blue",5001).items.length,0);assert.equal(feed.view("red",5001).items.length,1);
 feed.clear();assert.equal(feed.view("red",5002).items.length,0);
});
test("ordinary requests do not display fake success or global spam",()=>{
 assert.equal(eventMessage({type:"ammo",status:"requested",amount:100}),null);
 assert.equal(eventMessage({type:"heal",status:"completed",amount:20}).broadcast,false);
 const pending=eventMessage({type:"assembly-step-start",completed:0,total:2});assert.equal(pending.broadcast,false);assert.ok(pending.local.includes("动作中"));
});
