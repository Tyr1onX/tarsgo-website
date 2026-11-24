import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { COMMUNITY_POSES, communitySourceHref } from "~/lib/pixel-jijia-community";
import type { RoomObject } from "~/lib/pixel-jijia-room";
import { robotSeasons } from "~/data/robot-seasons";
import communityAtlas from "../assets/pixel-jijia/room-community-v31.png?url";
import communityIndex from "../assets/pixel-jijia/room-community-v31.json";

const sprites: Record<string, number[]> = communityIndex;
const atlasWidth = 384, atlasHeight = Math.max(...Object.values(sprites).map(([,y,,h]) => y+h))+2;
export function CommunitySprite({ id, label, effect, maxWidth = 220, maxHeight = 105 }: { id: string; label?: string; effect?: string; maxWidth?: number; maxHeight?: number }) {
  const [x, y, w, h] = sprites[id];
  const scale = Math.min(3, maxWidth / w, maxHeight / h);
  const frames = COMMUNITY_POSES[id];
  const style: CSSProperties & Record<string, string | number> = {
    width: w * scale, height: h * scale,
    backgroundImage: `url(${communityAtlas})`,
    backgroundSize: `${atlasWidth * scale}px ${atlasHeight * scale}px`,
    backgroundPosition: `-${x * scale}px -${y * scale}px`,
  };
  frames?.forEach((key, i) => {
    const [fx,fy] = sprites[key];
    style["--pose-" + i] = `-${fx*scale}px -${fy*scale}px`;
  });
  return <span className={`pixel-community-sprite${frames ? " pixel-community-sprite--animated" : ""}${effect ? " pixel-community-sprite--" + effect : ""}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={style} />;
}

const toolInfo = {
  "齿轮": "通过啮合传递运动和扭矩。",
  "轴承": "支撑旋转轴，减少摩擦。",
  "扳手": "紧固与拆卸螺栓、螺母。",
  "六角工具": "用于内六角螺钉的装拆。",
  "螺丝": "将零件可靠连接在一起。",
};
function Tools() {
  const [tool, setTool] = useState<keyof typeof toolInfo>("齿轮");
  return <div className="pixel-community-interaction">
    <div className="pixel-community-controls" role="group" aria-label="工作台工具">
      {(Object.keys(toolInfo) as (keyof typeof toolInfo)[]).map(item => <button type="button" key={item} aria-pressed={tool === item} onClick={() => setTool(item)}>{item}</button>)}
    </div>
    <p role="status">{toolInfo[tool]}</p>
  </div>;
}

const assemblyParts = { "底盘": "part-chassis", "动力系统": "part-drive", "云台": "part-turret", "装甲": "part-armor" };
const assemblyOrder = Object.keys(assemblyParts) as (keyof typeof assemblyParts)[];
function Assembly() {
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const done = step === assemblyOrder.length;
  return <div className="pixel-community-interaction">
    {done ? <div className="pixel-community-started" role="status"><CommunitySprite id="test-robot" label="组装完成的机器人" effect="glow" /><span>装配完成 · 机器人已启动</span></div> :
      <><p>装配进度 {step}/{assemblyOrder.length} · {step === 0 ? "从承载结构开始" : step === 1 ? "让底盘能够运动" : step === 2 ? "安装上部转动结构" : "完成外部保护"}</p>
      <div className="pixel-community-controls" role="group" aria-label="机器人装配部件">
        {(["云台", "装甲", "底盘", "动力系统"] as (keyof typeof assemblyParts)[]).map(part => <button type="button" key={part} disabled={assemblyOrder.slice(0, step).includes(part)} onClick={() => {
          if (part !== assemblyOrder[step]) { setError("这个部件需要稍后安装。"); return; }
          setStep(step + 1); setError("");
        }}><CommunitySprite id={assemblyParts[part]} maxWidth={35} maxHeight={27} />{part}{assemblyOrder.slice(0, step).includes(part) ? " ✓" : ""}</button>)}
      </div></>}
    {error && <p role="status">{error}</p>}
    {done && <button type="button" className="pixel-community-action" onClick={() => { setStep(0); setError(""); }}>重新组装</button>}
  </div>;
}

const directions = ["up", "right", "down", "left"] as const;
type DriveDirection = typeof directions[number];
function Drive({ returnTo }: { returnTo: string }) {
  const [position, setPosition] = useState<{ x: number; y: number; facing: DriveDirection }>({ x: 2, y: 1, facing: "right" });
  const move = (direction: DriveDirection) => setPosition(old => ({
    x: Math.max(0, Math.min(4, old.x + Number(direction === "right") - Number(direction === "left"))),
    y: Math.max(0, Math.min(2, old.y + Number(direction === "down") - Number(direction === "up"))),
    facing: direction,
  }));
  const turn = () => setPosition(old => ({ ...old, facing: directions[(directions.indexOf(old.facing) + 1) % 4] }));
  const keys = (event: KeyboardEvent) => {
    const key = ({ ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" } as const)[event.key as "ArrowUp"];
    if (key) { event.preventDefault(); move(key); }
  };
  return <div className="pixel-community-interaction" tabIndex={0} onKeyDown={keys} aria-label="机器人驾驶练习">
    <div className="pixel-community-drive" aria-label="机器人练习区域">
      <div className="pixel-community-drive-robot" data-position={`${position.x},${position.y}`} data-facing={position.facing} style={{ left: `${12 + position.x * 19}%`, top: `${17 + position.y * 33}%`, transform: `translate(-50%, -50%) scaleX(${position.facing === "left" || position.facing === "up" ? -1 : 1})` }}>
        <CommunitySprite id="test-robot" maxWidth={54} maxHeight={45} />
      </div>
    </div>
    <div className="pixel-community-controls" role="group" aria-label="机器人控制">
      {directions.map(direction => <button type="button" key={direction} aria-label={{ up:"机器人向上移动", right:"机器人向右移动", down:"机器人向下移动", left:"机器人向左移动" }[direction]} onClick={() => move(direction)}>{{ up:"↑", right:"→", down:"↓", left:"←" }[direction]}</button>)}
      <button type="button" onClick={turn}>转向</button>
    </div>
    <Link to="/pixel-jijia/arena" state={{ experienceReturnTo: returnTo }} className="pixel-world-detail-link">进入机甲竞技场 <span aria-hidden="true">↗</span></Link>
    <Link to="/pixel-jijia/battle" state={{ experienceReturnTo: returnTo }} className="pixel-world-detail-secondary-link">像素战术演练</Link>
  </div>;
}

function ArchiveImage({ src, alt }: { src: string; alt: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  return <div className="pixel-community-archive-image">
    {status !== "error" && <img src={src} alt={alt} loading="eager"
      style={{ visibility: status === "ready" ? "visible" : "hidden" }}
      onLoad={event => { void event.currentTarget.decode().then(() => setStatus("ready"), () => setStatus("error")); }}
      onError={() => setStatus("error")} />}
    {status === "loading" && <span role="status">档案加载中…</span>}
    {status === "error" && <span role="status">档案图片暂不可用</span>}
  </div>;
}

const historyPages = [...robotSeasons].reverse();
function Memoir() {
  const [page, setPage] = useState(0);
  const season = historyPages[page], robot = season.robots[0];
  return <div className="pixel-community-interaction pixel-community-history">
    <strong>{season.title}</strong>
    <ArchiveImage key={robot.image.thumbnail} src={robot.image.thumbnail} alt={`${season.season} 赛季 · ${robot.name}`} />
    <p>{robot.name} · 官网公开定妆照</p>
    <div className="pixel-community-controls" role="group" aria-label="回忆录翻页">
      <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button>
      <span>{page + 1}/{historyPages.length}</span>
      <button type="button" disabled={page === historyPages.length - 1} onClick={() => setPage(page + 1)}>下一页</button>
    </div>
    <Link to="/robots" className="pixel-world-detail-secondary-link">历年机器人完整档案</Link>
    <Link to="/about" className="pixel-world-detail-secondary-link">战队发展历程</Link>
    <Link to="/events-and-honors" className="pixel-world-detail-secondary-link">赛事与荣誉</Link>
  </div>;
}
function Memory() {
  return <div className="pixel-community-interaction pixel-community-history">
    <ArchiveImage src="/assets/images/Milestone/2024-national-competition.webp" alt="RoboMaster 2024 全国赛现场合影" />
    <p>2024 · RoboMaster 全国赛现场<br />来自官网公开赛事档案</p>
    <p>2018 年底 · 战队成立。<br /><a href="https://news.jlu.edu.cn/info/1306/52000.htm" target="_blank" rel="noreferrer">吉林大学新闻网</a></p>
    <p>2023 · 校内机甲大师赛。<br /><a href="https://cxcyjyxy.jlu.edu.cn/info/1060/1961.htm" target="_blank" rel="noreferrer">吉林大学创新创业教育学院</a></p>
    <Link to="/events-and-honors" className="pixel-world-detail-link">翻阅真实赛事记录 <span aria-hidden="true">↗</span></Link>
  </div>;
}
const meetingTopics = ["研发：确认本周需要验证的结构与控制方案。", "协作：记录问题、明确负责人和下一步。", "运营：把可公开的成果整理成资料和内容。"];
function Meeting({ onSit, sitting }: { onSit?: () => void; sitting: boolean }) {
  const [topic, setTopic] = useState(0);
  return <div className="pixel-community-interaction">
    <p role="status">{meetingTopics[topic]}</p>
    <div className="pixel-community-controls">
      {onSit && !sitting && <button type="button" onClick={onSit}>坐下旁听</button>}
      <button type="button" onClick={() => setTopic((topic + 1) % meetingTopics.length)}>听下一段</button>
    </div>
  </div>;
}
const seniorTopics = [
  { label: "认识战队", answer: "先了解机械、电控、视觉、AI 等组别的工作，再找到自己感兴趣的方向。", href: "/about", action: "认识吉甲" },
  { label: "参加研发", answer: "从组内的学习和实践任务开始，有问题就与组内成员交流。", href: "/join", action: "加入吉甲" },
  { label: "学习资源", answer: "工作台中的培训资料和社区记录是学习的入口。", href: "/dashboard/training-materials", action: "查看培训资料" },
  { label: "过去的吉甲", answer: "吉甲的历史记录、历年机器人和赛事材料都可以在官网中查阅。", href: "/events-and-honors", action: "查看赛事与荣誉" },
];
function Senior() {
  const [topic, setTopic] = useState(0);
  const current = seniorTopics[topic];
  return <div className="pixel-community-interaction">
    <div className="pixel-community-controls" role="group" aria-label="与老学长交流">
      {seniorTopics.map((item, i) => <button key={item.label} type="button" aria-pressed={topic === i} onClick={() => setTopic(i)}>{item.label}</button>)}
    </div>
    <p role="status">{current.answer}</p>
    <Link to={current.href} className="pixel-world-detail-link">{current.action} <span aria-hidden="true">↗</span></Link>
  </div>;
}

export function CommunityObjectDetail({ object, onSit, sitting, returnTo }: { object: RoomObject; onSit?: () => void; sitting: boolean; returnTo: string }) {
  const community = object.community!;
  const action = community.interaction;
  const [activated, setActivated] = useState(false);
  const [laughCount, setLaughCount] = useState(0);
  const effects = action === "smoke" || action === "burst" || action === "glow" ? action : action === "laugh" && laughCount ? "laugh" : undefined;
  return <>
    <div className="pixel-community-art"><CommunitySprite key={laughCount} id={object.id} label={object.title} effect={effects} /></div>
    <p>{object.description}</p>
    {action === "cable" && <div className="pixel-community-interaction">
      {!activated ? <button type="button" className="pixel-community-action" onClick={() => setActivated(true)}>连接数据线</button> : <div className="pixel-community-terminal" role="status">供电正常。<br />未识别到数据设备。</div>}
    </div>}
    {action === "terminal" && <div className="pixel-community-terminal" role="status"><span className="pixel-community-typewriter">!!Hello World!!</span></div>}
    {action === "silverwolf" && <div className="pixel-community-terminal pixel-community-terminal--wolf" role="status">PLAYER // 银狼 LV.999<br /><strong>GAME NOT OVER</strong><br /><a href="https://sr.mihoyo.com/news/163575?type=news" target="_blank" rel="noreferrer">官方角色 PV</a></div>}
    {action === "laugh" && <div className="pixel-community-interaction"><button type="button" className="pixel-community-action" onClick={() => setLaughCount(n => n+1)}>捧腹大笑</button>{laughCount>0 && <p role="status">hohohohohohohohohoh</p>}</div>}
    {action === "tools" && <Tools />}
    {action === "assembly" && <Assembly />}
    {action === "drive" && <Drive returnTo={returnTo} />}
    {action === "memoir" && <Memoir />}
    {action === "memory" && <Memory />}
    {action === "meeting" && <Meeting onSit={onSit} sitting={sitting} />}
    {action === "senior" && <Senior />}
    <div className="pixel-community-credits">
      {community.sources.map((source, index) => <div className="pixel-community-credit" key={source.comment}>
        <span>{source.role === "suggestion" ? "建议者" : source.role === "support" ? "支持者" : "跟帖者"}：匿名共建成员</span>
        <span>{source.date} · <Link to={communitySourceHref(source)} target="_blank" rel="noreferrer">{source.role === "suggestion" ? "查看原始提议" : "查看原始回复"}{community.sources.length > 1 ? ` ${index + 1}` : ""} ↗</Link></span>
      </div>)}
    </div>
  </>;
}
