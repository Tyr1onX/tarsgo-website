import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const { chromium } = await import(process.env.TARSGO_PLAYWRIGHT_MODULE || 'playwright');
const base='http://127.0.0.1:8182';
const out=process.env.TARSGO_UNIFIED_OUT || '/tmp/tarsgo-unified-20261104/browser';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const contexts=[],checks=[],errors=[]; const marker=Date.now();
function sql(q){return execFileSync('/opt/homebrew/opt/mariadb@11.4/bin/mariadb',['--no-defaults','-uroot','--socket=/tmp/tarsgo-audit-db-20261103/db.sock','tarsgo_acceptance','-N','-e',q],{encoding:'utf8'}).trim()}
async function page(mobile=false){const c=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}});contexts.push(c);const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));return p}
async function api(p,path,method='GET',data){const r=await p.request.fetch(base+path,{method,data,headers:method==='GET'?{}:{Origin:base}});const body=await r.json();return {status:r.status(),body:body.data,message:body.message}}
async function login(p,email,password){await p.goto(base+'/login');await p.getByLabel('邮箱',{exact:true}).fill(email);await p.getByLabel('密码',{exact:true}).fill(password);await p.getByRole('button',{name:'登录',exact:true}).click();await p.waitForURL(/dashboard/)}
async function signup(p,student,unknown=false){
 const email=`unified-${marker}-${student?unknown?'manual':'student':'external'}@tarsgo.test`;
 await p.goto(base+'/register');
 assert.equal(await p.getByLabel('手机号',{exact:true}).count(),0);
 assert.equal(await p.getByLabel('性别',{exact:true}).count(),0);
 assert.equal(await p.getByLabel('校区',{exact:true}).count(),0);
 await p.getByLabel('姓名',{exact:true}).fill(student?'学生测试':'社区测试');
 await p.getByLabel('邮箱',{exact:true}).fill(email);await p.getByLabel('密码',{exact:true}).fill('SyntheticUnified123!');
 await p.getByLabel('是否在校学生',{exact:true}).selectOption(String(student));
 if(student){await p.getByLabel('学号',{exact:true}).fill(unknown?'OTHER123':'20241422');await p.getByLabel('学院',{exact:true}).fill('通信工程学院');
  if(unknown){await p.getByLabel('年级',{exact:true}).selectOption('2023 级')}else{assert.equal(await p.getByLabel('年级',{exact:true}).inputValue(),'2024 级');assert.equal(await p.getByLabel('年级',{exact:true}).getAttribute('readonly'),'')}
 }else{assert.equal(await p.getByLabel('学号',{exact:true}).count(),0)}
 await p.getByRole('button',{name:'发送验证码',exact:true}).click();
 let code;for(let i=0;i<50;i++){try{const lines=(await fs.readFile('/tmp/tarsgo-unified-20261104/mailbox/messages.jsonl','utf8')).trim().split('\n').map(JSON.parse);const m=lines.findLast(m=>m.to.includes(email));code=m?.text.match(/\d{6}/)?.[0]}catch{}if(code)break;await p.waitForTimeout(100)}
 assert(code,'actual local mailbox code');await p.getByLabel('邮箱验证码',{exact:true}).fill(code);await p.getByRole('button',{name:'创建账号',exact:true}).click();await p.waitForURL(/dashboard/);
 const profile=await api(p,'/api/me/profile');assert.equal(profile.status,200);assert.equal(profile.body.isStudent,student);assert.equal(profile.body.grade,student?unknown?'2023 级':'2024 级':'');return profile.body;
}
const snapshot=()=>sql("SELECT JSON_OBJECT('name',real_name,'email',email,'studentId',student_id,'college',college,'grade',grade,'campus',campus,'gender',gender,'phone',phone,'isStudent',is_student,'role',role_id,'identity',team_identity_status,'updatedAt',updated_at,'groups',(SELECT GROUP_CONCAT(CONCAT(group_id,':',role)) FROM user_group_members WHERE user_id=u.id)) FROM users u WHERE email='unified-formal@tarsgo.test'");
try{
 // Reset only reserved synthetic fixtures in the hard-coded loopback database.
 sql("UPDATE users SET real_name='旧号测试',is_student=NULL,student_id='',college='',grade='' WHERE email='test-user@tarsgo.test'; UPDATE users SET real_name='正式测试',is_student=NULL,student_id='20241421',college='通信工程学院',grade='2024级' WHERE email='unified-formal@tarsgo.test'");
 const admin=await page();await login(admin,'test-super-admin@tarsgo.test','synthetic-super-only');
 await admin.goto(base+'/programs/ai-salon/manage');await admin.getByRole('button',{name:'创建活动',exact:true}).click();
 const upload=admin.waitForResponse(r=>r.url().endsWith('/api/admin/ai-salon/posters')&&r.request().method()==='POST');
 await admin.locator('input[type=file]').setInputFiles({name:'synthetic-poster.png',mimeType:'image/png',buffer:await fs.readFile(new URL('./profile-desktop.png',import.meta.url))});
 assert.equal((await upload).status(),200);await admin.getByAltText('活动海报预览').waitFor();checks.push('既有活动海报上传与预览');
 const now=Date.now();const event={title:`[TEST] Unified ${marker}`,summary:'统一资料报名测试',posterUrl:'',location:'测试地点',capacity:1,published:true,registrationClosed:false,startAt:new Date(now+3600000).toISOString(),endAt:new Date(now+7200000).toISOString(),deadline:new Date(now+1800000).toISOString()};
 const created=await api(admin,'/api/admin/ai-salon/events','POST',event);assert.equal(created.status,200);const id=created.body.id;const path=`/programs/ai-salon/${id}`;
 const guest=await page();await guest.goto(base+path);await guest.getByRole('link',{name:'登录',exact:true}).last().waitFor();assert.equal((await api(guest,`/api/ai-salon/events/${id}/registration`,'POST')).status,401);checks.push('匿名不可报名');
 const student=await page();const studentP=await signup(student,true);checks.push('学生注册、真实模拟邮箱验证码、自动年级、无手机号性别校区');
 const external=await page(true);const externalP=await signup(external,false);checks.push('非学生注册无需学籍字段');
 const manual=await page();await signup(manual,true,true);checks.push('无法识别学号的手动入学年份');
 const formal=await page();await login(formal,'unified-formal@tarsgo.test','synthetic-user-only');const before=snapshot();
 await formal.goto(base+path);await formal.getByRole('button',{name:'确认报名',exact:true}).waitFor();assert.equal(await formal.getByLabel('学号',{exact:true}).count(),0);
 const forged=await api(formal,`/api/ai-salon/events/${id}/registration`,'POST',{realName:'伪造姓名',isStudent:false,userId:1,roleId:1,studentId:'FORGED'});assert.equal(forged.status,200);assert.equal(forged.body.realName,'正式测试');assert.equal(forged.body.studentId,'20241421');assert.equal(snapshot(),before);
 await formal.reload();await formal.getByText('已报名',{exact:true}).waitFor();checks.push('正式成员历史资料直接复用、伪造身份忽略、账号及组别零改写');
 for(const p of [external,manual]){await p.goto(base+path);await p.getByRole('button',{name:'确认报名',exact:true}).click();await p.getByText('候补中',{exact:true}).waitFor()}
 assert.equal((await api(external,`/api/ai-salon/events/${id}/check-in`,'POST')).status,409);
 assert.equal((await api(formal,`/api/ai-salon/events/${id}/registration`,'POST')).status,409);
 assert.equal((await api(external,`/api/ai-salon/events/${id}/registration`,'DELETE')).status,200);
 assert.equal((await api(external,`/api/ai-salon/events/${id}/registration`,'POST')).status,200);
 assert.equal((await api(formal,`/api/ai-salon/events/${id}/registration`,'DELETE')).status,200);
 const mr=await api(manual,'/api/ai-salon/registrations');assert.equal(mr.body[0].status,'registered');assert.equal(snapshot(),before);checks.push('重复报名、非学生候补、取消重排、FIFO 补位保持身份');
 // Missing existing account follows the one canonical editor and returns to the salon.
 const missing=await page();await login(missing,'test-user@tarsgo.test','synthetic-user-only');await missing.goto(base+path);
 await missing.getByRole('link',{name:'完善个人资料',exact:true}).click();await missing.getByLabel('是否在校学生',{exact:true}).selectOption('false');
 // Seeded acceptance account has an intentionally invalid display name; update it via its existing header editor.
 await missing.getByRole('button',{name:'编辑姓名',exact:true}).click();const ni=missing.getByRole('textbox',{name:'姓名',exact:true});await ni.fill('旧号测试');await ni.press('Enter');await missing.getByRole('button',{name:'编辑姓名',exact:true}).waitFor();
 await missing.getByRole('button',{name:'保存个人资料',exact:true}).click();await missing.getByText('个人资料已保存',{exact:true}).waitFor();await missing.getByRole('link',{name:'返回活动报名',exact:true}).click();await missing.getByRole('button',{name:'确认报名',exact:true}).waitFor();checks.push('旧账号缺失资料→唯一编辑入口补齐→返回活动');
 // A later account profile edit leaves every cancelled and active registration snapshot intact.
 const fuser=(await api(formal,'/api/me')).body.user;
 await formal.goto(base+`/dashboard/members/${fuser.id}?tab=settings&returnTo=${encodeURIComponent(path)}`);
 await formal.getByLabel('学院',{exact:true}).fill('修改测试学院');await formal.getByRole('button',{name:'保存个人资料',exact:true}).click();await formal.getByText('个人资料已保存',{exact:true}).waitFor();await formal.getByRole('link',{name:'返回活动报名',exact:true}).click();await formal.getByRole('button',{name:'确认报名',exact:true}).click();await formal.getByText('候补中',{exact:true}).waitFor();
 const old=(await api(formal,'/api/ai-salon/registrations')).body;assert.equal(old.find(r=>r.status==='cancelled').college,'通信工程学院');assert.equal(old.find(r=>r.status==='waitlisted').college,'修改测试学院');
 event.capacity=4;event.startAt=new Date(Date.now()-60000).toISOString();event.deadline=event.startAt;event.endAt=new Date(Date.now()+3600000).toISOString();assert.equal((await api(admin,`/api/admin/ai-salon/events/${id}`,'PUT',event)).status,200);
 const beforeCheck=snapshot();await formal.reload();await formal.getByRole('button',{name:'签到',exact:true}).click();await formal.getByText(/^已签到 ·/).waitFor();assert.equal(snapshot(),beforeCheck);assert.equal((await api(formal,`/api/ai-salon/events/${id}/check-in`,'POST')).status,409);checks.push('扩容补位、签到仅一次、签到不改账号');
 const csv=await admin.request.get(base+`/api/admin/ai-salon/events/${id}/export`);assert.equal(csv.status(),200);const csvText=await csv.text();assert(csvText.includes('通信工程学院')&&csvText.includes('修改测试学院')&&csvText.includes('非在校学生'));await fs.writeFile(out+'/synthetic-roster.csv',csvText);checks.push('历史报名与账号修改后的独立快照、真实 CSV 导出');
 await formal.screenshot({path:out+'/registered-desktop.png',fullPage:true});await external.reload();await external.getByText('已报名',{exact:true}).waitFor();await external.screenshot({path:out+'/external-mobile.png',fullPage:true});
 await student.goto(base+`/dashboard/members/${(await api(student,'/api/me')).body.user.id}?tab=settings`);await student.getByLabel('年级',{exact:true}).waitFor();await student.screenshot({path:out+'/profile-desktop.png',fullPage:true});
 for(const p of [student,external,formal])assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow');
 assert.equal((await api(formal,'/api/ai-salon/profile')).status,404);assert.equal((await api(formal,'/api/ai-salon/profile','PUT',{})).status,404);checks.push('旧沙龙资料接口已移除，桌面/手机无横向溢出');
 // Close synthetic event to leave repeatable isolated test evidence.
 assert.equal((await api(admin,`/api/admin/ai-salon/events/${id}`,'DELETE')).status,200);
 assert.deepEqual(errors,[]);await fs.writeFile(out+'/results.json',JSON.stringify({checks,errors,studentP,externalP},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{for(const c of contexts)await c.close();await browser.close()}
