// Exercise the built game and its real account API against the synthetic acceptance DB.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const origin = "http://127.0.0.1:8182";
const profile = await mkdtemp(join(tmpdir(), "pixel-fishing-browser-"));
const chrome = spawn(process.env.CHROME_BIN || "google-chrome", [
  "--headless=new", "--disable-dev-shm-usage", "--disable-background-timer-throttling",
  "--window-size=1200,850", "--remote-debugging-port=0", "--user-data-dir="+profile, "about:blank",
], {stdio:"ignore"});
const output = process.env.PIXEL_QA_OUTPUT;
if (output) await mkdir(output, {recursive:true});
async function until(check, label, ms=30000) {
  const end = Date.now()+ms;
  while(Date.now()<end) {
    const result=await check();
    if(result)return result;
    await delay(150);
  }
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
  async function screenshot(name){
    if(!output)return;
    const r=await command("Page.captureScreenshot",{format:"png"});
    await writeFile(join(output,name+".png"),Buffer.from(r.data,"base64"));
  }
  await command("Page.navigate",{url:origin+"/healthz"});
  await until(()=>evaluate(`location.origin===${JSON.stringify(origin)}`),"local acceptance site");
  const status=await evaluate(`fetch("/api/login/email/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"test-user@tarsgo.test",password:"synthetic-user-only"})}).then(r=>r.status)`);
  assert.equal(status,200,"synthetic login");
  const bag=()=>evaluate('fetch("/api/pixel-home/items",{cache:"no-store"}).then(r=>r.json()).then(r=>r.data)');
  const catalog=JSON.parse(await readFile(new URL("../../internal/backend/handler/pixelassets/items.json",import.meta.url)));
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
  // The same real built game, session and inventory now exercise wildlife and
  // companions. Freeze only the browser calendar for repeatable daytime weather;
  // wall clock timers and server authentication remain real.
  await command("Emulation.setDeviceMetricsOverride",{width:1200,height:850,deviceScaleFactor:1,mobile:false});
  await command("Emulation.setTouchEmulationEnabled",{enabled:false});
  await command("Page.addScriptToEvaluateOnNewDocument",{source:`(()=>{
    const RealDate=Date;
    function FixtureDate(...args){if(!new.target)return RealDate();return args.length?new RealDate(...args):new RealDate("2026-11-26T08:40:00Z");}
    Object.setPrototypeOf(FixtureDate,RealDate);FixtureDate.prototype=RealDate.prototype;globalThis.Date=FixtureDate;
  })()`});
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
    await until(()=>evaluate('Boolean(document.querySelector(".pixel-world-held-food"))'),"held food");
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
  await feedAt("wild-seeds","sparrow",[52.5,40.5]);
  await feedAt("pine-nut","squirrel",[91.5,41.5],[94.5,41.5]);
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

} finally {
  socket?.close();
  chrome.kill("SIGTERM");
}
