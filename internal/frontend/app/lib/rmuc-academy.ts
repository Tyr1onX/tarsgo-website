import { GROUND_LINEUP, GROUND_NAMES, SYSTEM_NAMES } from "./rmuc-3d-identity.ts";
import { MATCH_DURATION } from "./rmuc-3d-match.ts";

export const RULE_VERSION = "RMUC 2027 V1.0.0";
export const RULE_SOURCE = "https://bbs.robomaster.com/wiki/20204847/1969149?source=7";

type Knowledge = {title:string;summary:string;detail:string;reference:string;boundary?:string};
export const KNOWLEDGE = {
  lineup:{title:"正式阵容",summary:GROUND_LINEUP.map(r=>r.number+"号 "+GROUND_NAMES[r.kind]).join("、")+"；"+Object.values(SYSTEM_NAMES).join("、")+"。",detail:"每方主力地面机器人四台；空中系统包括一座机库和四台空中机器人。首局最低上场阵容为三台地面机器人。",reference:"§3 表3-1、表3-2，印刷页20–21",boundary:"机器人外观沿用历史展示资产，并非2027实车模型。空中机器人仅作虚拟展示，部分裁判机制未实现。"},
  heavy:{title:"重装机器人",summary:"通过能量单元装配取得科技与团队收益。",detail:"装配难度受比赛时间及此前完成等级限制。三级装配或规则规定的比赛时间条件解锁能力使用权；之后还须在工作台完成合法安装与裁判校验，不能把使用权解锁等同于就绪。",reference:"§3.1.1，印刷页22；§5.4.3、§5.7.1，印刷页80–88、108"},
  infantry:{title:"步兵机器人",summary:"每方两台步兵，具有独立的比赛状态和等级。",detail:"等级、血量、功率及资源等状态由裁判规则决定；不能用一台机器人的血量代替全队比赛结果。",reference:"表3-1，印刷页20；§5.8，印刷页114–115"},
  sentry:{title:"哨兵机器人",summary:"每方一台7号哨兵。",detail:"自动或半自动控制在赛前选择；自动哨兵的有效指挥手指令另收50金币。姿态切换冷却5秒；同种强化姿态累计最多15秒，普通姿态累计超过3分钟后效果下降。",reference:"表3-1、表3-2；§5.7.2 表5-28，印刷页20–21、108–110"},
  systems:{title:"特殊系统",summary:"空中、飞镖与雷达均属于正式阵容。",detail:"空中系统配置机库与四台空中机器人。",reference:"表3-1，印刷页20",boundary:"部分空中、硬件检测、人工判罚机制未完整模拟。"},
  flow:{title:"比赛流程",summary:"准备3分钟 → 裁判系统自检15秒 → 5秒倒计时 → 正式比赛"+MATCH_DURATION/60+"分钟。",detail:"赛前检录、现场裁判判罚和赛后确认也是正式赛事的一部分。",reference:"§6 图6-1，印刷页116；§6.3–6.6",boundary:"模拟器使用3秒虚拟启动倒计时，不复现完整正式准备与自检过程。"},
  outcome:{title:"胜负判定",summary:"基地被击毁时，比较基地剩余血量；双方基地存活且时间耗尽时，依次比较控制度、全队攻击伤害、全队存活机器人总剩余血量。",detail:"上述条件均相同则判平局。BO3、BO5出现平局时增加一局。基地未被击毁时，不能直接以基地剩余血量判胜。",reference:"§5.8，印刷页114–115",boundary:"基地有效检测面未完整绑定，正式人工判罚不完整；情境判断依据官方规则。"},
  base:{title:"基地",summary:"基地关系到提前结束及胜负判定；基地增益点与堡垒增益点共同构成基地阵地。",detail:"本方完全控制本方前哨阵地时基地获得100%防御增益；护甲展开另有条件。基地增益点支持本方防御、弹量兑换及解除虚弱。",reference:"§5.6.1–2、§5.6.4.2、§5.8，印刷页94–97、105、114–115",boundary:"六块有效检测面尚未完整绑定。"},
  outpost:{title:"前哨站",summary:"前哨站增益点与中央高地增益点共同构成前哨阵地。",detail:"激活己方完全控制的前哨阵地对应前哨站增益点可获得回血增益、兑换弹量并解除虚弱。建筑归属与阵地控制权相互独立。前哨初始1000 HP；临时占领不改变建筑归属。击毁完全控制阵地上的前哨站，使原控制方转为临时控制且建筑血量归零；若已由进攻方临时控制，击毁可直接转为进攻方完全控制。被毁前哨在阵地转为另一方完全控制时重建为其建筑，恢复500 HP；初次摧毁、对方基地护甲展开或比赛满3分钟时，前哨停止旋转，本局不再恢复旋转。",reference:"§5.3.1、§5.6.1–2、§5.6.4.6，印刷页73、94–97、106"},
  central:{title:"中央高地",summary:"中央高地增益点参与前哨阵地控制。",detail:"初始双方完全控制己方阵地；连续激活、双方争夺与占领进度受§5.6.2约束。重装、步兵及哨兵激活中央高地增益点获得25%防御增益。",reference:"§4.3.2、§5.6.2、§5.6.4.4，印刷页50、96–97、105"},
  fortress:{title:"堡垒",summary:"堡垒增益点是基地阵地的一部分。",detail:"己方前哨阵地失去控制时，堡垒增益点开放；己方首个激活的机器人获得50%防御增益，并按基地历史最低血量获得冷却及储备弹量收益。比赛3分钟后且控制对方前哨阵地，才可激活对方堡垒；连续10秒触发护甲展开，短时中断有3秒进度保留窗口；护甲展开前激活对方堡垒的机器人具有100%易伤。",reference:"§4.2.7、§5.6.2、§5.6.4.9，印刷页48、96–97、107"},
  highpoint:{title:"制高点",summary:"双方半场设有制高点，属于场地增益区域。",detail:"己方机器人激活己方制高点增益点，获得50%防御增益并可现场兑换弹量。",reference:"图4-4、§5.6.4.3，印刷页31、105",boundary:"虚拟区域为几何近似，不代表实物RFID覆盖精度。"},
  territory:{title:"阵地控制与控制度",summary:"同时控制两个前哨阵地每秒增加1控制度，同时控制两个基地阵地每秒增加3控制度。",detail:"开局双方分别完全控制己方阵地。对方完全控制时，己方连续激活阵地内任一增益点满5秒可取得临时控制；临时控制方连续5秒不再激活该阵地内任一增益点，可转为另一方完全控制。双方同时激活同一阵地内的增益点时进度暂停；未满5秒的占领中断时进度等速回退。前哨站击毁与重建另有控制转换规则。",reference:"§5.6.2、§5.6.4.1，印刷页96–97、102；答疑#67、#85、#121、#188、#192、#208、#443",boundary:"虚拟区域为CAD几何近似；正式激活依据场地交互模块检测，激活状态失效有2秒延迟。增益效果失效不等于无法激活或争夺。"},
  supply:{title:"补给区回血",summary:"存活地面机器人激活己方补给区，可获得回血增益。",detail:"通常每秒恢复上限血量的10%；比赛开始4分钟后，脱战状态提高到25%。实际恢复还受基地血量决定的后勤系数影响（基地损失越多，恢复量越小）；同时满足多种回血增益时，现有裁判取最大效果。正式激活依据场地交互模块或规定区域内视觉标签等条件；己方补给区还支持弹量兑换，重装激活时获得免疫。",reference:"§4.2.6、§5.3.1、§5.6.4.8，印刷页44–47、73、107",boundary:"仿真以几何区域近似正式检测，不要求达到区域中心。"},
  recovery:{title:"其他恢复机制",summary:"前哨回血、远程兑换血量和复活不是同一种机制。",detail:"完全控制的前哨阵地对应增益点回血速率为补给区的一半；脱战远程兑换在6秒后恢复上限血量的60%乘以后勤系数，不超过血量上限，期间战亡则无效且金币不退。回血还受后勤系数影响。异常离线、被判罚下场等情况另按正式规则执行。",reference:"§5.3.1–5.3.2，印刷页73–74"},
  assembly:{title:"科技装配区",summary:"重装机器人激活装配区增益点后，选择允许的装配等级。",detail:"一级开始即可选择；二、三、四级分别在1、2、3分钟后开放，并须先完成前一级。一级须等待科技核心就绪，再完成插入与确认；二级增加平移，三级增加旋转等要求。四级涉及双方科技核心、两枚能量单元和双核心步骤限制，核心到位后45秒内完成；另一方装配可能阻止四级选择。离开装配区超过规则允许的保留时间或动作超时会取消流程。装配过程中激活装配区的免疫累计上限为45秒，最高已成功装配等级增加时刷新。",reference:"§4.3.2.1、§5.4.3、§5.6.4.7，印刷页51、82–83、85–88、106",boundary:"虚拟装配以操作步骤代替机械机构的真实操作精度。"},
  energy:{title:"能量单元与科技核心",summary:"重装机器人携带能量单元并在科技核心完成装配，取得团队收益。",detail:"首次一级装配使重装机器人升至5级，每10秒获得40金币；重复一级每10秒额外获得4金币。首次二级使重装升至7级、步兵上限7级，每10秒额外20金币；首次三级使重装及步兵上限达10级、团队获得25%防御增益及能力解锁，每10秒额外20金币。首次四级团队防御增益提高至50%，每10秒额外40金币，四级只允许完成一次。重复二、三级分别额外增加8、12金币/10秒。",reference:"§5.4.3 表5-12，印刷页83",boundary:"收益由原裁判状态结算，教学不得直接设置成功。"},
  rune:{title:"能量机关",summary:"己方能量机关成功激活后为己方提供增益。",detail:"比赛开始前3分钟为小能量机关阶段，成功后获得45秒25%防御增益及有限经验奖励。大能量机关按平均环数与激活灯臂数确定增益种类和持续时间。每次激活尝试总窗口20秒；组内窗口2.5秒，大能量机关第二灯臂另有1秒窗口。超时或不符合条件可使进度重置。",reference:"§5.6.3、表5-22至5-24，印刷页97–101"},
  heat:{title:"热量与冷却",summary:"普通超热量锁定必须等热量降至0才解除。",detail:"裁判每100ms结算冷却。超过热量上限进入冷却锁定；图5-1以 Q1≥Q2 判定整局锁定；当前裁判遵循该图的等号边界（正文使用 Q1>Q2）。普通超热还会导致正式图传断开，小地图等不受影响。",reference:"§5.1.3、图5-1，印刷页66–67",boundary:"虚拟发弹遵守裁判锁定；不模拟硬件异常发弹及图传断开。"},
  power:{title:"底盘功率与缓冲",summary:"超限消耗60J缓冲能量；耗尽且仍超限时断电5秒。",detail:"10Hz检测，限内运行可恢复缓冲能量，最高60J。恢复供电与缓冲状态由裁判结算。",reference:"§5.1.4、图5-2，印刷页67–68",boundary:"虚拟运动需求为估算值，不是电机电流测量。"},
  economy:{title:"金币与允许发弹量",summary:"现场兑换与远程兑换具有不同费用、数量与到账时机。",detail:"远程兑换要求脱战，确定后等待6秒；允许发弹量还受累计购买限制。科技装配可带来周期金币收益，经验和等级上限属于另一套属性。",reference:"§5.4.1–5.4.3、表5-7、表5-12，印刷页75–83"},
  armor:{title:"自适应装甲",summary:"每分钟获得强化机会，满足累计命中统计条件后可选择强化区域。",detail:"裁判根据累计命中与发射统计、命中离散程度计算准确度。双方相对准确度影响强化面积，已加固区域伤害系数0.5，未加固区域1.5，默认状态1；与其他攻击、防御增益乘算。累计命中至少10发才满足申请资格。",reference:"§5.2，印刷页72–73",boundary:"虚拟检测样本不代表真实装甲检测精度。"},
  terrain:{title:"地形跨越增益",summary:"公路、高地与隧道依赖规定卡检测顺序和时间窗口。",detail:"公路、高地需由低处到高处；公路和隧道时间窗口3秒，高地5秒。公路防御增益持续5秒，高地及跨越隧道30秒，穿越隧道具有120秒冷却增益；不同地形增益同时有效可获得50%防御增益，战亡后地形增益清除。",reference:"§5.6.4.5、表5-27，印刷页105–106",boundary:"卡区来自CAD几何近似。"},
  radar:{title:"雷达标记",summary:"标记进度0–150由报告误差及连续性决定。",detail:"准确误差小于0.8m，半准确小于1.6m；错误及每0.5秒数据中断均使进度衰减。达到阈值后产生对应易伤；干扰波解析难度也影响易伤。",reference:"§5.7.4、表5-29、表5-30，印刷页112–114",boundary:"合成数据报告只验证虚拟裁判，不模拟真实定位、识别与解码。"},
  revival:{title:"复活、虚弱与免疫",summary:"战亡后可等待读条或使用金币立即复活，两种复活状态不同。",detail:"读条长度取决于战亡时间、累计立即复活次数和后勤系数；补给区或基地低于4000 HP时读条加速。读条复活恢复10%血量，虚弱可由有效区域解除，免疫最多30秒且解除虚弱后至少保留到复活满10秒。金币复活恢复全血，免疫持续3秒、功率增益4秒；正式规则还允许检测到可激活区域后解除虚弱，当前虚拟裁判的金币复活路径按3秒解除。",reference:"§5.3.2、表5-19，印刷页74–75、95"},
  xp:{title:"经验与等级上限",summary:"步兵从经验提升等级；科技等级决定可达的等级上限。",detail:"每次有效经验收入通过裁判结算。达到上限后不再获得经验；二级装配将步兵上限从5级提高到7级，三级提高到10级。首次跨越公路、高地、隧道或激活制高点可获得300经验。",reference:"§5.5.1 表5-14、5-15；§5.4.3 表5-12，印刷页89–91、83"},
  air:{title:"空中系统",summary:"每方一座机库及四台空中机器人；空中机器人全自动运行并配置安全急停。",detail:"空中机器人只允许经机库间接通信；机库用于存储。制作规范要求具有至少10秒持续悬停能力。正式规则的冲击检测参数仍待公布，当前不展示未经验证的冲击伤害演示。",reference:"比赛规则 §3.2.1 表3-7/8、§5.1.1 表5-1，印刷页27、64；制作规范 §2.4.4 S75–S79，印刷页31起",boundary:"现有三维空中系统仅为起飞、悬停、返航及停桨展示，不是完整正式飞行裁判。"},
  dart:{title:"飞镖闸门与检测窗口",summary:"比赛开始30秒及4分钟各获得一次开启机会。",detail:"闸门约7秒完全开启，随后可用30秒发射窗口，检测窗口为40秒；首次关闭后15秒冷却。",reference:"§5.7.3，印刷页110–112",boundary:"仅演示虚拟检测与窗口，不模拟物理飞行。"},
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
  if(kind==="air"||kind==="dart"||kind==="radar")return kind;
}
