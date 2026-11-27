// Real login UI, real account sessions and MariaDB; no mocked requests or storage.
import assert from "node:assert/strict";

export async function testRMUCAcademy({origin,command,evaluate,until,screenshot}){
  const arena="/pixel-jijia/arena";
  const endpoint="/api/rmuc-academy/progress";
  const completedTitle="开局基地保护", incompleteTitle="超热锁定与冷却解锁";
  const completedId="lab-base-protected", incompleteId="lab-heat-lock";
  const expected=[
    {courseId:completedId,version:1,completed:true,position:1},
    {courseId:incompleteId,version:1,completed:false,position:0},
  ];
  const progress='progress[aria-label="规则案例进度"]';
  const search='.rmul3d-lab-search input';
  const timeline='input[aria-label="演示时间"]';
  const button=(text,selector="button")=>wait(
    `[...document.querySelectorAll(${JSON.stringify(selector)})].some(e=>!e.disabled&&e.getClientRects().length&&e.innerText.trim()===${JSON.stringify(text)})`,
    "button "+text);
  function wait(expression,label,ms=30000){
    return until(async()=>{
      try{return await evaluate(expression);}
      catch(error){if(/context.*(destroyed|not found)|Cannot find context/i.test(String(error)))return false;throw error;}
    },label,ms);
  }
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
    await wait(`location.pathname===${JSON.stringify(arena)}&&document.body.innerText.includes("规则实验室")`,"login redirect to arena");
    const session=await account();
    assert.equal(session.status,200);
    assert.equal(session.user.email,email);
    assert.ok(session.user.id);
    await click('nav[aria-label="模拟器主菜单"] button',"规则实验室");
    await wait(`Boolean(document.querySelector(${JSON.stringify(progress)})&&document.querySelector(${JSON.stringify(search)}))`,"authenticated academy directory");
    assert.ok(!await evaluate('document.body.innerText.includes("未登录，本次学习进度")'),"not a guest session");
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
  async function assertDirectory(count,resume=null){
    await wait(`document.querySelector(${JSON.stringify(progress)})?.value===${count}`,"restored completed count "+count);
    const actual=await evaluate('[...document.querySelectorAll(".rmul3d-academy-progress button")].map(e=>e.innerText.trim())');
    assert.deepEqual(actual,resume?["继续案例 · "+resume]:[]);
  }
  async function open(title){
    await fill(search,title);
    await click(".rmul3d-lab-case-list button",title);
    await wait(`document.querySelector(".rmul3d-lab-header h1")?.innerText===${JSON.stringify(title)}`,"opened "+title);
    await button("← 返回",".rmul3d-lab-header button");
  }
  async function assertCompletedBadge(){
    await fill(search,completedTitle);
    await wait(`[...document.querySelectorAll(".rmul3d-lab-case-list button")].some(e=>e.querySelector("span")?.innerText===${JSON.stringify(completedTitle)}&&e.querySelector("small")?.innerText.includes("已验证"))`,"restored completed badge");
  }
  try{
    const passwordA=process.env.TARSGO_TEST_USER_PASSWORD,passwordB=process.env.TARSGO_TEST_ADMIN_PASSWORD;
    assert.ok(passwordA&&passwordB,"existing synthetic acceptance accounts required");
    const userA=await login("test-user@tarsgo.test",passwordA);
    assert.deepEqual(await rows(),[]);await assertDirectory(0);
    console.log("RMUC: account A real login form and empty progress passed.");
    await open(completedTitle);
    await click(".rmul3d-lab-actions button","播放");
    await wait('Boolean(document.querySelector(".rmul3d-lab-question"))',"played complete case");
    await click(".rmul3d-lab-question .rmul3d-academy-answers button","不够，还需要满足正式护甲展开条件");
    await button("保存案例进度",".rmul3d-lab-question button");
    await click(".rmul3d-lab-question button","保存案例进度");
    // Completion disables the button after the real PUT response.
    await wait('document.querySelector(".rmul3d-lab-question .rmul3d-primary")?.innerText==="案例已验证"',"completed progress saved");
    assert.deepEqual(await rows(),[expected[0]]);
    await screenshot("01-account-a-completed");
    await click(".rmul3d-lab-header button","← 返回");
    await assertDirectory(1);
    await open(incompleteTitle);
    await click(".rmul3d-lab-actions button","播放");
    await wait(`+document.querySelector(${JSON.stringify(timeline)})?.value>0`,"started incomplete case");
    await click(".rmul3d-lab-actions button","暂停");
    assert.ok(await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(timeline)});return +r.value<+r.max&&!document.querySelector(".rmul3d-lab-question")})()`));
    await screenshot("02-account-a-incomplete");
    await click(".rmul3d-lab-header button","← 返回");
    await assertDirectory(1,incompleteTitle);
    assert.deepEqual(await rows(),expected);
    console.log("RMUC: UI completed and incomplete case records saved to MariaDB.");
    await logout();
    assert.equal(await login("test-user@tarsgo.test",passwordA),userA);
    await assertDirectory(1,incompleteTitle);await assertCompletedBadge();
    assert.deepEqual(await rows(),expected);
    await screenshot("03-account-a-relogin");
    console.log("RMUC: logout and real password re-login restored both progress records.");
    await logout();
    const userB=await login("test-admin@tarsgo.test",passwordB);
    assert.notEqual(userB,userA);
    await assertDirectory(0);assert.deepEqual(await rows(),[]);
    await fill(search,completedTitle);
    await wait(`[...document.querySelectorAll(".rmul3d-lab-case-list button")].some(e=>e.querySelector("span")?.innerText===${JSON.stringify(completedTitle)}&&!e.querySelector("small")?.innerText.includes("已验证"))`,"account B uncompleted badge");
    await screenshot("04-account-b-isolation");
    console.log("RMUC: account B real login, zero progress and no inherited badge passed.");
    await logout();
    assert.equal(await login("test-user@tarsgo.test",passwordA),userA);
    await assertDirectory(1,incompleteTitle);await assertCompletedBadge();
    assert.deepEqual(await rows(),expected);
    await click(".rmul3d-academy-progress button","继续案例 · "+incompleteTitle);
    await wait(`document.querySelector(".rmul3d-lab-header h1")?.innerText===${JSON.stringify(incompleteTitle)}&&document.querySelector(${JSON.stringify(timeline)})?.value==="0"`,"resume incomplete case");
    await button("← 返回",".rmul3d-lab-header button");
    assert.deepEqual(await rows(),expected);
    await screenshot("05-account-a-resume");
    await logout();
    console.log("RMUC ACADEMY BROWSER ACCEPTANCE PASSED: actual login UI, completed/incomplete save, logout, A/B isolation and A restore.");
  }catch(error){
    console.error("RMUC browser acceptance failed:",error.message);
    try{
      console.log("RMUC failure page",await evaluate('({path:location.pathname,alerts:[...document.querySelectorAll("[role=alert]")].map(e=>e.innerText),heading:document.querySelector("h1")?.innerText})'));
      await screenshot("failure");
    }catch(e){console.error("RMUC failure evidence unavailable:",e.message);}
    throw error;
  }
}
