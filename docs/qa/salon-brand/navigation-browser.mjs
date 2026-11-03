import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { chromium } = await import(process.env.TARSGO_PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.TARSGO_SALON_BROWSER_BASE || 'http://127.0.0.1:8194';
assert.equal(new URL(base).hostname,'127.0.0.1','Synthetic accounts must remain local');
const out=process.env.TARSGO_SALON_BROWSER_OUT || process.cwd()+'/docs/qa/salon-brand';
const browser=await chromium.launch({headless:true,executablePath:process.env.TARSGO_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const routes=['/about','/robots','/join','/dashboard','/programs/ai-salon','/events-and-honors','/team-history','/micro-specialties/low-altitude-intelligent-sensing-control'];
const results=[],errors=[],timings=[];
async function login(p,actor){await p.goto(base+'/login');await p.getByLabel('邮箱',{exact:true}).fill(`salon-browser-${actor}@tarsgo.test`);await p.getByLabel('密码',{exact:true}).fill('SyntheticSalonOnly123!');await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(/dashboard/);}
async function header(p){const nav=p.getByRole('navigation',{name:'主导航',exact:true});await nav.getByRole('link',{name:'TARSGO 首页'}).waitFor();assert.equal(await nav.locator('a').count(),2);assert.equal(await nav.locator('#site-mobile-menu,.navbar-menu-toggle').count(),0);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));return nav;}
async function theme(p,mode){if(await p.locator('html').getAttribute('data-theme')!==mode)await p.getByRole('button',{name:/^切换到.*模式$/}).click();await p.waitForFunction(x=>document.documentElement.dataset.theme===x,mode);await p.waitForTimeout(260);}
async function menu(p){await p.getByRole('button',{name:/^打开.*的用户菜单/}).click();await p.waitForTimeout(220);return p.getByRole('menu');}
try{
 for(const width of [320,390,768,1440])for(const mode of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/programs');await p.waitForURL(base+'/programs/ai-salon');await p.getByRole('heading',{name:'吉甲 AI 沙龙',exact:true}).waitFor();
  await header(p);await theme(p,mode);
  // Check the real rendered action colors in both themes, including hover.
  const cta=p.getByRole('link',{name:/查看近期活动/});const colors=()=>cta.evaluate(el=>{const s=getComputedStyle(el);return {text:s.color,background:s.backgroundColor}});
  const normal=await colors();await cta.hover();await p.waitForTimeout(220);const hover=await colors();assert.notEqual(normal.text,normal.background);assert.notEqual(hover.text,hover.background);
  await p.getByRole('link',{name:'TARSGO 首页'}).click();await p.waitForURL(base+'/');await p.locator('.home-visual-card').last().scrollIntoViewIfNeeded();assert.equal(await p.locator('.home-visual-card').count(),8);assert.deepEqual(await p.locator('.home-visual-card').evaluateAll(a=>a.map(x=>x.getAttribute('href'))),routes);
  if([390,1440].includes(width)&&mode==='light')for(const path of routes){await p.goto(base+'/');await p.locator(`.home-visual-card[href="${path}"]`).click();await p.waitForURL(u=>u.pathname===path||(path==='/dashboard'&&u.pathname==='/login'));await p.locator('h1').first().waitFor();assert.equal(await p.getByText('页面不存在',{exact:true}).count(),0);results.push({width,clicked:path,landed:new URL(p.url()).pathname});}
  results.push({width,theme:mode,minimalHeader:true,eightHomeEntries:true,ctaColors:{normal,hover}});await context.close();
 }
 for(const actor of [1,5,0])for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await login(p,actor);await p.goto(base+'/programs/ai-salon');await p.getByRole('heading',{name:'吉甲 AI 沙龙',exact:true}).waitFor();
  const me=await p.evaluate(async()=> (await (await fetch('/api/me')).json()).data.user);
  const m=await menu(p);const expected=['我的主页',...(me.workbenchAccess?['工作台']:[]),...(actor===1?[]:['管理后台']),'切换账号','退出登录'];assert.deepEqual(await m.getByRole('menuitem').allTextContents(),expected);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await p.keyboard.press('Home');assert.equal(await p.evaluate(()=>document.activeElement.textContent.trim()),'我的主页');await p.keyboard.press('End');assert.equal(await p.evaluate(()=>document.activeElement.textContent.trim()),'退出登录');await p.keyboard.press('Escape');assert(await p.getByRole('button',{name:/^打开.*的用户菜单/}).evaluate(el=>el===document.activeElement));
  await menu(p);await p.mouse.click(5,120);assert.equal(await p.getByRole('menu').count(),0);
  await menu(p);for(const mode of ['light','dark']){await p.locator('body').click({position:{x:5,y:120}});await theme(p,mode);await menu(p);await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:`${out}/account-${actor}-${width}-${mode}.png`,fullPage:true});}
  await p.getByRole('menuitem',{name:'切换账号',exact:true}).click();await p.waitForURL(u=>u.pathname==='/login'&&u.searchParams.get('addAccount')==='1');assert.equal(new URL(p.url()).searchParams.get('redirect'),'/programs/ai-salon');
  await p.goto(base+'/programs/ai-salon/manage');if(actor===0){await p.getByRole('heading',{name:'管理活动',exact:true}).waitFor();}else{await p.getByRole('alert').filter({hasText:'仅超级管理员'}).waitFor();assert.equal((await p.request.get(base+'/api/admin/ai-salon/events')).status(),403);}
  await p.goto(base+'/programs/ai-salon');await p.getByRole('button',{name:/^打开.*的用户菜单/}).waitFor();if(actor===0)await p.getByRole('link',{name:'管理活动',exact:true}).waitFor();assert.equal(await p.getByRole('link',{name:'管理活动',exact:true}).count(),actor===0?1:0);
  await menu(p);await p.getByRole('menuitem',{name:'退出登录',exact:true}).click();await p.waitForURL(base+'/');await p.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'登录',exact:true}).waitFor();results.push({actor,width,menu:expected,permissionChecks:true,switchAccount:true,logout:true});await context.close();
 }
 // Real browser route timings. All samples run against local synthetic backend, not production.
 const p=await browser.newPage({viewport:{width:1440,height:1000}});await login(p,0);let requests=[];
 p.on('requestfinished',r=>{const t=r.timing();requests.push({path:new URL(r.url()).pathname,kind:r.url().includes('/api/')?'api':'asset',durationMs:Math.round(t.responseEnd)});});
 async function measure(name,click,heading){requests=[];await p.evaluate(()=>{window.__commitAt=null;const old=history.pushState;history.pushState=function(...a){window.__commitAt=performance.now();return old.apply(this,a)};window.__clickAt=null;document.addEventListener('click',()=>{window.__clickAt=performance.now()},{once:true,capture:true});});await click();await p.getByRole('heading',{name:heading,exact:true}).waitFor();const times=await p.evaluate(()=>({routeCommitMs:window.__commitAt===null||window.__clickAt===null?null:window.__commitAt-window.__clickAt,titleVisibleMs:window.__clickAt===null?null:performance.now()-window.__clickAt}));timings.push({name,...times,requests:[...requests]});}
 for(let i=0;i<4;i++){if(i===0)await p.goto(base+'/programs/ai-salon');else{await p.goBack();await p.goBack();}await p.getByRole('button',{name:/^打开.*的用户菜单/}).waitFor();const m=await menu(p);const target=m.getByRole('menuitem',{name:'工作台',exact:true});if(await target.count()){await measure(`官网→工作台 ${i===0?'首次':'已加载'} ${i}`,()=>target.click(),'我的工作台');await p.getByRole('button',{name:'展开侧边栏',exact:true}).click();await measure(`工作台→管理 ${i===0?'首次':'已加载'} ${i}`,()=>p.locator('a[href="/dashboard/admin"]:visible').first().click(),'管理工作台');}else{timings.push({name:'官网→工作台',unavailable:'测试超管没有 workbenchAccess，未改动权限以伪造性能样本'});await p.keyboard.press('Escape');await p.goto(base+'/dashboard/admin');await p.getByRole('heading',{name:'管理工作台',exact:true}).waitFor();}}
 await p.goto(base+'/');await p.locator('.home-visual-card[href="/programs/ai-salon"]').scrollIntoViewIfNeeded();await measure('首页→沙龙路由',()=>p.locator('.home-visual-card[href="/programs/ai-salon"]').click(),'吉甲 AI 沙龙');await p.getByText('新一期活动筹备中',{exact:true}).waitFor();
 const cold=await browser.newPage();const start=performance.now();await cold.goto(base+'/programs/ai-salon');await cold.getByRole('heading',{name:'吉甲 AI 沙龙',exact:true}).waitFor();timings.push({name:'独立文档冷加载',titleVisibleMs:performance.now()-start});
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/navigation-results.json',JSON.stringify({base,results,timings,pageErrors:errors},null,2));console.log(JSON.stringify({checks:results.length,timings,pageErrors:errors},null,2));
}finally{await browser.close();}
