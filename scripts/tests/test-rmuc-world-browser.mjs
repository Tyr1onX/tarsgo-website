// Real login UI, persistent WebGL world, real referee and MariaDB.
import assert from "node:assert/strict";
import {setTimeout as delay} from "node:timers/promises";
export async function testRMUCWorld({origin,command,evaluate,until,screenshot}){
  const arena="/pixel-jijia/arena",endpoint="/api/rmuc-academy/progress";
  const expected={courseId:"guided-territory",version:1,completed:true,position:1};
  const selector="main[data-world-mode]";
  const state=()=>evaluate('({...document.querySelector("main[data-world-mode]")?.dataset})');
  function wait(expression,label,ms=30000){
    return until(async()=>{try{return await evaluate(expression);}catch(error){if(/context.*(destroyed|not found)|Cannot find context/i.test(String(error)))return false;throw error;}},label,ms);
  }
  function ready(){return wait('document.querySelector(".rmul3d-canvas")?.dataset.ready==="true"&&document.querySelector("main[data-world-mode]")?.dataset.worldMode==="explore"&&!!document.querySelector("canvas")',"first-person world",90000);}
  async function click(selector,text=null){
    const box=await wait(`(()=>{const el=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>!e.disabled&&e.getClientRects().length&&(${JSON.stringify(text)}===null||e.innerText.includes(${JSON.stringify(text)})));if(!el)return null;el.scrollIntoView({block:"center",inline:"nearest"});const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return el.contains(document.elementFromPoint(x,y))?{x,y}:null})()`,"click "+(text??selector));
    for(const type of ["mousePressed","mouseReleased"])await command("Input.dispatchMouseEvent",{type,...box,button:"left",clickCount:1});
  }
  async function fill(selector,value){
    await click(selector);
    for(const type of ["keyDown","keyUp"])await command("Input.dispatchKeyEvent",{type,key:"a",code:"KeyA",modifiers:2,windowsVirtualKeyCode:65});
    await command("Input.insertText",{text:value});
    await wait(`document.querySelector(${JSON.stringify(selector)})?.value===${JSON.stringify(value)}`,"field ready");
  }
  async function hit(id){
    const [x,y]=await wait(`JSON.parse(document.querySelector("canvas").dataset.worldTargets||"{}")[${JSON.stringify(id)}]`,"visible entity "+id);
    const point=await evaluate(`(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return {x:r.x+r.width*${x},y:r.y+r.height*${y}}})()`);
    for(const type of ["mousePressed","mouseReleased"])await command("Input.dispatchMouseEvent",{type,...point,button:"left",clickCount:1});
  }
  async function key(k,type="keyDown"){await command("Input.dispatchKeyEvent",{type,key:k,code:k==="Escape"?"Escape":"Key"+k.toUpperCase(),windowsVirtualKeyCode:k==="Escape"?27:k.toUpperCase().charCodeAt(0),timestamp:Date.now()/1000});}
  async function press(k){await key(k);await key(k,"keyUp");}
  const traceExpression='JSON.parse(document.querySelector("canvas").dataset.territoryTrace)';
  const trace=()=>evaluate(traceExpression);
  // A real player moves in short bursts, then checks position. Sending keyup
  // independently of a DOM progress poll prevents a slow frame extending a hold.
  async function moveToward(goalName,arrived,label){
    const deadline=Date.now()+30000;
    for(let i=0;i<16&&Date.now()<deadline;i++){
      const before=await trace();
      if(arrived(before))return;
      const goal=before[goalName],p=before.red.p,yaw=before.look.yaw;
      const projection=(goal[0]-p[0])*(-Math.sin(yaw))+(goal[2]-p[2])*(-Math.cos(yaw));
      const k=projection>=0?"w":"s",serial=before.lastKey?.serial??0;
      const down=key(k);
      await delay(Math.min(350,Math.max(180,Math.abs(projection)/2.6*1000)));
      await Promise.all([down,key(k,"keyUp")]);
      const after=await wait(`(()=>{const q=${traceExpression};return q.lastKey?.serial>${serial}&&!q.lastKey.pressed&&q.lastKey.key===${JSON.stringify("Key"+k.toUpperCase())}&&!q.pendingInput.length&&q.red.speed===0?q:null})()`,"released "+label,Math.max(1,deadline-Date.now()));
      console.log("RMUC input",label,JSON.stringify({before:before.red.p,after:after.red.p,key:after.lastKey,elapsed:after.elapsed,debt:after.debt,zones:after.red.zones}));
      if(arrived(after))return;
    }
    throw Error("Timed out: "+label+" "+JSON.stringify(await trace()));
  }
  async function sameWorld(){
    assert.equal(await evaluate('window.__qaRenderer&&window.__qaRenderer===document.querySelector("canvas").__qaRenderer&&window.__qaCanvas===document.querySelector("canvas")&&window.__qaGL===document.querySelector("canvas").getContext("webgl2")&&document.querySelectorAll("canvas").length===1'),true);
    assert.equal(await evaluate('performance.getEntriesByName("arena:initialize").length'),1);
    assert.equal(await evaluate('performance.getEntriesByType("measure").filter(e=>e.name.startsWith("arena:parse:")).length'),4);
    assert.equal(await evaluate('performance.getEntriesByType("resource").filter(e=>e.name.includes(".glb.gz")).length'),4);
  }
  const account=()=>evaluate('fetch("/api/me",{cache:"no-store"}).then(async r=>({status:r.status,user:r.ok?(await r.json()).data?.user:null}))');
  const read=()=>evaluate(`fetch(${JSON.stringify(endpoint)},{cache:"no-store"}).then(async r=>({status:r.status,rows:r.ok?(await r.json()).data:null}))`);
  async function rows(){
    const response=await read();assert.equal(response.status,200,"authenticated progress GET");
    assert.ok(Array.isArray(response.rows));
    return response.rows.map(({courseId,version,completed,position})=>({courseId,version,completed,position})).sort((a,b)=>a.courseId.localeCompare(b.courseId));
  }
  async function login(email,password){
    await command("Page.navigate",{url:origin+"/login?redirect="+encodeURIComponent(arena)});
    await wait('location.pathname==="/login"&&document.readyState==="complete"&&!!document.querySelector("form.auth-form #password")',"real login form");
    await fill("#email",email);
    await fill("#password",password);
    await click('form.auth-form button[type="submit"]');
    await wait(`location.pathname===${JSON.stringify(arena)}`,"login redirect to arena");
    const session=await account();
    assert.equal(session.status,200);
    assert.equal(session.user.email,email);
    assert.ok(session.user.id);
    await ready();
    return session.user.id;
  }
  async function logout(){
    // The full-screen arena has no account menu. Use the public site's actual logout control.
    await command("Page.navigate",{url:origin+"/"});
    await click(".navbar-profile-button");
    // Wait for the real menu to finish initializing. Activate its DOM button
    // rather than relying on synthetic coordinate/keyboard timing during layout.
    await wait('!!document.querySelector(".navbar-user-menu .account-session-choices__add")',"account menu initialized");
    assert.equal(await evaluate(`(()=>{const button=document.querySelector(".navbar-user-menu button.account-menu-action--logout");if(!button||button.disabled||!button.getClientRects().length)return false;let activated=false;button.addEventListener("click",()=>{activated=true;},{once:true});button.click();return activated;})()`),true,"actual logout button click dispatched");
    console.log("RMUC: actual logout button click dispatched.");
    await wait('location.pathname==="/login"&&!!document.querySelector("form.auth-form")',"logout returns to login");
    assert.equal((await read()).status,401,"server rejected logged-out progress read");
  }
  try{
    await command("Page.addScriptToEvaluateOnNewDocument",{source:"window.__rmucQA=true"});
    const passwordA=process.env.TARSGO_TEST_USER_PASSWORD,passwordB=process.env.TARSGO_TEST_ADMIN_PASSWORD;
    assert.ok(passwordA&&passwordB,"synthetic acceptance accounts required");
    const userA=await login("test-user@tarsgo.test",passwordA);
    assert.deepEqual(await rows(),[]);
    assert.equal((await state()).worldView,"first");
    await evaluate('window.__qaCanvas=document.querySelector("canvas");window.__qaGL=__qaCanvas.getContext("webgl2");window.__qaRenderer=__qaCanvas.__qaRenderer;true');
    await sameWorld();await screenshot("01-world-explore");
    await hit("territory");
    await wait(`!!document.querySelector('[data-world-mode="teaching"]')`,"physical territory start",15000);
    await wait(`!!document.querySelector('[data-world-contested="true"]')`,"referee contest",120000);
    await press("p");await wait(`!!document.querySelector('[data-teaching-paused="true"]')`,"pause");
    const paused=await state();await delay(1000);
    assert.equal((await state()).worldProgress,paused.worldProgress);
    assert.equal((await state()).worldSeconds,paused.worldSeconds);
    await screenshot("02-world-contest");await press("p");
    await wait(`!!document.querySelector('[data-teaching-step="10"]')`,"automatic recovery and takeover",180000);
    assert.equal((await state()).worldController,"blue");
    assert.equal((await state()).worldOutpost,"1000");
    await press("e");await wait(`!!document.querySelector('[data-world-driving="true"]')`,"actual robot takeover");
    // Exercise the registered blur handler with a pending or applied movement
    // input in the real world. Headless focus changes are not deterministic,
    // so dispatch the lifecycle event explicitly, without replacing the handler.
    const beforeBlur=await trace();
    await key("w");
    await wait(`(()=>{const q=${traceExpression};return q.pendingInput.length>0||q.lastKey?.serial>${beforeBlur.lastKey?.serial??0}&&q.keys.includes("KeyW")})()`,"movement input received before blur");
    await evaluate('window.dispatchEvent(new Event("blur"));true');
    await wait(`(()=>{const q=${traceExpression};return !q.keys.length&&!q.pendingInput.length&&(q.red.speed??0)===0})()`,"blur clears active and queued movement");
    // The held key must not start driving again as accumulated ticks run.
    const stopped=await trace();
    await wait(`(()=>{const q=${traceExpression};return q.elapsed>=${stopped.elapsed+.25}&&q})()`,"simulation continues after blur");
    const afterBlur=await trace();
    assert.ok(!afterBlur.keys.length&&!afterBlur.pendingInput.length,"cleared input does not reappear during catch-up");
    assert.ok(Math.hypot(afterBlur.red.p[0]-stopped.red.p[0],afterBlur.red.p[2]-stopped.red.p[2])<.01,"robot stays stopped without keyup");
    await key("w","keyUp");
    const practiceAt=(await trace()).elapsed;
    await moveToward("redGoal",q=>q.red.zones.includes("blue-central")&&Math.hypot(q.red.p[0]-q.redGoal[0],q.red.p[2]-q.redGoal[2])<.36,"entered legal area");
    // The referee resets progress to zero on capture. A slow CDP poll may
    // observe the completed capture rather than any intermediate value.
    await wait('(()=>{const d=document.querySelector("main[data-world-mode]").dataset;return Number(d.worldProgress)>=3||d.teachingCaptured==="true"&&d.worldController==="red"&&d.worldFull==="false"})()',"actual capture progress");
    await wait(`!!document.querySelector('[data-teaching-captured="true"]')`,"referee temporary control",90000);
    const capturedAt=await evaluate(`document.querySelector("canvas").__qaEvents.find(e=>e.type==="territory"&&e.location==="blue"&&e.structure==="outpost"&&e.team==="red"&&!e.full&&e.at>=${practiceAt})?.at??null`);
    assert.ok(capturedAt!==null,"actual practice referee emitted red temporary control");
    await screenshot("03-world-capture");
    await moveToward("redStart",q=>!q.red.zones.some(z=>z==="blue-central"||z==="blue-outpost"),"withdrawal");
    await wait('(()=>{const d=document.querySelector("main[data-world-mode]").dataset;return Number(d.worldProgress)>0||d.teachingDone==="true"&&d.worldController==="blue"&&d.worldFull==="true"})()',"withdrawal and defense progress");
    await wait(`!!document.querySelector('[data-teaching-done="true"]')`,"referee full recovery",90000);
    assert.equal(await evaluate(`document.querySelector("canvas").__qaEvents.some(e=>e.type==="territory"&&e.location==="blue"&&e.structure==="outpost"&&e.team==="blue"&&e.full&&e.at>${capturedAt})`),true,"actual practice referee emitted blue full recovery");
    await wait(`!!document.querySelector('[data-territory-completed="true"]')`,"real saved progress",15000);
    assert.deepEqual(await rows(),[expected]);await sameWorld();await screenshot("04-world-completed");
    await press("Escape");await ready();await sameWorld();
    assert.equal((await state()).worldSeconds,"420");
    await hit("match");
    await wait(`!!document.querySelector('[data-world-mode="match"]')`,"normal match start");
    await wait('Number(document.querySelector("main[data-world-mode]").dataset.worldSeconds)<420',"normal referee running",60000);
    await sameWorld();await screenshot("05-world-match");
    await hit("explore");await ready();
    await wait('!!JSON.parse(document.querySelector("canvas").dataset.worldTargets||"{}").territory',"exploration controller rendered");
    await sameWorld();await hit("exit");
    await wait('location.pathname==="/"&&!window.__qaCanvas.isConnected&&window.__qaGL.isContextLost()',"actual exit and context release");
    const disposedTrace=await evaluate('window.__qaCanvas.dataset.simTrace');
    await delay(1000);
    assert.equal(await evaluate('window.__qaCanvas.dataset.simTrace'),disposedTrace,"disposed world cannot keep publishing");
    await evaluate('history.back();true');await ready();
    assert.equal(await evaluate('document.querySelectorAll("main[data-world-mode] canvas").length===1&&window.__qaCanvas!==document.querySelector("main[data-world-mode] canvas")&&window.__qaRenderer!==document.querySelector("main[data-world-mode] canvas").__qaRenderer&&window.__qaGL.isContextLost()'),true,"reentry creates one new world");
    assert.equal(await evaluate('performance.getEntriesByName("arena:initialize").length'),2);
    await screenshot("05b-world-reentered");
    await logout();
    assert.equal(await login("test-user@tarsgo.test",passwordA),userA);
    await wait(`!!document.querySelector('[data-territory-completed="true"]')`,"saved completion restored");
    assert.deepEqual(await rows(),[expected]);await screenshot("06-world-restored");
    await logout();
    const userB=await login("test-admin@tarsgo.test",passwordB);
    assert.notEqual(userB,userA);assert.deepEqual(await rows(),[]);
    assert.equal((await state()).territoryCompleted,"false");
    await screenshot("07-world-isolation");
    await logout();
    console.log("RMUC WORLD BROWSER ACCEPTANCE PASSED");
  }catch(error){
    console.error("RMUC world acceptance failed:",error.message);
    try{console.log("RMUC world failure",await state(),await evaluate('JSON.stringify(document.querySelector("canvas")?.dataset)'));await screenshot("failure");}catch{}
    throw error;
  }
}
