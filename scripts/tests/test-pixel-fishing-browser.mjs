// Exercise the built game and its real account API against the synthetic acceptance DB.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { testRMUCWorld } from "./test-rmuc-world-browser.mjs";

const origin = "http://127.0.0.1:8182";
const profile = await mkdtemp(join(tmpdir(), "pixel-fishing-browser-"));
const chrome = spawn(process.env.CHROME_BIN || "google-chrome", [
  "--headless=new", "--enable-unsafe-swiftshader", "--disable-dev-shm-usage", "--disable-background-timer-throttling",
  "--window-size=1200,850", "--remote-debugging-port=0", "--user-data-dir="+profile, "about:blank",
], {stdio:"ignore"});
const output = process.env.PIXEL_QA_OUTPUT;
const natureOnly=process.env.PIXEL_QA_PHASE3_ONLY==="true";
let diagnose=async()=>{};
if (output) await mkdir(output, {recursive:true});
async function until(check, label, ms=30000) {
  const end = Date.now()+ms;
  while(Date.now()<end) {
    const result=await check();
    if(result)return result;
    await delay(150);
  }
  await diagnose(label);
  throw Error("Timed out: "+label);
}
let socket;
try {
  const port=await until(async()=>{try{return (await readFile(join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0]}catch{return false}}, "Chrome");
  const pages=await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();
  socket=new WebSocket(pages.find(p=>p.type==="page").webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let seq=0;
  const pending=new Map();
  socket.onmessage=({data})=>{
    const msg=JSON.parse(data);
    if(!pending.has(msg.id))return;
    const {resolve,reject}=pending.get(msg.id);pending.delete(msg.id);
    if(msg.error)reject(Error(msg.error.message));else resolve(msg.result);
  };
  function command(method,params={}) {
    const id=++seq;
    return new Promise((resolve,reject)=>{
      pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));
    });
  }
  async function evaluate(expression) {
    const r=await command("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
    if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
    return r.result.value;
  }
  const state="document.querySelector('canvas[data-player-x]')?.dataset";
  async function key(k) {
    for(const type of ["keyDown","keyUp"])await command("Input.dispatchKeyEvent",{type,key:k,code:"Key"+k.toUpperCase(),windowsVirtualKeyCode:k.toUpperCase().charCodeAt(0)});
  }
  async function tap(selector, label) {
    const box=await evaluate(`(()=>{const btn=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.textContent.includes(${JSON.stringify(label)})&&el.getClientRects().length);if(!btn)return null;btn.scrollIntoView({block:"nearest"});const r=btn.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    assert.ok(box,"missing control "+label);
    await command("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[box]});
    await command("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  }
  async function screenshot(name,directory=output){
    if(!directory)return;
    await mkdir(directory,{recursive:true});
    const r=await command("Page.captureScreenshot",{format:"png"});
    await writeFile(join(directory,name+".png"),Buffer.from(r.data,"base64"));
  }
  diagnose=async label=>{
    try{
      const d=await evaluate(`(()=>{const d=${state};return d?{scene:d.scene,x:d.playerX,y:d.playerY,interaction:d.interaction,held:d.held,life:d.life,animals:d.animals,pet:d.pet,transition:d.transition,calendar:new Date().toISOString(),climate:document.querySelector(".pixel-world-climate")?.textContent}:null})()`);
      console.log("Browser timeout evidence",label,JSON.stringify(d));
      await screenshot("failure-"+label.replace(/[^a-zA-Z0-9_-]+/g,"-").slice(0,80));
    }catch(error){console.log("Browser evidence unavailable",String(error));}
  };
  await command("Page.enable");
  // RMUC uses the same real browser and server, before the fishing calendar fixture.
  if(process.env.TARSGO_RMUC_BROWSER_ACCEPTANCE==="true"){
    await testRMUCWorld({origin,command,evaluate,until,screenshot:name=>screenshot(name,process.env.RMUC_QA_OUTPUT)});
  }
  if(process.env.TARSGO_RMUC_BROWSER_ACCEPTANCE!=="true"||process.env.TARSGO_PIXEL_BROWSER_ACCEPTANCE==="true"){
  // Register the real browser's calendar fixture before its first navigation.
  // Date.now remains the real wall clock for database cooldowns and plant growth.
  const fixedCalendar="2026-11-26T04:00:00.000Z";
  await command("Page.addScriptToEvaluateOnNewDocument",{source:`(()=>{
    const RealDate=Date;
    function FixtureDate(...args){if(!new.target)return new RealDate(${JSON.stringify(fixedCalendar)}).toString();return args.length?new RealDate(...args):new RealDate(${JSON.stringify(fixedCalendar)});}
    Object.setPrototypeOf(FixtureDate,RealDate);FixtureDate.prototype=RealDate.prototype;globalThis.Date=FixtureDate;
  })()`});
  await command("Page.navigate",{url:origin+"/healthz"});
  await until(()=>evaluate(`location.origin===${JSON.stringify(origin)}`),"local acceptance site");
  assert.equal(await evaluate("new Date().toISOString()"),fixedCalendar,"calendar fixture installed");
  const status=await evaluate(`fetch("/api/login/email/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"test-user@tarsgo.test",password:"synthetic-user-only"})}).then(r=>r.status)`);
  assert.equal(status,200,"synthetic login");
  const bag=()=>evaluate('fetch("/api/pixel-home/items",{cache:"no-store"}).then(r=>r.json()).then(r=>r.data)');
  const catalog=JSON.parse(await readFile(new URL("../../internal/backend/handler/pixelassets/items.json",import.meta.url)));
  if(!natureOnly){
  for (const [pond,[x,y]] of [[8.5,53.5],[135.5,24.5],[30.5,43.5],[112.5,43.5]].entries()){
    const mobile=pond===3;
    if(mobile){
      await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
      await command("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:5});
    }
    // Use the existing arena return position to start each test at its own bank.
    await evaluate(`history.replaceState({usr:{pixelReturn:{x:${x},y:${y},zoom:1.35,parent:"/"}},key:"bank",idx:0},"","/pixel-jijia")`);
    await command("Page.reload",{ignoreCache:true});
    await until(()=>evaluate(`${state}?.interaction==="钓鱼" && +${state}?.playerX===${x}`),"bank "+pond,45000);
    let previous=await bag();
    for(let attempt=0; ; attempt++){
      const total=rows=>rows.reduce((n,row)=>n+row.quantity,0);
      if(mobile)await tap(".pixel-world-interact","钓鱼");else await key("e");
      await until(()=>evaluate(`${state}?.fishing==="ready"`),"bite at "+pond);
      if(mobile)await tap(".pixel-world-interact","收竿");else await key("e");
      const next=await until(async()=>{const rows=await bag();return total(rows)===total(previous)+1&&rows},"saved catch");
      const caught=next.find(row=>row.quantity>(previous.find(p=>p.id===row.id)?.quantity||0));
      const item=catalog.find(i=>i.id===caught.id);
      assert.ok(item?.ponds.includes(pond),"catch belongs to pond");
      await screenshot("pond-"+pond);
      console.log(JSON.stringify({pond,mobile,item:item.name,quantity:caught.quantity}));
      await until(()=>evaluate(`${state}?.fishing==="idle"`),"reel finished");
      if(pond!==2 || next.some(row=>catalog.find(i=>i.id===row.id)?.kind==="fish"))break;
      assert.ok(attempt<15,"no fish available to test release");
      previous=next;
    }
  }
  const owned=await bag();
  await command("Page.reload",{ignoreCache:true});
  await until(()=>evaluate(`${state}?.interaction==="钓鱼"`),"restored fishing bank");
  await tap(".pixel-world-menu-toggle","");
  await tap(".pixel-world-tool","地图");
  await tap("summary","背包与收藏");
  await until(()=>evaluate(`document.querySelectorAll(".pixel-world-inventory canvas").length===${owned.length}`),"saved inventory after reload");
  await screenshot("mobile-inventory");
  await tap(".pixel-world-inventory button","拿起看看");
  await until(()=>evaluate('!document.querySelector(".pixel-world-map-panel.is-open") && Boolean(document.querySelector(".pixel-world-nature-notice")?.textContent)'),"inspect collectible");
  await screenshot("mobile-held-item");
  await tap(".pixel-world-menu-toggle","");
  await tap(".pixel-world-tool","地图");
  const fish=owned.find(row=>catalog.find(i=>i.id===row.id).kind==="fish"&&row.quantity>0);
  assert.ok(fish,"requires a fixture or catch that can be released");
  const fishName=catalog.find(i=>i.id===fish.id).name;
  const index=await evaluate(`[...document.querySelectorAll(".pixel-world-inventory > div")].findIndex(el=>el.textContent.includes(${JSON.stringify(fishName)}))`);
  assert.ok(index>=0);
  await tap(".pixel-world-inventory > div:nth-child("+(index+1)+") button","放生");
  await until(async()=> (await bag()).find(row=>row.id===fish.id)?.quantity===fish.quantity-1,"release");
  await until(()=>evaluate('document.querySelector(".pixel-world-inventory [role=status]")?.textContent==="已放生"'),"release confirmation");
  await screenshot("mobile-release");
  console.log("Four banks, desktop keyboard, mobile touch, reload and release passed.");
  }
  // The same built game, session and inventory exercise wildlife and companions.
  await command("Emulation.setDeviceMetricsOverride",{width:1200,height:850,deviceScaleFactor:1,mobile:false});
  await command("Emulation.setTouchEmulationEnabled",{enabled:false});
  const animals=()=>evaluate(`JSON.parse(${state}?.animals||"[]")`);
  const pet=()=>evaluate('fetch("/api/pixel-home/pet",{cache:"no-store"}).then(r=>r.json()).then(r=>r.data)');
  async function click(selector,label) {
    const box=await evaluate(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(el=>el.textContent.includes(${JSON.stringify(label)})&&el.getClientRects().length);if(!el)return null;el.scrollIntoView({block:"nearest"});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    assert.ok(box,"missing desktop control "+label);
    for(const type of ["mousePressed","mouseReleased"])await command("Input.dispatchMouseEvent",{type,...box,button:"left",clickCount:1});
  }
  async function startAt(x,y) {
    await evaluate(`history.replaceState({usr:{pixelReturn:{x:${x},y:${y},zoom:1.35,parent:"/"}},key:"animal",idx:0},"","/pixel-jijia")`);
    await command("Page.reload",{ignoreCache:true});
    await until(()=>evaluate(`${state}?.animals && +${state}?.playerX===${x} && +${state}?.playerY===${y}`),"animal starting position",45000);
    assert.equal(await evaluate("new Date().toISOString()"),fixedCalendar,"calendar fixture after reload");
  }
  async function equip(item,mobile=false) {
    if(mobile){await tap(".pixel-world-menu-toggle","");await tap(".pixel-world-tool","地图");}
    else await key("m");
    await until(()=>evaluate('Boolean(document.querySelector(".pixel-world-map-panel.is-open"))'),"inventory open");
    if(!await evaluate('Boolean(document.querySelector(".pixel-world-inventory")?.getClientRects().length&&document.querySelector(".pixel-world-inventory")?.closest("details")?.open)')){
      if(mobile)await tap("summary","背包与收藏");else await click("summary","背包与收藏");
    }
    const index=await until(()=>evaluate(`[...document.querySelectorAll(".pixel-world-inventory > div")].findIndex(el=>el.textContent.includes(${JSON.stringify(item.name)}))+1`),"food row");
    const sel=".pixel-world-inventory > div:nth-child("+index+") button";
    if(mobile)await tap(sel,"拿取");else await click(sel,"拿取");
    await until(()=>evaluate(`${state}?.held===${JSON.stringify(item.id)}`),"held "+item.id);
  }
  async function feedAt(id,species,source,destination=source,mobile=false) {
    const item=catalog.find(i=>i.id===id);
    await startAt(...source);
    await until(()=>evaluate(`${state}?.interaction===${JSON.stringify("拿取"+item.name)}`),"food source "+id);
    if(mobile)await tap(".pixel-world-interact","拿取");else await key("e");
    await until(async()=> (await bag()).some(r=>r.id===id&&r.quantity===1),"collected "+id);
    if(destination!==source)await startAt(...destination);
    await equip(item,mobile);
    await until(()=>evaluate(`${state}?.interaction?.startsWith("喂食")`),"reachable "+species,45000);
    if(mobile)await tap(".pixel-world-interact","喂食");else await key("e");
    await until(()=>evaluate('Boolean(document.querySelector(".pixel-world-animal-detail"))'),"animal interaction");
    if(mobile)await tap(".pixel-world-animal-detail button","喂食");else await click(".pixel-world-animal-detail button","喂食");
    const fed=await until(async()=> (await animals()).find(a=>a.species===species&&a.food),"placed food "+species);
    await until(async()=> (await animals()).some(a=>a.id===fed.id&&a.behavior==="eat"),"eating "+species,25000);
    await screenshot("animal-eating-"+species);
    await until(async()=> (await animals()).some(a=>a.id===fed.id&&a.familiar&&!a.food),"familiar "+species);
    assert.equal((await bag()).find(r=>r.id===id)?.quantity,0);
    console.log(JSON.stringify({fed:fed.id,species,mobile}));
    return fed.id;
  }
  if(!natureOnly){
  await feedAt("wild-seeds","sparrow",[51.5,40.5],[52.5,40.5]);
  await feedAt("pine-nut","squirrel",[94.5,43.5],[94.5,41.5]);
  await feedAt("fish-pellets","fish",[39.5,47.5],[30.5,43.5]);
  const cat=await feedAt("cat-food","cat",[68.5,57.5]);
  async function clickAnimal(id,scale=2) {
    const box=await until(()=>evaluate(`(()=>{const c=document.querySelector("canvas[data-player-x]"),d=c?.dataset,a=JSON.parse(d?.animals||"[]").find(a=>a.id===${JSON.stringify(id)});if(!a||d.transition!=="idle"||Math.hypot(a.x-+d.playerX,a.y-+d.playerY)>2.55)return null;const r=c.getBoundingClientRect();return {x:r.x+(a.x*16-Math.round(+d.cameraX))*r.width/(c.width/${scale}),y:r.y+((a.y-.35)*16-Math.round(+d.cameraY))*r.height/(c.height/${scale})}})()`),"animal in reach "+id,30000);
    for(const type of ["mousePressed","mouseReleased"])await command("Input.dispatchMouseEvent",{type,...box,button:"left",clickCount:1});
  }
  await clickAnimal(cat);
  await until(()=>evaluate('Boolean(document.querySelector("input[aria-label=宠物名称]"))'),"adoption form");
  await click(".pixel-world-animal-detail input","");
  await command("Input.insertText",{text:"小七"});
  await click(".pixel-world-animal-detail button","领养");
  await until(async()=> (await pet())?.name==="小七","adopted pet");
  await until(async()=> (await animals()).some(a=>a.id==="companion"),"visible companion");
  await screenshot("companion-adopted");
  await command("Input.dispatchKeyEvent",{type:"keyDown",key:"s",code:"KeyS",windowsVirtualKeyCode:83});
  await delay(1000);
  await command("Input.dispatchKeyEvent",{type:"keyUp",key:"s",code:"KeyS",windowsVirtualKeyCode:83});
  await until(()=>evaluate(`(()=>{const d=${state},a=JSON.parse(d.animals).find(a=>a.id==="companion");return a&&Math.hypot(a.x-+d.playerX,a.y-+d.playerY)<3})()`),"companion follows");
  await screenshot("companion-follow");
  await command("Page.reload",{ignoreCache:true});
  await until(async()=> (await animals()).some(a=>a.id==="companion"),"companion reload");
  assert.equal((await pet())?.name,"小七");
  await click("button","我的研究室");
  await until(()=>evaluate(`${state}?.scene==="study"&&${state}?.pet!=="away"&&${state}?.transition==="idle"`),"companion study");
  await screenshot("companion-study");
  await clickAnimal("companion",1);
  await until(()=>evaluate('Boolean(document.querySelector(".pixel-world-animal-detail"))'),"study pet panel");
  await click(".pixel-world-animal-detail button","留在研究室");
  await until(async()=> (await pet())?.mode==="home","home mode");
  await click("button","返回户外");
  await until(()=>evaluate(`${state}?.scene==="outdoor"&&${state}?.pet==="away"&&${state}?.transition==="idle"`),"pet waits at home");
  await key("m");
  await until(()=>evaluate('Boolean(document.querySelector(".pixel-world-map-panel.is-open"))'),"pet map");
  await click("summary","宠物 ·");
  await click("button","召回");
  await until(async()=> (await pet())?.mode==="follow","recall");
  await startAt(30.5,43.5);
  await until(()=>evaluate(`${state}?.interaction==="钓鱼"&&${state}?.pet!=="away"`),"fishing with companion");
  await key("e");
  await until(()=>evaluate(`${state}?.fishing==="ready"`),"companion fishing");
  await screenshot("companion-fishing");
  await key("e");
  await until(()=>evaluate(`${state}?.fishing==="idle"`),"companion fishing finished");
  await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await command("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:5});
  await feedAt("dog-food","dog",[75.5,57.5],[62.5,60.5],true);
  console.log("Wildlife feeding, adoption, naming, companion movement, refresh, study, recall, fishing and mobile feeding passed.");
  }

  // Phase 3 uses the same built application, real inventory and browser input.
  // Return-position fixtures choose a test starting point, not a simulated world action.
  await command("Emulation.setDeviceMetricsOverride",{width:1200,height:850,deviceScaleFactor:1,mobile:false});
  await command("Emulation.setTouchEmulationEnabled",{enabled:false});
  assert.ok(await pet(),"phase 3 requires the actual adopted companion");
  const life=()=>evaluate(`JSON.parse(${state}?.life||"[]")`);
  const holding=id=>until(()=>evaluate(`${state}?.held===${JSON.stringify(id)}`),"holding "+id);
  const plantAt=(id,x,y,stage)=>until(async()=> (await life()).find(o=>o.type==="plant"&&o.id.startsWith(id+":")&&o.x===x&&o.y===y&&(stage===undefined||o.stage===stage)),"plant "+id+" at "+x+","+y+" stage "+stage);
  const loanAt=(id,x,y)=>until(async()=> (await life()).find(o=>o.type==="loan"&&o.id===id&&o.x===x&&o.y===y),"loan "+id+" at "+x+","+y);
  const home=()=>evaluate('fetch("/api/pixel-home/me",{cache:"no-store"}).then(r=>r.json()).then(r=>r.data)');
  const quantity=async id=>(await bag()).find(r=>r.id===id)?.quantity??0;
  const item=id=>catalog.find(i=>i.id===id);
  const source=(id,index=0)=>item(id).sources[index];
  async function clickWorld(x,y,mobile=false){
    const box=await evaluate(`(()=>{const c=document.querySelector("canvas[data-player-x]"),d=c.dataset,r=c.getBoundingClientRect(),s=d.scene==="study"?1:2;const x=r.x+(${x}*16-Math.round(+d.cameraX))*s*r.width/c.width,y=r.y+(${y}*16-Math.round(+d.cameraY))*s*r.height/c.height;return {x,y,canvas:document.elementFromPoint(x,y)===c}})()`);
    assert.ok(box?.canvas,"scene pointer obstructed at "+x+","+y+" "+JSON.stringify(box));
    const {x:px,y:py}=box;
    if(mobile){await command("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:px,y:py}]});await command("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});}
    else for(const type of ["mousePressed","mouseReleased"])await command("Input.dispatchMouseEvent",{type,x:px,y:py,button:"left",clickCount:1});
  }
  async function moveTo(x,y){
    for(const [axis,target,negative,positive] of [["playerX",x,"a","d"],["playerY",y,"w","s"]]){
      let actual=await evaluate(`+${state}?.${axis}`);
      if(Math.abs(actual-target)<.16)continue;
      const sign=target>actual?1:-1,k=sign===1?positive:negative;
      const data={key:k,code:"Key"+k.toUpperCase(),windowsVirtualKeyCode:k.toUpperCase().charCodeAt(0)};
      await command("Input.dispatchKeyEvent",{type:"keyDown",...data});
      try{
        const end=Date.now()+8000;
        while(Date.now()<end){
          actual=await evaluate(`+${state}?.${axis}`);
          if((target-actual)*sign<=.12)break;
          await delay(25);
        }
      }finally{await command("Input.dispatchKeyEvent",{type:"keyUp",...data});}
      actual=await evaluate(`+${state}?.${axis}`);
      assert.ok(Math.abs(actual-target)<.5,"could not walk to "+axis+" "+target+" actual "+actual);
    }
  }
  async function gather(id,index=0,mobile=false){
    const point=source(id,index),before=await quantity(id);
    if(before>=item(id).gather)return;
    await startAt(point.x,point.y);
    await until(()=>evaluate(`${state}?.interaction===${JSON.stringify("拿取"+item(id).name)}`),"visible source "+id);
    if(mobile)await tap(".pixel-world-interact","拿取");else await key("e");
    await until(async()=>await quantity(id)===before+1,"collected "+id);
    await screenshot("gather-"+id);
  }
  for(const id of ["petal","leaf","pebble","branch","pinecone","daisy-seed","cornflower-seed"])await gather(id,id==="petal"?1:0);
  await gather("daisy-seed",1);
  await equip(item("pinecone"));
  const nuts=await quantity("pine-nut"),cones=await quantity("pinecone");
  await click(".pixel-world-held-food button","剥取松子");
  await until(async()=>await quantity("pine-nut")===nuts+1&&await quantity("pinecone")===cones-1,"pinecone conversion");
  await holding("pine-nut");
  await screenshot("pinecone-converted");
  // Public flowerpot: place, sow, water, watch actual clock, carry a flowering pot.
  await startAt(65.5,76.5);
  await equip(item("daisy-seed"));
  const daisyBefore=await quantity("daisy-seed");
  await until(()=>evaluate(`${state}?.interaction==="播种"`),"pot sow prompt");
  await key("e");
  await plantAt("daisy-seed",65.5,77.5,0);
  await holding("");
  assert.equal(await quantity("daisy-seed"),daisyBefore-1);
  await screenshot("public-daisy-seed");
  await clickWorld(64.5,77.5);
  await holding("water-can");
  await clickWorld(65.5,77.5);
  for(const stage of [1,2,3]){
    await plantAt("daisy-seed",65.5,77.5,stage);
    await screenshot("public-daisy-stage-"+stage);
  }
  await click(".pixel-world-held-food button","归还");
  await holding("");
  await clickWorld(65.5,77.5);
  await holding("flowerpot");
  assert.ok(!(await life()).some(o=>o.type==="plant"),"moving pot has no ground duplicate");
  await moveTo(66.5,76.5);
  await clickWorld(66.5,77.5);
  await plantAt("daisy-seed",66.5,77.5,3);
  await holding("");
  await screenshot("public-daisy-moved");
  // The picnic mat is a scene loan and can be moved, rested on and returned.
  await moveTo(68.5,76.5);
  await clickWorld(68.5,77.5);
  await holding("picnic-mat");
  assert.ok(!(await life()).some(o=>o.id==="picnic-mat"));
  await clickWorld(69.5,77.5); // brick path: reject without losing the held mat
  await holding("picnic-mat");
  assert.ok(!(await life()).some(o=>o.id==="picnic-mat"));
  await clickWorld(68.5,78.5); // verified grass on the same lawn
  await loanAt("picnic-mat",68.5,78.5);
  await holding("");
  await click("button","坐在野餐垫上");
  await until(()=>evaluate(`["sit","sit-rest"].includes(${state}?.action)&&${state}?.pet!=="away"`),"picnic rest with pet");
  await until(async()=> (await animals()).some(a=>a.id==="companion"&&["sit","lie","sleep","observe","wait"].includes(a.behavior)),"pet rests nearby");
  await screenshot("picnic-rest");
  await key("e");
  await until(()=>evaluate(`!["sit","sit-rest"].includes(${state}?.action)`),"stand after rest");
  await clickWorld(68.5,78.5);
  await holding("picnic-mat");
  await click(".pixel-world-held-food button","归还");
  await loanAt("picnic-mat",68.5,77.5);
  await moveTo(64.5,76.5);
  await clickWorld(64.5,77.5);
  await holding("water-can");
  await click("button","我的研究室");
  await until(()=>evaluate(`${state}?.scene==="study"&&${state}?.transition==="idle"`),"exit campus with loan");
  await holding("");
  await click("button","返回户外");
  await until(()=>evaluate(`${state}?.scene==="outdoor"&&${state}?.transition==="idle"`),"return to campus after loan");
  await loanAt("water-can",64.5,77.5);
  await loanAt("flowerpot",65.5,77.5);
  assert.ok(!(await life()).some(o=>o.type==="plant"),"public plants reset on scene exit");
  await startAt(63.5,77.5);
  assert.ok(!(await life()).some(o=>o.type==="plant"),"public planting must not persist after refresh");
  await loanAt("flowerpot",65.5,77.5);
  assert.equal(await quantity("daisy-seed"),daisyBefore-1);
  console.log("Natural gathering, pinecone conversion, real public plant growth, moved pot, picnic rest and temporary recovery passed.");
  // Study plants use separate persistent data; the furniture and achievements
  // continue using the original study endpoints.
  await click("button","我的研究室");
  await until(()=>evaluate(`${state}?.scene==="study"&&${state}?.transition==="idle"`),"study opened");
  const existingHome=await home();
  await moveTo(11.1,8.5);
  await equip(item("cornflower-seed"));
  const cornBefore=await quantity("cornflower-seed");
  await clickWorld(12.5,8.5);
  const corn=await plantAt("cornflower-seed",12.5,8.5,0);
  assert.equal(await quantity("cornflower-seed"),cornBefore-1);
  await screenshot("study-cornflower-seed");
  const seedRecord=(await home()).plants.find(p=>p.id===corn.id);
  await command("Page.reload",{ignoreCache:true});
  await until(()=>evaluate(`${state}?.scene==="outdoor"&&${state}?.transition==="idle"`),"refresh study before watering");
  await click("button","我的研究室");
  await until(()=>evaluate(`${state}?.scene==="study"&&${state}?.transition==="idle"`),"reopen unwatered study");
  await plantAt("cornflower-seed",12.5,8.5,0);
  assert.deepEqual((await home()).plants.find(p=>p.id===corn.id),seedRecord);
  await moveTo(11.5,8.0);
  await clickWorld(11.5,6.5);
  await holding("water-can");
  await clickWorld(12.5,8.5);
  await plantAt("cornflower-seed",12.5,8.5,1);
  const watered=(await home()).plants.find(p=>p.id===corn.id);
  assert.ok(watered.wateredAt>0);
  await screenshot("study-cornflower-sprout");
  await command("Page.reload",{ignoreCache:true});
  await until(()=>evaluate(`${state}?.scene==="outdoor"&&${state}?.transition==="idle"`),"outdoor after refresh");
  await click("button","我的研究室");
  await until(()=>evaluate(`${state}?.scene==="study"&&${state}?.transition==="idle"`),"study reopened");
  const restored=(await home()).plants.find(p=>p.id===corn.id);
  assert.deepEqual(restored,watered);
  await plantAt("cornflower-seed",12.5,8.5);
  await moveTo(11.1,8.5);
  if((await life()).find(o=>o.id===corn.id).stage===3)await click("button","移动花盆");else await clickWorld(12.5,8.5);
  await holding("flowerpot");
  await clickWorld(11.5,9.5);
  await plantAt("cornflower-seed",11.5,9.5);
  const moved=(await home()).plants.find(p=>p.id===corn.id);
  assert.equal(moved.wateredAt,watered.wateredAt);
  assert.equal(moved.x,11);assert.equal(moved.y,9);
  await plantAt("cornflower-seed",11.5,9.5,3);
  await screenshot("study-cornflower-flowering");
  const flowerBefore=await quantity("cornflower-flower");
  await clickWorld(11.5,9.5);
  await until(async()=>await quantity("cornflower-flower")===flowerBefore+1,"harvest flower");
  assert.ok(!(await home()).plants.some(p=>p.id===corn.id));
  await equip(item("daisy-seed"));
  await clickWorld(12.5,8.5);
  await plantAt("daisy-seed",12.5,8.5,0);
  const afterHome=await home();
  assert.deepEqual(afterHome.furniture,existingHome.furniture);
  assert.deepEqual(afterHome.achievements,existingHome.achievements);
  await click("button","邀请参观");
  const invite=await until(()=>evaluate('document.querySelector("input[aria-label=参观邀请链接]")?.value'),"study invitation");
  await command("Page.navigate",{url:invite});
  await until(()=>evaluate(`${state}?.scene==="study"&&Boolean(document.querySelector(".pixel-world-study-guest"))`),"read-only visitor");
  await plantAt("daisy-seed",12.5,8.5,0);
  assert.ok(!await evaluate('Boolean(document.querySelector(".pixel-world-study-tools"))'));
  await screenshot("study-visitor-plants");
  await click("button","返回户外");
  await until(()=>evaluate(`${state}?.scene==="outdoor"&&${state}?.transition==="idle"`),"return from visitor");
  console.log("Private sow, water, reload, move, flower harvest, furniture and achievements preserved, visitor read-only passed.");
  // Fish the wrench out of the real pond, then physically enter the workshop
  // with the held item. No synthetic inventory write is used.
  if(!(await quantity("wrench"))){
    await startAt(112.5,43.5);
    for(let n=0;n<35&&!(await quantity("wrench"));n++){
      await until(()=>evaluate(`${state}?.interaction==="钓鱼"`),"workshop fishing bank");
      await key("e");await until(()=>evaluate(`${state}?.fishing==="ready"`),"wrench cast");
      await key("e");await until(()=>evaluate(`${state}?.fishing==="idle"`),"wrench reeled");
    }
  }
  assert.ok(await quantity("wrench"),"actual fishing must yield an old wrench");
  await startAt(42,38.5);
  await equip(item("wrench"));
  const wrenchBefore=await quantity("wrench"),cleanBefore=await quantity("clean-wrench");
  await screenshot("wrench-before");
  await key("e");
  await until(()=>evaluate(`${state}?.scene==="mechanical"&&${state}?.transition==="idle"&&${state}?.held==="wrench"`),"carried wrench into workshop");
  await until(()=>evaluate(`${state}?.interaction==="清理旧扳手"`),"workbench repair prompt");
  await key("e");
  await holding("clean-wrench");
  assert.equal(await quantity("wrench"),wrenchBefore-1);
  assert.equal(await quantity("clean-wrench"),cleanBefore+1);
  await screenshot("wrench-repaired");
  // Mobile: start near a real seed source, collect via touch and sow with the
  // existing touch interaction button. No keyboard input in this section.
  await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await command("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:5});
  await gather("cornflower-seed",1,true);
  await startAt(65.5,76.5);
  await equip(item("cornflower-seed"),true);
  await until(()=>evaluate(`${state}?.interaction==="播种"`),"mobile sow prompt");
  await tap(".pixel-world-interact","播种");
  await plantAt("cornflower-seed",65.5,77.5,0);
  await screenshot("mobile-nature-sow");
  await tap(".pixel-world-interact","移动花盆");
  await holding("flowerpot");
  await tap(".pixel-world-held-food button","取消移动");
  await plantAt("cornflower-seed",65.5,77.5,0);
  await clickWorld(64.5,77.5,true);
  await holding("water-can");
  await tap(".pixel-world-interact","浇水");
  await plantAt("cornflower-seed",65.5,77.5,1);
  await screenshot("mobile-nature-water");
  console.log("Workbench conversion and mobile-only gathering, pot interaction and watering passed.");

  // Exit and switch accounts while a borrowed tool is in hand. No permanent
  // inventory row is allocated to a scene loan, and host plants stay private.
  await command("Emulation.setDeviceMetricsOverride",{width:1200,height:850,deviceScaleFactor:1,mobile:false});
  await command("Emulation.setTouchEmulationEnabled",{enabled:false});
  await startAt(64.5,76.5);
  await clickWorld(64.5,77.5);
  await holding("water-can");
  const ownerBag=await bag();
  const ownerHome=await home();
  const account=()=>evaluate('fetch("/api/me",{cache:"no-store"}).then(r=>r.json()).then(r=>r.data?.user?.id)');
  const ownerId=await account();
  assert.ok(ownerId);
  const signOut=()=>evaluate('fetch("/api/logout",{method:"POST",headers:{"Content-Type":"application/json","X-Tarsgo-Account-Action":"1"},body:"{}"}).then(r=>r.status)');
  const signIn=(email,password)=>evaluate(`fetch("/api/login/email/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:${JSON.stringify(email)},password:${JSON.stringify(password)}})}).then(r=>r.status)`);
  assert.equal(await signOut(),200);
  assert.equal(await evaluate('fetch("/api/pixel-home/items",{cache:"no-store"}).then(r=>r.status)'),401);
  assert.equal(await signIn("test-admin@tarsgo.test","synthetic-admin-only"),200);
  assert.notEqual(await account(),ownerId);
  await startAt(64.5,76.5);
  await holding("");
  await loanAt("water-can",64.5,77.5);
  assert.ok(!(await bag()).some(r=>r.id==="clean-wrench"&&r.quantity>0));
  assert.ok(!(await home()).plants.some(p=>ownerHome.plants.some(q=>q.id===p.id)));
  await command("Page.navigate",{url:invite});
  await until(()=>evaluate(`${state}?.scene==="study"&&Boolean(document.querySelector(".pixel-world-study-guest"))`),"different-account visitor");
  await plantAt("daisy-seed",12.5,8.5,0);
  await moveTo(11.1,8.5);
  await clickWorld(12.5,8.5);
  await holding("");
  assert.ok(!await evaluate('Boolean(document.querySelector(".pixel-world-study-tools"))'));
  await screenshot("different-account-readonly");
  assert.equal(await signOut(),200);
  assert.equal(await signIn("test-user@tarsgo.test","synthetic-user-only"),200);
  assert.equal(await account(),ownerId);
  await command("Page.navigate",{url:origin+"/pixel-jijia"});
  await until(()=>evaluate(`${state}?.scene==="outdoor"&&${state}?.transition==="idle"`),"owner restored");
  assert.deepEqual(await bag(),ownerBag);
  assert.deepEqual((await home()).plants,ownerHome.plants);
  await loanAt("water-can",64.5,77.5);
  console.log("Actual account switch, logout, visitor read-only and restored owner inventory passed.");

  }
} finally {
  socket?.close();
  chrome.kill("SIGTERM");
}
