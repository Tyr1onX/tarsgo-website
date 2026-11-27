import {
  createMatch,startMatch,updateMatch,territoryStatus,activeZone,controlsOutpost,
  purchaseHealth,canPurchaseHealth,revivalStatus,reviveRobot,damageTarget,
  canFire,fireRound,driveSpeed,chassisStatus,ammoOffer,purchaseAmmo,robotLevel,
  technologyLevel,assemblyStatus,pickupEnergy,beginAssembly,assemblyAction,
  energyStatus,launcherStatus,installLauncher,activateRune,runeStatus,
  armorStatus,armorAccuracy,armorFraction,fortifyArmor,sentryStatus,switchSentry,
  terrainStatus,dartStatus,openDart,selectSentryControl,robotDefense,reserveAmmo,
  type Match,type MatchEvent,type MatchRobot,type Difficulty,
} from "./rmuc-3d-match.ts";
import { ARENA_ZONES,launcherBench,zonesAtPosition,crossingContacts,type CrossingContact,type ArenaPosition,type ZoneId } from "./rmuc-3d-zones.ts";
import { radarVulnerability,type RadarReport } from "./rmuc-3d-radar.ts";
import type { KnowledgeId } from "./rmuc-academy.ts";

export type Metric = { label:string; value:number|string; max?:number; unit?:string };
type InputEvent = { at:number; label:string; accepted?:boolean };
type Context = { match:Match; positions:Map<string,ArenaPosition>; r:MatchRobot; b:MatchRobot; h:MatchRobot; s:MatchRobot; log:(label:string,accepted?:boolean)=>void };
export type LabCase = {
  id:string; title:string; knowledge:KnowledgeId; initial:string; trigger:string; expected:string; limits:string;
  seconds:number; configure?:(c:Context)=>void; setup?:(c:Context)=>void; input?:(c:Context,tick:number)=>void; read:(c:Context)=>Metric[]; reports?:(c:Context,tick:number)=>readonly RadarReport[];
  question:{prompt:string;options:readonly string[];answer:number};
};
export type LabTopic={title:string;keywords:string;cases:readonly LabCase[]};
export type LabFrame={time:number;metrics:Metric[];eventCount:number;inputCount:number;contacts:{id:string;position:ArenaPosition;zones:ZoneId[];crossings:CrossingContact[]}[]};
export type LabTrace={frames:LabFrame[];events:MatchEvent[];inputs:InputEvent[];setupEvents:MatchEvent[]};
const metric=(label:string,value:number|string,max?:number,unit?:string):Metric=>({label,value,max,unit});
const yes=(v:boolean)=>v?"是":"否";
const round=(n:number)=>Math.round(n*100)/100;
const zone=(id:ZoneId):ArenaPosition=>{const z=ARENA_ZONES.find(z=>z.id===id)!;return{x:z.goal[0],y:(z.height[0]+z.height[1])/2,z:z.goal[1]};};
const outside={x:4,y:.3,z:4};
const assembly=zone("red-assembly");
const roster=[{id:"r",team:"red",heavy:false,maxHp:200},{id:"b",team:"blue",heavy:false,maxHp:200},{id:"h",team:"red",heavy:true,maxHp:400},{id:"s",team:"red",heavy:false,maxHp:400,sentry:true},{id:"bh",team:"blue",heavy:true,maxHp:400},{id:"bs",team:"blue",heavy:false,maxHp:400,sentry:true},{id:"r2",team:"red",heavy:false,maxHp:200},{id:"b2",team:"blue",heavy:false,maxHp:200}] as const;
const sockets={red:{position:{x:.471,y:1.243,z:.069},axis:{x:Math.SQRT1_2,y:0,z:Math.SQRT1_2}},blue:{position:{x:-.475,y:1.243,z:-.073},axis:{x:-Math.SQRT1_2,y:0,z:-Math.SQRT1_2}}};
const spawns=Array.from({length:8},(_,i)=>({id:"unit"+i,team:"red" as const,position:{x:13,y:.9,z:-6.4+i*.01}}));
const at=(c:Context,id:string,p?:ArenaPosition)=>{if(p)c.positions.set(id,p);else c.positions.delete(id);};
const advance=(c:Context,seconds:number)=>updateMatch(c.match,seconds,c.positions);
const clock=(c:Context,t:number)=>{if(t>c.match.elapsed)advance(c,t-c.match.elapsed);};
const q=(prompt:string,options:readonly string[],answer:number)=>({prompt,options,answer});
const territoryRead=(c:Context)=>{const a=territoryStatus(c.match,"blue","outpost"),b=c.match.sides.blue;return [metric("蓝方前哨阵地", (a.controller==="red"?"红方":"蓝方")+(a.full?"完全控制":"临时控制")),metric("占领 / 恢复进度",a.progress/10,5,"秒"),metric("红方区域激活",yes(activeZone(c.match,c.r,"blue-central"))),metric("蓝方区域激活",yes(activeZone(c.match,c.b,"blue-outpost"))),metric("双方争夺",yes(a.contested)),metric("蓝方前哨血量",b.outpost,1000,"HP"),metric("前哨所属",b.outpostOwner==="red"?"红方":"蓝方"),metric("红方控制度",round(c.match.sides.red.controlTicks/10))];};
const healingRead=(c:Context)=>[metric("红方步兵血量",c.r.hp,c.r.maxHp,"HP"),metric("己方基地血量",c.match.sides.red.base,10000,"HP"),metric("金币",c.match.sides.red.coins),metric("补给区生效",yes(activeZone(c.match,c.r,"red-supply"))),metric("远程兑换等待",round(Math.max(0,(c.r.pendingHealAt??c.match.elapsed)-c.match.elapsed)),6,"秒"),metric("可远程兑换",yes(canPurchaseHealth(c.match,c.r))),metric("前哨回血条件",yes(activeZone(c.match,c.r,"red-outpost")&&controlsOutpost(c.match,"red","red",true)))];
const revivalRead=(c:Context)=>{const a=revivalStatus(c.match,c.r);return [metric("步兵血量",c.r.hp,c.r.maxHp,"HP"),metric("复活读条",round(a.progress*100),100,"%"),metric("虚弱",yes(a.weak)),metric("免疫",yes(a.immune)),metric("可确认复活",yes(a.canConfirm)),metric("金币",c.match.sides.red.coins),metric("功率上限",chassisStatus(c.match,c.r).limit,undefined,"W")];};
const powerRead=(c:Context)=>{const a=chassisStatus(c.match,c.r);return [metric("缓冲能量",round(a.buffer),60,"J"),metric("功率上限",a.limit,undefined,"W"),metric("虚拟需求",round(c.r.powerDemand*a.limit),undefined,"W"),metric("断电剩余",round(a.locked),5,"秒")];};
const technologyRead=(c:Context)=>{const a=assemblyStatus(c.match,c.h,assembly);return [metric("可选等级",a.available.join("、")||"无"),metric("当前装配",a.level??"无"),metric("当前步骤完成数",a.completed,a.total||undefined),metric("科技等级",a.highest,4),metric("重装等级",robotLevel(c.h,c.match),10),metric("步兵等级上限",a.cap,10),metric("每10秒金币收益",a.income),metric("团队防御增益",a.defense,100,"%"),metric("持有能量单元",energyStatus(c.match,c.h,assembly).carrying),metric("金币",c.match.sides.red.coins),metric("失败原因",a.failure??"无")];};
function prepareAssembly(c:Context,count:number){
  const rack={x:12,y:.13,z:-6.4};at(c,"h",rack);advance(c,.1);
  for(let i=0;i<count;i++){const id=energyStatus(c.match,c.h,rack).pickup;if(!id||!pickupEnergy(c.match,"h",rack,id))throw Error("装配预设拾取失败");}
  at(c,"h",assembly);advance(c,.1);
}
function completePrior(c:Context,level:Difficulty){
  clock(c,(level-1)*60);prepareAssembly(c,1);
  if(!beginAssembly(c.match,"h",assembly,level))throw Error("前置装配未获许可");
  advance(c,1);
  for(let i=0;i<10&&c.match.sides.red.tech.attempt;i++){
    const a=assemblyStatus(c.match,c.h,assembly).actions[0];
    if(!a||!assemblyAction(c.match,"h",assembly,a.core,a.step,a.angle))throw Error("前置装配步骤失败");
    advance(c,a.step===5?1:.6);
  }
  if(technologyLevel(c.match,"red")<level)throw Error("前置装配未完成");
}
const techCase=(level:Difficulty,variant:"first"|"repeat"|"early"|"missing"|"cancel"|"timeout"="first",conditions?:{elapsed:number;prior:boolean;units:number}):LabCase=>({
  id:"tech-"+level+"-"+variant,title:variant==="first"?level+"级装配全过程":variant==="repeat"?"重复一级装配":variant==="early"?"开放时间未到":variant==="missing"?"前置等级未完成":variant==="timeout"?"双核心步骤超时":"中途离开装配区",
  knowledge:"assembly",initial:conditions?"比赛 "+conditions.elapsed+" 秒；"+(conditions.prior?"已完成前置等级":"无前置装配")+"；准备 "+conditions.units+" 枚能量单元。":variant==="repeat"?"已真实完成一级装配，再拾取一枚能量单元。":variant==="missing"?"比赛已过2分钟，尚无前置装配成果。":variant==="early"?"已完成一级装配，但未到1分钟。":"从开局通过真实裁判完成所需前置等级，再准备本级能量单元。",
  trigger:variant==="timeout"?"一级至三级前置已完成，四级装配完成首个核心插入后，不再提交另一核心配对步骤。":variant==="cancel"?"插入后离开装配区，等待裁判取消。":"向裁判提交等级申请，按返回的合法步骤依次演示；观察实际收益。",
  expected:conditions?"时间、前置科技、能量单元与区域条件同时满足才可申请；实际裁判完成全部步骤后结算。":variant==="early"||variant==="missing"?"裁判拒绝选择，不产生新装配收益。":variant==="timeout"?"双核心步骤超过时间限制，裁判取消本次装配，不产生四级收益。":variant==="cancel"?"流程中断不增加科技等级或收益。":"只有全部步骤确认后才产生装配收益；重复装配不重复提高等级。",
  limits:"信号级装配示意：使用原裁判许可、真实步骤和定时器；核心位姿与动作输入采用既有测试夹具，不表示真实机械精度或实车控制。",
  seconds:variant==="cancel"?22:variant==="first"&&level===4?25:18,
  setup(c){
    if(conditions){if(conditions.prior)for(let i=1;i<level;i++)completePrior(c,i as Difficulty);clock(c,conditions.elapsed);prepareAssembly(c,conditions.units);return;}
    if(variant==="missing")clock(c,120);
    else if(variant==="repeat"||variant==="early")completePrior(c,1);
    else for(let i=1;i<level;i++)completePrior(c,i as Difficulty);
    if(variant!=="early"&&variant!=="missing")clock(c,(level-1)*60);
    prepareAssembly(c,level===4?2:1);
  },
  input(c,tick){
    if(tick===0)c.log("申请"+level+"级装配",beginAssembly(c.match,"h",assembly,level));
    if(variant==="early"||variant==="missing"||variant==="timeout"&&tick>11)return;
    if(variant==="cancel"&&tick===19){at(c,"h",outside);c.log("离开装配区");return;}
    if(variant==="cancel"&&tick>=19)return;
    if(tick%11===0&&tick>0){const a=assemblyStatus(c.match,c.h,assembly).actions.sort((a,b)=>a.step-b.step)[0];if(a)c.log("核心"+(a.core==="red"?"红":"蓝")+"："+({2:"插入",3:"平移",4:"定位",5:"旋转",6:"确认"}[a.step]),assemblyAction(c.match,"h",assembly,a.core,a.step,a.angle));}
  },
  read:technologyRead,
  question:conditions?q("仅达到比赛开放时间，能否保证装配申请成功？",["不能，还须满足前置及资源条件","能"],0):variant==="early"||variant==="missing"?q("申请被拒后，科技等级会增加吗？",["不会","会"],0):variant==="cancel"||variant==="timeout"?q("装配中断是否获得本次成功收益？",["会","不会"],1):variant==="repeat"?q("重复一级是否再次提高等级上限？",["会","不会，只增加周期金币"],1):q("何时获得本级正式收益？",["选择难度时","插入时","全部要求完成并确认后"],2)
});
const territoryCase=(variant:"capture"|"contest"|"interrupt"|"rebuild"):LabCase=>({
 id:"territory-"+variant,title:{capture:"临时控制 → 原阵营恢复完全控制",contest:"争夺冻结占领进度",interrupt:"中断与进度回退",rebuild:"前哨归属与重建"}[variant],knowledge:variant==="rebuild"?"outpost":"territory",
 initial:"双方完全控制各自阵地；蓝方前哨存活。",trigger:variant==="rebuild"?"红方先形成临时控制，然后输入裁判有效前哨摧毁事件。":variant==="contest"?"红方激活蓝方中央高地2秒，蓝方随后激活同阵地前哨点。":variant==="interrupt"?"红方激活2秒后离开，观察激活保留及占领回退。":"红方持续激活蓝方中央高地，5秒取得临时控制；第6秒离开。",
 expected:variant==="rebuild"?"前哨重建为新拥有方，500 HP，阵地完全控制。":variant==="contest"?"双方同时激活同一阵地，进度暂停。":variant==="interrupt"?"未满足连续占领条件时进度逐渐回退，而非直接归零。":"5秒形成红方临时控制；红方不再激活并达到5秒条件后，蓝方恢复完全控制；现有裁判保留短时区域激活。",
 limits:"输入为已识别的区域接触或虚拟裁判有效命中；不是物理移动轨迹。几何区与正式RFID覆盖有差异。",
 seconds:variant==="contest"?7:variant==="rebuild"?8:15,
 input(c,t){if(t===0){at(c,"r",zone("blue-central"));c.log("红方激活蓝方中央高地");}
 if(variant==="contest"&&t===20){at(c,"b",zone("blue-outpost"));c.log("蓝方激活本方前哨点");}
 if((variant==="interrupt"&&t===20)||(variant==="capture"&&t===60)){at(c,"r");c.log("红方离开区域");}
 if(variant==="rebuild"&&t===55){for(let i=0;i<50;i++)damageTarget(c.match,c.r,{type:"outpost",team:"blue"});c.log("输入有效前哨命中至摧毁");}},
 read:territoryRead,question:variant==="contest"?q("双方争夺时进度如何变化？",["继续增加","暂停","立刻归零"],1):variant==="interrupt"?q("条件中断后，占领进度最终如何处理？",["逐渐回退","立即归零","永久保留"],0):variant==="rebuild"?q("重建后的前哨血量？",["1000","500","0"],1):q("首次连续激活5秒，取得什么状态？",["完全控制","临时控制"],1)
});
const healingCase=(id:string,title:string,base:number,method:"supply"|"outpost"|"remote",start=0,inCombat=false,death=false,initialHp=method==="remote"?40:100):LabCase=>({
 id,title,knowledge:method==="supply"?"supply":"recovery",initial:"红方步兵"+initialHp+"/200 HP；己方基地"+base+" HP；比赛已进行"+start+"秒"+(inCombat?"，处于交战状态。":"，处于脱战状态。"),
 trigger:death?"提交兑换请求后，在到账前输入有效战亡事件。":method==="remote"?"提交远程兑换请求。":"激活己方"+(method==="supply"?"补给区":"完全控制的前哨站增益点")+"。",
 expected:death?"战亡使待到账请求失效，已扣除金币不返还。":method==="remote"?"脱战且金币充足时请求成功，6秒后由裁判结算；交战时拒绝。":"由裁判按恢复方式、比赛时间、脱战条件和基地后勤系数结算。",
 limits:"基地血量和机器人血量是独立教学初始预设；数值来自原裁判，区域输入为激活信号近似。",
 seconds:method==="remote"?8:5,setup(c){clock(c,start);c.match.sides.red.base=base;c.r.hp=initialHp;c.r.lastCombat=c.match.elapsed-(inCombat?0:6);},
 input(c,t){if(t===0){if(method==="remote")c.log("申请远程兑换血量",purchaseHealth(c.match,"r"));else{at(c,"r",zone(method==="supply"?"red-supply":"red-outpost"));c.log("进入有效恢复区域");}}if(death&&t===20){for(let i=0;i<3;i++)damageTarget(c.match,c.b,{type:"robot",id:"r"});c.log("到账前的虚拟战亡事件");}},
 read:healingRead,question:death?q("到账前战亡，已经扣除的金币会退还吗？",["会","不会"],1):inCombat&&method==="remote"?q("交战时能否立即远程兑换？",["能","不能"],1):method==="remote"?q("远程兑换血量何时到账？",["请求立即到账","符合条件后等待6秒"],1):q("恢复量是否受基地后勤系数影响？",["受影响","不受影响"],0)
});
const reviveCase=(paid:boolean,lowBase:boolean,coins=800,base=lowBase?3000:10000):LabCase=>({
 id:paid?"revive-paid":lowBase?"revive-fast":"revive-read",title:paid?"金币立即复活":lowBase?"低基地血量下的读条":"读条复活、虚弱与免疫",knowledge:"revival",
 initial:"比赛20秒，红方步兵刚战亡；"+"基地 "+base+" HP。金币 "+coins+"。",
 trigger:paid?"提交立即复活，观察3秒状态及4秒功率增益。":"等待裁判允许确认复活，随后激活己方基地增益点。",
 expected:paid?"金币足够时恢复全血，虚弱与免疫持续3秒，功率增益持续4秒；余额不足则拒绝。":"读条完成后恢复10%血量，激活有效区域解除虚弱，免疫按规则到期。",
 limits:"战亡由虚拟裁判有效伤害触发；低基地血量是教学预设。",
 seconds:paid?6:30,
 setup(c){clock(c,20);c.match.sides.red.base=base;c.match.sides.red.coins=coins;for(let i=0;i<10;i++)damageTarget(c.match,c.b,{type:"robot",id:"r"});},
 input(c,t){if(paid){if(t===0)c.log("兑换立即复活",reviveRobot(c.match,"r",true));return;}if(revivalStatus(c.match,c.r).canConfirm){c.log("确认读条复活",reviveRobot(c.match,"r"));}if(c.r.revival?.state==="revived"&&c.r.revival.weak&&c.match.elapsed>=c.r.revival.at/10+2){at(c,"r",zone("red-base"));c.log("激活己方基地增益点");}},
 read:revivalRead,question:paid?q("立即复活成功后通常具有多久的免疫？",["3秒","30秒"],0):q("读条复活时恢复多少上限血量？",["100%","10%"],1)
});
const heatCase:LabCase={id:"heat-lock",title:"超热锁定与冷却解锁",knowledge:"heat",initial:"默认一级步兵，预设有允许发弹量，热量为0。",trigger:"向虚拟裁判提交连续发弹检测，超限后尝试继续；等待冷却。",expected:"超热进入锁定，热量归零后才解除。",limits:"仅展示虚拟发弹检测与热量，未模拟硬件图传断开或异常超高频物理发弹。",seconds:12,setup(c){c.r.ammo=100;},input(c,t){if(t<=12&&t%2===0)c.log("虚拟发弹检测",!!fireRound(c.match,"r"));},read(c){return [metric("热量",round(c.r.heat),c.r.heatLimit),metric("热量上限",c.r.heatLimit),metric("锁定",c.r.thermalLock==="cooling"?"冷却锁定":c.r.thermalLock==="permanent"?"整局锁定":"未锁定"),metric("允许发弹",yes(canFire(c.match,c.r))),metric("剩余弹量",c.r.ammo)];},question:q("普通超热锁定何时解除？",["低于上限即解除","热量归零后"],1)};
const powerCase=(over:boolean):LabCase=>({id:over?"power-over":"power-normal",title:over?"缓冲耗尽 → 断电 → 恢复":"不超限时的缓冲状态",knowledge:"power",initial:"步兵缓冲能量60 J。",trigger:over?"提交现有虚拟运动系统的超限需求；耗尽后等待5秒。":"提交不超过功率上限的运动需求。",expected:over?"缓冲耗尽且需求仍超限，裁判断电5秒，恢复供电后可继续移动。":"缓冲能量不会因未超限而减少。",limits:"沿用运动系统的估算功率需求，并非实车电流或功率测量。",seconds:10,input(c,t){if(t===0)c.log(over?"开始虚拟超限需求":"开始限内需求");driveSpeed(c.match,c.r,over&&t<40?2:t<40?1:0);},read:powerRead,question:q("缓冲耗尽且仍超限时，断电时长是？",["5秒","永久"],0)});
const economyCase=(local:boolean,coins=800,inCombat=false):LabCase=>({id:local?"economy-local":"economy-remote",title:local?"现场兑换弹量":"远程兑换与延迟到账",knowledge:"economy",initial:"步兵拥有"+coins+"金币，弹量为0；"+(inCombat?"交战":"脱战")+"状态。",trigger:local?"补给区在预设阶段已激活，本次提交现场兑换申请。":"在场外提交远程兑换申请，观察脱战及余额限制。",expected:local?"满足余额等条件时，现场兑换即时扣金币并增加允许发弹量；不足则拒绝。":"脱战且余额足够时立即扣金币，6秒后到账；否则拒绝。",limits:"仅演示裁判资源账户，不表示真实弹仓中的物理弹丸。",seconds:8,setup(c){c.match.sides.red.coins=coins;if(inCombat)c.r.lastCombat=c.match.elapsed;if(local){at(c,"r",zone("red-supply"));advance(c,.1);}},input(c,t){if(t===0)c.log("申请兑换弹量",purchaseAmmo(c.match,"r"));},read(c){const a=ammoOffer(c.match,c.r);return [metric("金币",c.match.sides.red.coins),metric("允许发弹量",c.r.ammo),metric("兑换方式",a.local?"现场":"远程"),metric("单次成本",a.cost),metric("可申请",yes(a.allowed)),metric("待到账",round(Math.max(0,(c.r.pendingAmmoAt??c.match.elapsed)-c.match.elapsed)),6,"秒")];},question:local?q("交战时，已激活己方补给区且满足余额等条件，可以现场兑换吗？",["可以","必须先脱战"],0):q("远程兑换是否立即增加允许发弹量？",["是","否"],1)});
const baseCase=(open:boolean):LabCase=>({id:open?"base-cover":"base-protected",title:open?"堡垒连续激活与基地保护":"开局基地保护",knowledge:"base",initial:open?"比赛已过3分钟；红方已通过真实区域判定取得蓝方前哨控制。":"比赛开始，蓝方完全控制本方前哨阵地，基地护甲未展开。",trigger:open?"红方持续激活蓝方堡垒，等待实际护甲开放事件。":"向裁判输入一次虚拟有效基地接触，观察是否扣血。",expected:open?"满足时间及阵地条件后，连续激活10秒触发护甲展开。":"基地受保护，不发生普通弹丸伤害。",limits:"只演示裁判接触与保护关系；正式基地有效检测面尚未完整绑定。",seconds:open?13:3,setup(c){if(open){at(c,"r",zone("blue-central"));advance(c,10);clock(c,180);at(c,"r2",zone("blue-central"));at(c,"r");}},input(c,t){if(t===0){if(open){at(c,"r",zone("blue-fortress"));c.log("激活对方堡垒");}else c.log("输入虚拟基地接触",damageTarget(c.match,c.r,{type:"base",team:"blue"})>0);}},read(c){const b=c.match.sides.blue;return [metric("蓝方前哨归蓝方完全控制",yes(controlsOutpost(c.match,"blue","blue",true))),metric("堡垒连续激活",round(c.r.fortressHold/10),10,"秒"),metric("护甲展开",yes(b.cover)),metric("护甲动画进度",round(c.match.pose.cover.blue*100),100,"%"),metric("蓝方基地血量",b.base,10000,"HP")];},question:q("仅有对方前哨控制变化就足够展开基地护甲吗？",["足够","不够，还需要满足正式护甲展开条件"],1)});
const runeCase=(large:boolean,success:boolean,ring=10):LabCase=>({id:large?ring===10?"rune-large":"rune-large-low":success?"rune-small":"rune-timeout",title:large?"大能量机关："+(ring===10?"高环数":"低环数")+"示例":success?"小能量机关：成功与失效":"激活超时",knowledge:"rune",initial:large?"比赛已开始180秒，大能量机关可激活。":"小能量机关阶段，拥有一次激活机会。",trigger:success?"提交合法虚拟检测信号，观察组数、实际增益及到期。":"触发激活后不完成检测条件，等待20秒。",expected:success?"仅完成裁判检测要求后产生增益，到期恢复原状态。":"20秒内未成功则回到未激活状态。",limits:"仅输入虚拟裁判检测信号，不提供真实识别、瞄准或发射控制。",seconds:success?75:22,setup(c){if(large)clock(c,180);},input(c,t){if(t===0)c.log("请求激活能量机关",activateRune(c.match,"r"));if(success&&t>=5&&t%5===0){const a=runeStatus(c.match,"red");if(a.active&&a.lit.length){damageTarget(c.match,c.r,{type:"rune",team:"red",arm:a.lit[0],ring});c.log("提交有效虚拟检测");}}},read(c){const a=runeStatus(c.match,"red");return [metric("阶段",a.large?"大能量机关":"小能量机关"),metric("可用次数",a.available),metric("正在激活",yes(a.active)),metric("完成组数",a.groups,5),metric("增益剩余",round(a.buff),60,"秒"),metric("防御增益",a.defense*100,100,"%"),metric("攻击倍率",a.attack),metric("冷却倍率",a.cooling)];},question:q("触发激活请求是否立即获得增益？",["是","否，必须完成检测要求"],1)});
const sentryCase=(enhanced:boolean,semi=false):LabCase=>({id:enhanced?"sentry-enhanced":semi?"sentry-semi":"sentry-switch",title:enhanced?"强化姿态额度与失效":semi?"半自动控制的指令费用":"姿态冷却与指挥手费用",knowledge:"sentry",initial:(semi?"半自动":"自动")+"控制哨兵，开局默认移动姿态。",trigger:enhanced?"切换强化防御并等待15秒，再申请相同强化。":"指挥手切换姿态，1秒后尝试再次切换，5秒后再试。",expected:enhanced?"该姿态强化额度耗尽后自动退出强化，无法再次进入该强化。":"5秒内无法再次切换；自动哨兵的有效指挥手指令扣50金币，半自动不额外收费。",limits:"状态级裁判演示，不模拟自主导航或真实操控系统。",seconds:enhanced?18:8,configure(c){if(semi&&!selectSentryControl(c.match,"s","semi"))throw Error("哨兵初始控制模式无效");},input(c,t){if(t===0)c.log("切换防御姿态",switchSentry(c.match,"s","defense",enhanced,true));if(enhanced&&t===160)c.log("再次进入强化防御",switchSentry(c.match,"s","defense",true,true));if(!enhanced&&(t===10||t===50))c.log("切换移动姿态",switchSentry(c.match,"s","move",false,true));},read(c){const s=sentryStatus(c.match,c.s)!;return [metric("控制方式",s.control==="auto"?"自动":"半自动"),metric("姿态",{attack:"进攻",defense:"防御",move:"移动"}[s.mode]),metric("强化",yes(s.enhanced)),metric("切换冷却",round(s.cooldown),5,"秒"),metric("防御强化剩余额度",round(s.remaining.defense),15,"秒"),metric("金币",c.match.sides.red.coins),metric("功率上限",chassisStatus(c.match,c.s).limit,undefined,"W")];},question:enhanced?q("同一强化姿态的累计额度？",["15秒","无限"],0):q("该控制模式下指挥手有效切换是否收费？",["50金币","免费"],semi?1:0)});
const terrainCase=(valid:boolean):LabCase=>({id:valid?"terrain-road":"terrain-reverse",title:valid?"公路：按序激活":"公路：逆序不生效",knowledge:"terrain",initial:"步兵尚未获取地形跨越增益。",trigger:valid?"先检测低处公路卡，再检测同路线高处卡。":"先检测高处卡，再检测低处卡。",expected:valid?"规定时间内、正确顺序检测获得公路增益与首次经验。":"逆序不满足条件，不获得该跨越增益。",limits:"以原几何卡区输入检测信号，不表示机器人实际跨越能力或RFID测量精度。",seconds:8,input(c,t){if(t===0||t===10){const low={x:5.7,y:.17,z:-5},high={x:5.7,y:.35,z:-5.9};at(c,"r",(t===0)===valid?low:high);c.log(((t===0)===valid?"低":"高")+"处卡检测");}if(t===20)at(c,"r");},read(c){const a=terrainStatus(c.match,c.r);return [metric("防御增益",a.defense*100,100,"%"),metric("经验",c.r.xp),metric("已获得地形类型",c.r.terrain.first.map(k=>k==="road"?"公路":k).join("、")||"无"),metric("公路增益剩余",round(Math.max(0,(c.r.terrain.effects.road?.until??0)/10-c.match.elapsed)),5,"秒")];},question:q("公路跨越是否需要正确的卡检测顺序？",["需要","不需要"],0)});
const radarCase=(accurate:boolean):LabCase=>({id:accurate?"radar-accurate":"radar-error",title:accurate?"持续准确标记与数据中断":"连续误差导致衰减",knowledge:"radar",initial:"对方机器人初始标记进度0。",trigger:accurate?"按5Hz提交准确虚拟坐标报告，3秒后中断。":"先提交准确报告3秒，再提交误差≥1.6m的报告。",expected:"实际标记进度先上涨，错误或中断使其衰减；阈值影响易伤状态。",limits:"使用现有雷达裁判数据接口与合成报告，不实现真实感知、目标识别或战术定位。",seconds:10,setup(c){at(c,"b",outside);},input(c,t){if(t===0)c.log("开始提交合成报告");if(t===30)c.log(accurate?"停止提交报告":"切换为误差报告");},reports(_c,tick){return tick%2===1&&(tick<30||!accurate)?[{team:"red",id:"b",point:tick<30?outside:{x:outside.x+2,z:outside.z}}]:[];},read(c){const a=c.match.radar.red.tracks.b;return [metric("标记进度 P",round(a.progress),150),metric("进度改变量 x",round(a.delta)),metric("易伤",round(radarVulnerability(c.match.radar,"red",c.b,c.match.elapsed)*100),100,"%")];},question:q("数据中断时标记进度是否永久保持？",["保持","按裁判逻辑衰减"],1)});
const dartCase:LabCase={id:"dart-window",title:"闸门开启、开放窗口及冷却",knowledge:"dart",initial:"比赛30秒，拥有一次闸门开启机会。",trigger:"请求开启闸门，观察开启中、开放、关闭及冷却。",expected:"开启期间不能提交发射请求；约7秒后进入30秒窗口，再关闭并冷却。",limits:"仅演示虚拟闸门状态与裁判时间窗，不模拟物理飞行或真实发射控制。",seconds:62,setup(c){clock(c,30);},input(c,t){if(t===0)c.log("申请开启闸门",openDart(c.match,"red"));if(t===10)c.log("开启过程中再次申请",openDart(c.match,"red"));},read(c){const d=dartStatus(c.match,"red");return [metric("闸门状态",{opening:"开启中",open:"已开启",closing:"关闭中",cooldown:"冷却中",closed:"已关闭"}[d.phase]??d.phase),metric("裁判窗口许可",yes(d.canFire)),metric("剩余开启机会",d.available),metric("剩余虚拟飞镖",d.remaining)];},question:q("闸门尚未完全开启，是否具有发射许可？",["具有","不具有"],1)};
const armorCase=(enough:boolean):LabCase=>({id:enough?"armor-ready":"armor-nine",title:enough?"统计满足与强化申请":"命中样本不足",knowledge:"armor",initial:"接近比赛1分钟，双方重装处于补给区免疫；虚拟统计样本"+(enough?"10":"9")+"个。",trigger:"尝试申请一次装甲强化，查看实际资格与统计。",expected:enough?"达到时间和命中数条件后允许申请。":"命中数不足时拒绝申请。",limits:"合成装甲检测样本仅用于展示统计和裁判资格；无真实目标瞄准或装甲定位。",seconds:4,setup(c){at(c,"h",zone("red-supply"));at(c,"bh",zone("blue-supply"));c.r.ammo=100;advance(c,.1);for(let i=0;i<(enough?10:9);i++){if(!fireRound(c.match,"r"))throw Error("统计预设发弹失败");damageTarget(c.match,c.r,{type:"robot",id:"bh"},{x:i%2?.04:.08,y:.05,area:.012});advance(c,1);}clock(c,59);},input(c,t){if(t===0||t===10)c.log("申请强化",fortifyArmor(c.match,"red",{x:.06,y:.05}));},read(c){const a=armorStatus(c.match,"red");return [metric("累计有效统计命中",a.hits),metric("可用强化次数",a.available),metric("允许强化",yes(a.canFortify)),metric("统计准确度",round(armorAccuracy(c.match,"red"))),metric("强化面积比例",round(armorFraction(c.match,"red")*100),100,"%"),metric("已选择强化区域",yes(!!a.center))];},question:q("只有9个累计命中，是否满足强化资格？",["满足","不满足"],1)});
const launcherCase:LabCase={id:"launcher-state",title:"能力解锁、工作台安装与校验",knowledge:"heavy",initial:"比赛已进行299秒，未完成三级装配、双方基地及控制度无差值。",trigger:"尝试在未解锁时安装；达到时间条件后通过工作台安装，观察校验状态。",expected:"裁判先解锁使用权，工作台安装进入待校验；合法虚拟校验后才进入就绪状态。",limits:"状态级虚拟裁判演示，不涉及实际机械装配、武器电路或真实发射操作。",seconds:5,setup(c){clock(c,299);at(c,"h",launcherBench("red").pad);advance(c,.1);},input(c,t){const p=launcherBench("red").pad;if(t===0||t===10)c.log("申请安装",installLauncher(c.match,"h",p));if(t===20)c.log("兑换虚拟允许发弹量",purchaseAmmo(c.match,"h"));if(t===25)c.log("提交虚拟校验检测",!!fireRound(c.match,"h"));},read(c){const s=launcherStatus(c.match,c.h,launcherBench("red").pad);return [metric("使用权状态",{locked:"未解锁",unlocked:"已解锁",test:"待校验",ready:"已就绪"}[s.state]),metric("距离时间解锁",s.unlockIn,undefined,"秒"),metric("允许安装",yes(s.canInstall)),metric("血量上限",c.h.maxHp),metric("热量",c.h.heat)];},question:q("已解锁使用权是否等于完成安装校验？",["等于","不等于"],1)};
const outcomeCase=(kind:"base"|"control"|"damage"|"hp"|"draw",leader:"red"|"blue"="red"):LabCase=>({id:"outcome-"+kind,title:{base:"基地被击毁：提前终局",control:"控制度优先于基地血量",damage:"控制度相同：攻击伤害",hp:"前两项相同：剩余血量",draw:"所有条件相同：平局"}[kind],knowledge:"outcome",initial:(kind==="base"?"比赛已进行200秒；":"比赛剩余2秒，双方基地均存活；")+{base:"预设一方基地刚被裁判记录为0 HP，另一方存活且控制度较低。",control:"领先方累计控制度领先，但基地血量较低。",damage:"控制度相同，领先方攻击伤害较高。",hp:"控制度和攻击伤害相同，领先方剩余总血量较高。",draw:"各项结算指标相同。"}[kind]+(kind==="draw"?"":(kind==="base"?"基地存活方：":"领先方：")+(leader==="red"?"红方":"蓝方")),trigger:kind==="base"?"推进一次裁判时间，检查是否立即结束比赛。":"比赛时钟归零，读取原裁判结算结果。",expected:kind==="base"?"基地被击毁时直接比较基地剩余血量，基地存活方获胜，不再比较控制度。":kind==="draw"?"平局。":"领先方获胜，按规则优先级而非单独比较基地血量。",limits:kind==="base"?"基地0 HP是初始预设，不模拟基地被击毁的物理过程；实际终局由原裁判判定。":"结算前比分是合法情境预设，不伪造结算结果。",seconds:2.1,setup(c){clock(c,kind==="base"?200:418);if(kind==="base"){const other=leader==="red"?"blue":"red";c.match.sides[other].base=0;c.match.sides[other].controlTicks=100;}if(kind==="control"){c.match.sides[leader].controlTicks=100;c.match.sides[leader].base=5000;}if(kind==="damage")c.match.sides[leader].damage=100;if(kind==="hp")(leader==="red"?c.b:c.r).hp=100;},input(c,t){if(t===0)c.log(kind==="base"?"推进裁判结算":"等待比赛时钟归零");},read(c){const m=c.match,hp=(team:string)=>m.robots.filter(r=>r.team===team).reduce((n,r)=>n+r.hp,0);return [metric("控制度（红 / 蓝）",m.sides.red.controlTicks/10+" / "+m.sides.blue.controlTicks/10),metric("攻击伤害（红 / 蓝）",m.sides.red.damage+" / "+m.sides.blue.damage),metric("总剩余血量（红 / 蓝）",hp("red")+" / "+hp("blue")),metric("基地血量（红 / 蓝）",m.sides.red.base+" / "+m.sides.blue.base),metric("结算",m.phase!=="finished"?"未结束":m.winner==="draw"?"平局":m.winner==="red"?"红方胜":"蓝方胜")];},question:q("该情境的裁判结果？",["红方胜","蓝方胜","平局"],kind==="draw"?2:leader==="red"?0:1)});
const crossingCase=(kind:"highland"|"over"|"through"):LabCase=>({
 id:"terrain-"+kind,title:{highland:"高地：低处到高处",over:"跨越隧道：两端检测",through:"穿越隧道：内部检测"}[kind],knowledge:"terrain",
 initial:"步兵无既有跨越增益。",trigger:kind==="highland"?"按顺序提交低处、高处检测信号。":kind==="through"?"依次检测同一隧道入口、内部、出口。":"依次检测同一隧道两端，不检测内部。",
 expected:kind==="through"?"获得穿越隧道冷却增益；首次跨越获得经验。":"获得对应防御增益；首次跨越获得经验。",limits:"几何卡检测信号演示，不表示物理跨越轨迹。",
 seconds:8,input(c,t){const points=kind==="highland"?[{x:5.2,y:.28,z:0},zone("red-central")]:kind==="through"?[{x:-1.5,y:.15,z:-6},{x:-1,y:.15,z:-6},{x:-.3,y:.15,z:-6}]:[{x:-1.5,y:.15,z:-6},{x:-.3,y:.15,z:-6}];if(t%10===0&&t/10<points.length){at(c,"r",points[t/10]);c.log("输入检测点 "+(t/10+1));}if(t===points.length*10)at(c,"r");},
 read(c){const a=terrainStatus(c.match,c.r);return [metric("防御增益",a.defense*100,100,"%"),metric("冷却倍率",a.cooling),metric("经验",c.r.xp),metric("有效跨越增益",a.active.map(k=>({road:"公路",highland:"高地",over:"跨越隧道",through:"穿越隧道"} as Record<string,string>)[k]).join("、")||"无")];},
 question:q("穿越隧道与仅跨越隧道的收益是否相同？",["相同","不同"],1)
});
const xpCase=(unlocked:boolean):LabCase=>({id:unlocked?"xp-unlocked":"xp-cap",title:unlocked?"二级科技提高经验上限":"经验封顶",knowledge:"xp",initial:"步兵经验2199；"+(unlocked?"已由真实裁判完成一级和二级装配。":"尚未完成科技装配。"),trigger:"提交相同的虚拟经验事件，对比经验积累与等级上限。",expected:unlocked?"等级上限为7，经验可继续超过2200。":"经验达到2200后不再增加；科技装配未提高上限前不能继续积累。",limits:"2199经验为合法教学预设，后续经验、等级由原裁判结算。",seconds:5,setup(c){if(unlocked){completePrior(c,1);completePrior(c,2);}c.r.xp=2199;c.r.ammo=20;},input(c,t){if(t%10===0)c.log("虚拟经验事件",!!fireRound(c.match,"r"));},read(c){return [metric("步兵经验",c.r.xp),metric("步兵等级",robotLevel(c.r,c.match),10),metric("步兵等级上限",assemblyStatus(c.match,c.h,assembly).cap,10),metric("科技等级",technologyLevel(c.match,"red"),4)];},question:q("到达当前等级上限后是否还会继续获得经验？",["会","不会"],1)});
const fortressCase=(enabled:boolean):LabCase=>({id:enabled?"fortress-enabled":"fortress-disabled",title:enabled?"前哨失控后的堡垒增益":"前哨仍受控时堡垒不生效",knowledge:"fortress",initial:"红方基地5000 HP，"+(enabled?"蓝方已取得红方前哨临时控制。":"红方仍控制本方前哨阵地。"),trigger:"红方步兵进入本方堡垒区，观察增益及共享储备。",expected:enabled?"首个符合条件的本方机器人获得堡垒防御及储备弹量。":"本方前哨仍受控时，不获得堡垒专属增益。",limits:"基地血量及历史最低血量是教学预设；区域检测为原几何信号。",seconds:4,setup(c){c.match.sides.red.base=5000;c.match.sides.red.baseLow=5000;if(enabled){at(c,"b",zone("red-central"));advance(c,5);}},input(c,t){if(t===0){at(c,"r",zone("red-fortress"));c.log("激活己方堡垒");}},read(c){return [metric("前哨仍由本方控制",yes(controlsOutpost(c.match,"red","red"))),metric("堡垒专属受益者",yes(c.match.sides.red.fortressHolder==="r")),metric("防御增益",round((1-robotDefense(c.match,c.r,false))*100),100,"%"),metric("可用储备弹量",reserveAmmo(c.match,c.r))];},question:q("己方前哨仍由己方控制时，堡垒专属增益生效吗？",["生效","不生效"],1)});
export const LAB_TOPICS:readonly LabTopic[]=[
 {title:"阵地控制与前哨",keywords:"基地 中央 高地 占领 临时 完全 争夺 回退 重建",cases:[territoryCase("capture"),territoryCase("contest"),territoryCase("interrupt"),territoryCase("rebuild")]},
 {title:"基地保护与堡垒",keywords:"基地 前哨 堡垒 护甲 区域",cases:[baseCase(false),baseCase(true),fortressCase(false),fortressCase(true)]},
 {title:"回血与后勤",keywords:"步兵 重装 补给 前哨 基地 血量",cases:[healingCase("heal-supply","补给区基础回血",10000,"supply"),healingCase("heal-low-base","基地受损时的回血",5000,"supply"),healingCase("heal-late","4分钟后脱战回血",10000,"supply",240),healingCase("heal-outpost","完全控制的前哨回血",10000,"outpost"),healingCase("heal-remote","远程兑换回血",10000,"remote"),healingCase("heal-denied","交战时远程兑换被拒",10000,"remote",20,true),healingCase("heal-forfeit","到账前战亡",10000,"remote",20,false,true)]},
 {title:"战亡与复活",keywords:"血量 虚弱 免疫 补给 基地 金币 步兵",cases:[reviveCase(false,false),reviveCase(false,true),reviveCase(true,false)]},
 {title:"热量与冷却",keywords:"步兵 热量 发弹量 裁判 锁定",cases:[heatCase]},
 {title:"底盘功率",keywords:"步兵 缓冲 能量 断电",cases:[powerCase(false),powerCase(true)]},
 {title:"金币与资源",keywords:"经济 经验 等级 允许发弹量 兑换 补给",cases:[economyCase(true),economyCase(false),xpCase(false),xpCase(true)]},
 {title:"科技核心与能量单元",keywords:"重装 装配 科技 金币 等级 经验",cases:[techCase(1),techCase(2),techCase(3),techCase(4),techCase(1,"repeat"),techCase(2,"early"),techCase(3,"missing"),techCase(1,"cancel"),techCase(4,"timeout")]},
 {title:"重装能力状态",keywords:"重装 科技 工作台 补给 解锁",cases:[launcherCase]},
 {title:"能量机关",keywords:"大小能量机关 增益 超时 环数",cases:[runeCase(false,true),runeCase(false,false),runeCase(true,true),runeCase(true,true,3)]},
 {title:"自适应装甲",keywords:"命中 统计 准确度 强化",cases:[armorCase(false),armorCase(true)]},
 {title:"哨兵姿态",keywords:"哨兵 自动 半自动 指挥手 强化",cases:[sentryCase(false),sentryCase(false,true),sentryCase(true)]},
 {title:"地形跨越",keywords:"公路 高地 隧道 区域 增益 经验",cases:[terrainCase(true),terrainCase(false),crossingCase("highland"),crossingCase("over"),crossingCase("through")]},
 {title:"雷达与飞镖",keywords:"特殊系统 标记 飞镖 闸门 雷达",cases:[radarCase(true),radarCase(false),dartCase]},
 {title:"比赛结算",keywords:"基地 控制度 伤害 血量 胜负",cases:[outcomeCase("control"),outcomeCase("damage"),outcomeCase("hp"),outcomeCase("draw")]},
];
export const LAB_CASES=LAB_TOPICS.flatMap(t=>t.cases);
export type LabCondition={label:string;options:readonly {value:string;label:string}[];initial:string};
export type LabExperiment={fields:readonly LabCondition[];create:(values:readonly string[])=>LabCase};
const condition=(label:string,initial:string,options:readonly [string,string][]):LabCondition=>({label,initial,options:options.map(([value,label])=>({value,label}))});
const baseHp=condition("己方基地血量","10000",[["10000","10000 HP"],["5000","5000 HP"],["3000","3000 HP"]]);
const combat=condition("初始交战状态","safe",[["safe","脱战"],["combat","交战"]]);
const balance=condition("初始金币","800",[["800","800"],["0","0"]]);
export function labExperiment(demo:LabCase):LabExperiment|undefined{
  const keep=(c:LabCase)=>({...c,id:demo.id,title:demo.title});
  switch(demo.id){
    case "heal-supply":return {fields:[baseHp,condition("恢复位置","supply",[["supply","补给区"],["outpost","己方完全控制的前哨"],["remote","远程兑换"]]),condition("比赛阶段","0",[["0","开局"],["240","4分钟后"]]),combat],create:([base,method,time,combat])=>keep(healingCase(demo.id,demo.title,Number(base),method as "supply"|"outpost"|"remote",Number(time),combat==="combat",false,100))};
    case "revive-read":return {fields:[baseHp,condition("复活方式","read",[["read","等待并确认读条"],["paid","金币立即复活"]]),balance],create:([base,mode,coins])=>keep(reviveCase(mode==="paid",base==="3000",Number(coins),Number(base)))};
    case "economy-local":return {fields:[condition("兑换方式","local",[["local","现场"],["remote","远程"]]),balance,combat],create:([mode,coins,combat])=>keep(economyCase(mode==="local",Number(coins),combat==="combat"))};
    case "tech-2-first":return {fields:[condition("比赛已进行","60",[["30","30秒"],["60","60秒"]]),condition("一级装配","yes",[["yes","已完成"],["no","未完成"]]),condition("能量单元","1",[["1","1枚"],["0","0枚"]])],create:([elapsed,prior,units])=>keep(techCase(2,"first",{elapsed:Number(elapsed),prior:prior==="yes",units:Number(units)}))};
    case "outcome-control":return {fields:[condition("领先条件","control",[["base","对方基地已被击毁"],["control","仅控制度领先"],["damage","仅攻击伤害领先"],["hp","仅机器人血量领先"],["draw","全部相同"]]),condition("优势方","red",[["red","红方"],["blue","蓝方"]])],create:([kind,team])=>keep(outcomeCase(kind as "base"|"control"|"damage"|"hp"|"draw",team as "red"|"blue"))};
  }
}

