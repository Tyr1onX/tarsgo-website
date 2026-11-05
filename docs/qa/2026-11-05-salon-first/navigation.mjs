import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const {chromium}=await import(process.env.TARSGO_PLAYWRIGHT_MODULE||'playwright');
const base='http://127.0.0.1:8198',out=process.env.TARSGO_UNIFIED_OUT||new URL('.',import.meta.url).pathname;
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const p=await browser.newPage({viewport:{width:1440,height:1000}}),timings=[],errors=[];let requests=[];
p.on('pageerror',e=>errors.push(e.message));p.on('requestfinished',r=>{const t=r.timing();requests.push({path:new URL(r.url()).pathname,durationMs:t.responseEnd})});
async function measure(name,click,heading){requests=[];await p.evaluate(()=>{window.__commitAt=null;const old=history.pushState;history.pushState=function(...a){window.__commitAt=performance.now();return old.apply(this,a)};window.__clickAt=null;document.addEventListener('click',()=>{window.__clickAt=performance.now()},{once:true,capture:true})});await click();await p.getByRole('heading',{name:heading,exact:true}).waitFor();timings.push({name,...await p.evaluate(()=>({routeCommitMs:window.__commitAt===null?null:window.__commitAt-window.__clickAt,titleVisibleMs:performance.now()-window.__clickAt})),requests:[...requests]})}
try{
 await p.goto(base+'/login');await p.getByLabel('邮箱',{exact:true}).fill('test-super-admin@tarsgo.test');await p.getByLabel('密码',{exact:true}).fill(execFileSync('security',['find-generic-password','-s','com.tarsgo.acceptance','-a','TEST_SUPER_ADMIN','-w'],{encoding:'utf8'}).trim());await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(/dashboard/);
 for(let i=0;i<4;i++){
  if(i===0)await p.goto(base+'/programs/ai-salon');else{await p.goBack();await p.goBack()}
  await p.getByRole('button',{name:/^打开.*的用户菜单/}).click();
  await measure(`官网→工作台 ${i===0?'首次':'已加载'} ${i}`,()=>p.getByRole('menuitem',{name:'工作台',exact:true}).click(),'我的工作台');
  await p.getByRole('button',{name:'展开侧边栏',exact:true}).click();
  await measure(`工作台→管理 ${i===0?'首次':'已加载'} ${i}`,()=>p.locator('a[href="/dashboard/admin"]:visible').first().click(),'管理工作台');
 }
 const cold=await browser.newPage();let started=performance.now();await cold.goto(base+'/programs/ai-salon');await cold.getByRole('heading',{name:'吉甲 AI 沙龙',exact:true}).waitFor();timings.push({name:'独立文档冷加载',titleVisibleMs:performance.now()-started});await cold.close();
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/navigation-results.json',JSON.stringify({base,timings,errors},null,2));console.log(JSON.stringify({timings,errors},null,2));
}finally{await browser.close()}
