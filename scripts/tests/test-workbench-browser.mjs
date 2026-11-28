// Real workbench UI on the isolated acceptance server. Auth is fixture setup.
import assert from "node:assert/strict";

export async function testWorkbench({origin,command,evaluate,until}){
  const path="/dashboard/workbench/operations/works";
  const search='input[aria-label="搜索作品"]';
  const rows='.operations-progress__library-row[href]';
  const password=process.env.TARSGO_TEST_SUPER_ADMIN_PASSWORD;
  assert.ok(password,"synthetic super-admin credential required");
  function wait(expression,label,ms=30000){
    return until(async()=>{try{return await evaluate(expression);}catch(error){if(/context.*(destroyed|not found)|Cannot find context/i.test(String(error)))return false;throw error;}},label,ms);
  }
  async function click(selector){
    const point=await wait(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el||!el.getClientRects().length)return null;el.scrollIntoView({block:"center"});const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return el.contains(document.elementFromPoint(x,y))?{x,y}:null})()`,"workbench click "+selector);
    for(const type of ["mousePressed","mouseReleased"])await command("Input.dispatchMouseEvent",{type,...point,button:"left",clickCount:1});
  }
  async function insert(text){
    await command("Input.insertText",{text});
  }
  await command("Page.navigate",{url:origin+"/healthz"});
  await wait(`location.origin===${JSON.stringify(origin)}`,"workbench isolated origin");
  assert.equal(await evaluate(`fetch("/api/login/email/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:"test-super-admin@tarsgo.test",password:${JSON.stringify(password)}})}).then(r=>r.status)`),200);
  await command("Page.navigate",{url:origin+path});
  const first=await wait(`(()=>{const el=document.querySelector(${JSON.stringify(rows)});return el?.querySelector("strong")?.textContent?{title:el.querySelector("strong").textContent.trim(),path:el.pathname}:null})()`,"seeded operation work");
  assert.ok(first.title&&first.path.startsWith(path+"/"));
  await click(search);
  const focused=`document.activeElement===document.querySelector(${JSON.stringify(search)})`;
  let query="";
  for(const char of Array.from(first.title)){
    query+=char;await insert(char);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(search)})?.value`),query,"continuous search input");
    assert.equal(await evaluate(focused),true,"search keeps focus while typing");
  }
  await wait(`new URLSearchParams(location.search).get("q")===${JSON.stringify(query)}`,"search URL committed");
  assert.equal(await evaluate(focused),true,"search keeps focus after navigation");
  const link=rows+`[href="${first.path}"]`;
  await click(link);
  await wait(`location.pathname===${JSON.stringify(first.path)}`,"open filtered work");
  await evaluate("history.back();true");
  await wait(`location.pathname===${JSON.stringify(path)}&&new URLSearchParams(location.search).get("q")===${JSON.stringify(query)}&&document.querySelector(${JSON.stringify(search)})?.value===${JSON.stringify(query)}&&!!document.querySelector(${JSON.stringify(link)})`,"back restores search and filtered row");
  await evaluate("history.forward();true");
  await wait(`location.pathname===${JSON.stringify(first.path)}`,"forward restores detail");
  await evaluate("history.back();true");
  await wait(`location.pathname===${JSON.stringify(path)}&&document.querySelector(${JSON.stringify(search)})?.value===${JSON.stringify(query)}`,"second back restores search");
  await click(search);
  for(const type of ["keyDown","keyUp"])await command("Input.dispatchKeyEvent",{type,key:"a",code:"KeyA",modifiers:process.platform==="darwin"?4:2,windowsVirtualKeyCode:65});
  await insert("qa-no-matching-operation-20261128");
  await wait(`document.querySelector("main.operations-progress")?.textContent.includes("没有匹配的作品")`,"empty search result");
  assert.equal(await evaluate(focused),true,"empty result keeps search focus");
  console.log("WORKBENCH BROWSER ACCEPTANCE PASSED");
}
