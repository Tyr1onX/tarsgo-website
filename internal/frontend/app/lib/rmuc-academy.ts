import { GROUND_LINEUP, GROUND_NAMES, SYSTEM_NAMES } from "./rmuc-3d-identity.ts";
import { MATCH_DURATION } from "./rmuc-3d-match.ts";

export const RULE_VERSION = "RMUC 2027 V1.0.0";
export const RULE_SOURCE = "https://bbs.robomaster.com/wiki/20204847/1969149?source=7";

type Knowledge = {title:string;summary:string;detail:string;reference:string;boundary?:string};
export const KNOWLEDGE = {
  lineup:{title:"正式阵容",summary:GROUND_LINEUP.map(r=>r.number+"号 "+GROUND_NAMES[r.kind]).join("、")+"；"+Object.values(SYSTEM_NAMES).join("、")+"。",detail:"每方主力地面机器人四台；空中系统包括一座机库和四台空中机器人。首局最低上场阵容为三台地面机器人。",reference:"§3 表3-1、表3-2，印刷页20–21",boundary:"机器人外观沿用历史展示资产，并非2027实车模型。空中机器人仅作虚拟展示，部分裁判机制未实现。"},
  heavy:{title:"重装机器人",summary:"通过能量单元装配取得科技与团队收益。",detail:"装配难度受比赛时间及此前完成等级限制。",reference:"§3.1.1，印刷页22；§5.4.3，印刷页80–88"},
  infantry:{title:"步兵机器人",summary:"每方两台步兵，具有独立的比赛状态和等级。",detail:"等级、血量、功率及资源等状态由裁判规则决定；不能用一台机器人的血量代替全队比赛结果。",reference:"表3-1，印刷页20；§5.8，印刷页114–115"},
  sentry:{title:"哨兵机器人",summary:"每方一台7号哨兵。",detail:"其正式阵容不配置独立操作手，与步兵角色不同。",reference:"表3-1、表3-2，印刷页20–21"},
  systems:{title:"特殊系统",summary:"空中、飞镖与雷达均属于正式阵容。",detail:"空中系统配置机库与四台空中机器人。",reference:"表3-1，印刷页20",boundary:"部分空中、硬件检测、人工判罚机制未完整模拟。"},
  flow:{title:"比赛流程",summary:"准备3分钟 → 裁判系统自检15秒 → 5秒倒计时 → 正式比赛"+MATCH_DURATION/60+"分钟。",detail:"赛前检录、现场裁判判罚和赛后确认也是正式赛事的一部分。",reference:"§6 图6-1，印刷页116；§6.3–6.6",boundary:"模拟器使用3秒虚拟启动倒计时，不复现完整正式准备与自检过程。"},
  outcome:{title:"胜负判定",summary:"基地被击毁时，比较基地剩余血量；双方基地存活且时间耗尽时，依次比较控制度、全队攻击伤害、全队存活机器人总剩余血量。",detail:"上述条件均相同则判平局。BO3、BO5出现平局时增加一局。基地未被击毁时，不能直接以基地剩余血量判胜。",reference:"§5.8，印刷页114–115",boundary:"基地有效检测面未完整绑定，正式人工判罚不完整；情境判断依据官方规则。"},
  base:{title:"基地",summary:"基地关系到提前结束及胜负判定；基地增益点与堡垒增益点共同构成基地阵地。",detail:"初始拥有方才可完全控制本方基地阵地；己方地面机器人激活己方基地增益点，获得50%防御增益，可兑换弹量并解除虚弱。",reference:"§5.6.2、§5.6.4.2、§5.8，印刷页96–97、105、114–115",boundary:"六块有效检测面尚未完整绑定。"},
  outpost:{title:"前哨站",summary:"前哨站增益点与中央高地增益点共同构成前哨阵地。",detail:"激活己方完全控制的前哨阵地对应前哨站增益点可获得回血增益、兑换弹量并解除虚弱。建筑与阵地控制权不是同一状态。",reference:"§5.3.1、§5.6.2、§5.6.4.6，印刷页73、96–97、106"},
  central:{title:"中央高地",summary:"中央高地增益点参与前哨阵地控制。",detail:"初始双方完全控制己方阵地；连续激活、双方争夺与占领进度受§5.6.2约束。重装、步兵及哨兵激活中央高地增益点获得25%防御增益。",reference:"§4.3.2、§5.6.2、§5.6.4.4，印刷页50、96–97、105"},
  fortress:{title:"堡垒",summary:"堡垒增益点是基地阵地的一部分。",detail:"己方前哨阵地失去控制时，堡垒增益点开放；己方首个激活的机器人获得50%防御增益，并按基地历史最低血量获得冷却及储备弹量收益。",reference:"§4.2.7、§5.6.2、§5.6.4.9，印刷页48、96–97、107"},
  highpoint:{title:"制高点",summary:"双方半场设有制高点，属于场地增益区域。",detail:"己方机器人激活己方制高点增益点，获得50%防御增益并可现场兑换弹量。",reference:"图4-4、§5.6.4.3，印刷页31、105",boundary:"虚拟区域为几何近似，不代表实物RFID覆盖精度。"},
  territory:{title:"阵地控制与控制度",summary:"同时控制两个前哨阵地每秒增加1控制度，同时控制两个基地阵地每秒增加3控制度。",detail:"控制关系不是简单的占据中心点。双方争夺时进度暂停；未连续激活满5秒时中断，已有进度逐渐回退。",reference:"§5.6.2，印刷页96–97",boundary:"虚拟区域边界为CAD几何近似。"},
  supply:{title:"补给区回血",summary:"存活地面机器人激活己方补给区，可获得回血增益。",detail:"通常每秒恢复上限血量的10%；比赛开始4分钟后，脱战状态提高到25%。实际恢复还受基地血量决定的后勤系数影响。正式激活依据场地交互模块或规定区域内视觉标签等条件；己方补给区还支持弹量兑换，重装激活时获得免疫。",reference:"§4.2.6、§5.3.1、§5.6.4.8，印刷页44–47、73、107",boundary:"仿真以几何区域近似正式检测，不要求达到区域中心。"},
  recovery:{title:"其他恢复机制",summary:"前哨回血、远程兑换血量和复活不是同一种机制。",detail:"完全控制的前哨阵地对应增益点回血速率为补给区的一半；脱战远程兑换在6秒后恢复上限血量的60%，不超过血量上限，期间战亡则无效且金币不退。回血还受后勤系数影响。异常离线、被判罚下场等情况另按正式规则执行。",reference:"§5.3.1–5.3.2，印刷页73–74"},
  assembly:{title:"科技装配区",summary:"重装机器人激活装配区增益点后，选择允许的装配等级。",detail:"一级开始即可选择；二、三、四级分别在1、2、3分钟后开放，并须先完成前一级。一级须等待科技核心就绪，再完成插入与确认。",reference:"§4.3.2.1、§5.4.3 表5-10、表5-11，印刷页51、82–83、85–88",boundary:"虚拟装配以操作步骤代替机械机构的真实操作精度。"},
  energy:{title:"能量单元与科技核心",summary:"重装机器人携带能量单元并在科技核心完成装配，取得团队收益。",detail:"首次一级装配使重装机器人升至5级，每10秒获得40金币；重复一级每10秒额外获得4金币。二级解锁7级上限，三级解锁10级上限及进一步增益。",reference:"§5.4.3 表5-12，印刷页83",boundary:"收益由原裁判状态结算，教学不得直接设置成功。"},
  rune:{title:"能量机关",summary:"己方能量机关成功激活后为己方提供增益。",detail:"比赛开始前3分钟为小能量机关阶段，之后为大能量机关阶段。",reference:"§5.6.3，印刷页97起"},
} satisfies Record<string,Knowledge>;
export type KnowledgeId = keyof typeof KNOWLEDGE;
export type Question={knowledge:KnowledgeId;prompt:string;options:readonly string[];answer:number;explanation:string};
export type Course={id:string;version:number;title:string;knowledge:readonly KnowledgeId[];questions:readonly Question[];practice?:"observe"|"controls"|"heal"|"assembly"};
const question=(knowledge:KnowledgeId,prompt:string,options:readonly string[],answer:number,explanation:string):Question=>({knowledge,prompt,options,answer,explanation});
const lineup=question("lineup","每方正式主力地面机器人是哪一组？",["重装、工程、步兵、哨兵","重装×1、步兵×2、哨兵×1","步兵×4"],1,"2027主力阵容包含一台重装、两台步兵和一台哨兵。");
const outcome=question("outcome","时间耗尽，双方基地均存活，红方控制度更高，但蓝方基地血量更高。谁胜？",["蓝方","平局","红方"],2,"双方基地均存活时，优先比较累计控制度。");
const supply=question("supply","低血量存活地面机器人进入并激活己方补给区，通常会怎样？",["获得回血增益，受后勤系数影响","立即恢复全部血量","必须到达区域中心才回血"],0,"激活己方补给区增益点才是正式条件，不要求中心点。");
const assembly=question("assembly","一级装配已选择且核心就绪，插入能量单元后还必须做什么？",["等待比赛结束","确认装配","完成二级平移"],1,"一级的正式步骤为选择、插入和确认。");
export const COURSES:readonly Course[]=[
  {id:"field",version:1,title:"认识机器人与场地",practice:"observe",knowledge:["lineup","heavy","infantry","sentry","systems","base","outpost","supply","central","assembly"],questions:[lineup,question("outpost","前哨阵地由哪些增益点构成？",["前哨站和中央高地","基地和堡垒","补给区和制高点"],0,"前哨阵地由前哨站与中央高地增益点构成。")]},
  {id:"match",version:1,title:"比赛流程与胜负判定",knowledge:["flow","outcome","territory"],questions:[question("flow","正式比赛阶段时长是多少？",["3分钟","7分钟","15秒"],1,"正式比赛阶段为七分钟，准备和自检是不同阶段。"),outcome,question("outcome","双方基地存活、控制度相同，红方全队攻击伤害高，蓝方存活机器人总血量高。谁胜？",["红方","蓝方","平局"],0,"攻击伤害优先于存活机器人总剩余血量。")]},
  {id:"controls",version:1,title:"基础操作",practice:"controls",knowledge:[],questions:[]},
  {id:"recovery",version:1,title:"血量与补给",practice:"heal",knowledge:["supply","recovery"],questions:[supply,question("recovery","远程兑换血量后、实际到账前战亡，结果是什么？",["仍正常回血","返还金币","兑换无效且金币不退"],2,"六秒内战亡则兑换无效，金币不退。")]},
  {id:"technology",version:1,title:"科技核心与装配",practice:"assembly",knowledge:["assembly","energy"],questions:[assembly,question("energy","首次完成一级装配的收益包含什么？",["重装升至5级及持续金币收益","立即取得最高科技","直接结束比赛"],0,"一级首次完成提升重装等级并带来每10秒40金币收益。")]},
  {id:"situations",version:1,title:"综合规则判断",knowledge:[],questions:[lineup,outcome,supply,assembly,question("territory","双方争夺同一阵地时，占领进度如何变化？",["持续向红方增长","暂停","立即归零"],1,"双方争夺同一阵地时，占领进度暂停。"),question("assembly","比赛开始2分钟，尚未完成一级装配，能直接选择三级吗？",["不能","可以","只要金币足够"],0,"必须先完成前一等级，时间不是唯一条件。")]},
];
export function knowledgeForObject(id:string):KnowledgeId|undefined {
  const kind=id.replace(/^(red|blue)-/,"");
  if(kind==="base"||kind==="fortress"||kind==="central"||kind==="outpost"||kind==="supply"||kind==="highpoint"||kind==="assembly"||kind==="rune"||kind==="energy")return kind;
  const robot=kind.match(/^(?:2027-)?(heavy|infantry|sentry)-/);
  if(robot)return robot[1] as KnowledgeId;
  if(kind==="core")return "energy";
  if(["air","dart","radar"].includes(kind))return "systems";
}