export type LabPresentation={kind:"space"|"process"|"number";focus:readonly string[]};
const presentations:Partial<Record<KnowledgeId,LabPresentation>>={
 territory:{kind:"space",focus:["蓝方前哨阵地","占领 / 恢复进度","双方争夺"]},
 outpost:{kind:"space",focus:["前哨所属","蓝方前哨血量","蓝方前哨阵地"]},
 base:{kind:"space",focus:["蓝方前哨归蓝方完全控制","堡垒连续激活","护甲展开","蓝方基地血量"]},
 fortress:{kind:"space",focus:["前哨仍由本方控制","堡垒专属受益者","防御增益","可用储备弹量"]},
 supply:{kind:"space",focus:["红方步兵血量","己方基地血量","补给区生效"]},
 recovery:{kind:"number",focus:["红方步兵血量","远程兑换等待","金币","可远程兑换","前哨回血条件"]},
 revival:{kind:"process",focus:["步兵血量","复活读条","虚弱","免疫","功率上限"]},
 heat:{kind:"number",focus:["热量","锁定","热量上限"]},
 power:{kind:"number",focus:["缓冲能量","断电剩余","虚拟需求","功率上限"]},
 economy:{kind:"process",focus:["兑换方式","允许发弹量","金币","待到账","可申请"]},
 xp:{kind:"number",focus:["步兵经验","步兵等级","步兵等级上限"]},
 assembly:{kind:"process",focus:["可选等级","当前装配","科技等级","每10秒金币收益","团队防御增益","失败原因"]},
 heavy:{kind:"process",focus:["使用权状态","允许安装","距离时间解锁"]},
 rune:{kind:"process",focus:["正在激活","完成组数","增益剩余","防御增益","攻击倍率","冷却倍率"]},
 armor:{kind:"number",focus:["累计有效统计命中","允许强化","强化面积比例","已选择强化区域"]},
 sentry:{kind:"process",focus:["控制方式","姿态","强化","切换冷却","防御强化剩余额度","金币"]},
 terrain:{kind:"space",focus:["防御增益","冷却倍率","经验","公路增益剩余"]},
 radar:{kind:"number",focus:["标记进度 P","易伤","进度改变量 x"]},
 dart:{kind:"process",focus:["闸门状态","裁判窗口许可","剩余开启机会"]},
 outcome:{kind:"process",focus:["控制度（红 / 蓝）","攻击伤害（红 / 蓝）","总剩余血量（红 / 蓝）","结算"]},
};
export function labPresentation(demo:LabCase):LabPresentation{
  if(demo.id==="heal-outpost"||demo.id==="heal-supply"&&demo.knowledge==="recovery"&&demo.trigger.includes("前哨"))return {kind:"space",focus:["红方步兵血量","前哨回血条件","己方基地血量"]};
  if(demo.id==="base-protected")return {kind:"number",focus:["蓝方前哨归蓝方完全控制","蓝方基地血量"]};
  return presentations[demo.knowledge]??{kind:"number",focus:[]};
}
export const LAB_VERSION=1;
export const labProgressId=(c:LabCase)=>"lab-"+c.id;
export function relatedLabs(id:KnowledgeId){
  const keys:Partial<Record<KnowledgeId,KnowledgeId[]>>={base:["territory","outcome","supply","recovery","revival","fortress"],outpost:["territory","base","recovery","revival","fortress"],central:["territory","terrain"],fortress:["base","territory"],highpoint:["terrain","economy","xp"],supply:["recovery","revival","economy","heavy"],energy:["assembly"],heavy:["assembly","supply","power"],infantry:["heat","power","economy","xp","recovery","revival","terrain"],sentry:["recovery","revival","power"],systems:["radar","dart"],lineup:["heavy","sentry","radar","dart"],flow:["outcome"]};
  return LAB_CASES.filter(c=>c.knowledge===id||keys[id]?.includes(c.knowledge));
}
export function buildLabTrace(demo:LabCase):LabTrace{
  const match=createMatch(roster,1,1,spawns,sockets,2061),[r,b,h,s]=match.robots;
  const positions=new Map<string,ArenaPosition>(),events:MatchEvent[]=[],inputs:InputEvent[]=[],frames:LabFrame[]=[];
  const c:Context={match,positions,r,b,h,s,log:(label,accepted)=>inputs.push({at:match.elapsed,label,accepted})};
  const setupEvents:MatchEvent[]=[];
  match.onEvent=e=>setupEvents.push(e);
  demo.configure?.(c);startMatch(match);demo.setup?.(c);
  inputs.length=0;
  match.onEvent=e=>events.push(e);
  const capture=()=>frames.push({time:round(match.elapsed),metrics:demo.read(c),eventCount:events.length,inputCount:inputs.length,contacts:[...positions].map(([id,position])=>{const zones=zonesAtPosition(position);return {id,position:{...position},zones,crossings:crossingContacts(position,zones)};})});
  capture();
  for(let tick=0;tick<Math.round(demo.seconds*10)&&match.phase==="running";tick++){
    demo.input?.(c,tick);
    updateMatch(match,.1,positions,demo.reports?()=>demo.reports!(c,tick):undefined);
    capture();
  }
  return {frames,events,inputs,setupEvents};
}
