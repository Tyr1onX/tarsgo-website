import type { Route } from "./+types/design-lab";
import { Navbar } from "~/components/navbar";
import { PublicFooter } from "~/components/public-footer";
import { buildPublicMeta } from "~/lib/social-meta";
import "./design-lab.css";

export function meta({}: Route.MetaArgs) {
  return buildPublicMeta({
    title: "设计实验室 | TARSGO",
    description: "创造，不止一种形状。吉甲大师的品牌视觉、图形实验与文化资产。",
    path: "/design-lab",
    image: "/assets/images/Social/home.jpg",
  });
}

const logoRoot = "/assets/images/Logo/";

// Exact path geometry extracted from robot-TARS in tarsgo-logo-v5.svg.
// These are experimental graphic modules, not alternate logos.
const modules = [
  { name: "装甲切面", en: "FACET", d: "M59 15 L73 15 L82 10 L67 10Z", center: [70.5, 12.5], size: 23 },
  { name: "分段关节", en: "JOINT", d: "M85 12 L73 18 L76 32 L88 24Z", center: [80.5, 22], size: 20 },
  { name: "机械负形", en: "VOID", d: "M82 32 L73 36 L72 40 L71 38 L66 72 L71 76 L71 88 L81 92 L72 44 L73 39 L76 47 L83 91 L92 86 L87 68 L93 65Z M77.4 42.7 L81.2 41.8 L82.0 43.4 L78.0 44.4 Z M78.8 46.4 L82.6 45.5 L83.3 47.1 L79.4 48.1 Z M80.2 50.1 L84.0 49.2 L84.6 50.9 L80.8 51.8 Z", center: [79.5, 62], size: 60 },
] as const;

const colors = [
  { name: "暖瓷白", en: "WARM IVORY", hex: "#F5F3EA" },
  { name: "石墨黑", en: "GRAPHITE", hex: "#22262B" },
  { name: "V5 金", en: "现有", hex: "#D0AD69" },
  { name: "吉甲金", en: "探索方案", hex: "#FFBF00" },
];

type Placement = readonly [number, number, number, number, number, string];
const compositions: { name: string; en: string; pieces: Placement[] }[] = [
  { name: "聚合", en: "ASSEMBLE", pieces: [[2,52,50,95,-28,"ink"],[0,19,28,38,0,"gold"],[1,79,28,42,20,"gold"],[0,81,78,34,180,"gold"]] },
  { name: "展开", en: "UNFOLD", pieces: [[2,22,50,74,-26,"gold"],[1,52,35,45,36,"ink"],[0,81,66,43,0,"gold"]] },
  { name: "重复", en: "REPEAT", pieces: [[2,20,50,68,-26,"gold"],[2,50,50,68,-26,"ink"],[2,80,50,68,-26,"gold"]] },
  { name: "旋转", en: "ROTATE", pieces: [[1,35,35,52,0,"gold"],[1,65,35,52,90,"ink"],[1,65,65,52,180,"gold"],[1,35,65,52,270,"ink"]] },
  { name: "缩放", en: "SCALE", pieces: [[0,14,28,20,0,"ink"],[0,39,42,38,0,"gold"],[0,74,64,65,0,"ink"]] },
  { name: "负形", en: "NEGATIVE", pieces: [[2,50,50,105,25,"paper"],[0,20,80,35,180,"gold"],[1,83,20,30,0,"gold"]] },
];

function Piece({ placement, gold = "#FFBF00" }: { placement: Placement; gold?: string }) {
  const [index, x, y, size, angle, color] = placement;
  const module = modules[index];
  const fill = color === "gold" ? gold : color === "paper" ? "#F5F3EA" : "#22262B";
  return <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${size / module.size}) translate(${-module.center[0]} ${-module.center[1]})`}>
    <path d={module.d} fill={fill} fillRule="evenodd" />
  </g>;
}

function Composition({ index = 0, gold }: { index?: number; gold?: string }) {
  return <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    {compositions[index].pieces.map((placement, i) => <Piece key={i} placement={placement} gold={gold} />)}
  </svg>;
}

function SectionTitle({ no, title, en }: { no: string; title: string; en: string }) {
  return <header className="lab-section-title"><span>{no} / {en}</span><h2>{title}</h2></header>;
}

export default function DesignLab() {
  return <>
    <Navbar />
    <main className="design-lab public-route-content">
      <div className="lab-inner">
        <section className="lab-hero" aria-labelledby="lab-title">
          <div className="lab-hero-copy">
            <div className="lab-kicker">吉林大学吉甲大师 · TARS DESIGN LAB</div>
            <h1 id="lab-title">创造，<br/>不止一种<br className="lab-desktop-break"/>形状。</h1>
            <p className="lab-english">CREATIVITY<br/>TAKES SHAPE.</p>
            <p className="lab-description">从共同的结构出发，生长出不同的可能。</p>
          </div>
          <div className="lab-hero-art"><Composition /><span>FIG. 01 / STRUCTURE IN MOTION</span></div>
        </section>
        <div className="lab-index"><span>设计实验室 / VOL. 01</span><nav aria-label="设计实验室章节"><a href="#genes">视觉基因</a><a href="#experiments">设计实验</a><a href="#archive">作品档案</a><a href="#assets">品牌资产</a></nav></div>
        <section id="genes" className="lab-section">
          <SectionTitle no="01" title="视觉基因" en="VISUAL DNA"/>
          <div className="lab-source-grid">
            <figure className="lab-original"><div><img src={logoRoot+"tarsgo-logo-v5-light.svg"} alt="现有 V5 TARSGO 原始标识"/></div><figcaption>01 / V5 原始标识</figcaption></figure>
            <figure className="lab-extraction"><div><svg viewBox="10 0 100 104" aria-hidden="true">
              <image href={logoRoot+"tarsgo-logo-v5-light.svg"} x="10" y="0" width="340" height="104"/>
              {[[57,8,27,10],[72,11,17,22],[65,31,29,62]].map(([x,y,w,h],i)=><rect key={i} x={x} y={y} width={w} height={h} fill="none" stroke="#22262B" strokeWidth=".65" strokeDasharray="2 1"/>)}
            </svg></div><figcaption>02 / 原始路径定位</figcaption></figure>
            <div className="lab-module-grid">
              {modules.map((module,i)=><figure key={module.en}><div><svg viewBox="0 0 100 100" aria-hidden="true"><Piece placement={[i,50,50,72,0,"ink"]}/></svg></div><figcaption>{module.name}<small>{module.en}</small></figcaption></figure>)}
            </div>
          </div>
          <p className="lab-note">辅助图形直接取自 V5 标识的装甲、关节与带镂空的机械路径。以下组合为实验，不替代正式 Logo。</p>
          <div className="lab-palette">
            {colors.map(color=><div key={color.hex} className="lab-swatch" style={{backgroundColor:color.hex,color:color.hex==="#22262B"?"#F5F3EA":"#22262B"}}><span>{color.name} / {color.en}</span><strong>{color.hex}</strong></div>)}
          </div>
          <div className="lab-type"><div><span>TYPE / 字体与层级</span><strong>同一结构，<br/>多种可能。</strong></div><div><span>DISPLAY / Latin</span><strong>Make.<br/>Together.</strong><p>标题使用粗体无衬线；正文使用官网现有字体栈。</p></div></div>
        </section>
        <section id="experiments" className="lab-section">
          <SectionTitle no="02" title="设计实验" en="EXPERIMENTS"/>
          <div className="lab-compare">
            {[colors[2],colors[3]].map(color=><figure key={color.hex}><div><Composition index={0} gold={color.hex}/><strong>创造，<br/>不止一种形状。</strong></div><figcaption>{color.name} · {color.en}<span>{color.hex}</span></figcaption></figure>)}
          </div>
          <div className="lab-experiment-grid">
            {compositions.map((item,i)=><figure key={item.en}><div className={i===5?"lab-negative":""}><Composition index={i}/></div><figcaption><span>0{i+1} / {item.name}</span><small>{item.en}</small></figcaption></figure>)}
          </div>
        </section>
        <section id="archive" className="lab-section">
          <SectionTitle no="03" title="作品档案" en="WORKS"/>
          <p className="lab-note">当前展示概念样张，尚非正式发布作品。</p>
          <div className="lab-works">
            <figure className="lab-work lab-cover"><div className="lab-work-art"><img src="/assets/images/ContestMoment/contest-moment-04.webp" alt="战队真实比赛现场" loading="lazy"/><div className="lab-work-overlay"><Composition index={1}/><strong>工程现场<br/>IN THE MAKING</strong></div></div><figcaption>B站封面 / 概念样张</figcaption></figure>
            <figure className="lab-work lab-poster"><div className="lab-work-art"><span>TARS DESIGN LAB<br/>吉甲设计实验室</span><Composition index={0}/><strong>创造，<br/>不止一种形状。</strong></div><figcaption>宣传海报 / 概念样张</figcaption></figure>
            <figure className="lab-work lab-shirt"><div className="lab-work-art"><svg viewBox="0 0 240 200" aria-label="队服平面应用概念" role="img"><path d="M84 16 50 24 12 65 49 96 65 78 65 184 175 184 175 78 191 96 228 65 190 24 156 16 Q120 44 84 16Z" fill="#F5F3EA" stroke="#22262B" strokeWidth="1.2"/><image href={logoRoot+"tarsgo-logo-v5-light.svg"} x="79" y="50" width="65" height="20"/><g transform="translate(127 128) scale(.75)"><Piece placement={[2,0,0,96,-28,"ink"]}/><Piece placement={[1,38,25,40,0,"gold"]}/></g></svg></div><figcaption>队服 / 概念样张</figcaption></figure>
            <figure className="lab-work lab-stickers"><div className="lab-work-art">{[0,1,3].map(i=><div key={i}><Composition index={i}/></div>)}</div><figcaption>贴纸 / 概念样张</figcaption></figure>
          </div>
        </section>
        <section id="assets" className="lab-section lab-assets">
          <SectionTitle no="04" title="品牌资产" en="ASSETS"/>
          <div className="lab-downloads">
            {[{file:"tarsgo-logo-v5-light.svg",label:"V5 原始标识 · 浅色背景"},{file:"tarsgo-logo-v5.svg",label:"V5 原始标识 · 深色背景"}].map((item,i)=><a key={item.file} href={logoRoot+item.file} download><div className={i===1?"lab-dark-logo":""}><img src={logoRoot+item.file} alt={item.label}/></div><span>{item.label}<small>SVG ↓</small></span></a>)}
          </div>
          <p className="lab-note">V5 金 #D0AD69 为现有网站识别色；候选色与辅助图形暂未转为正式品牌资产。</p>
        </section>
        <div className="lab-end"><strong>MAKE / TOGETHER.</strong><span>吉甲设计实验室 · TARS DESIGN LAB</span></div>
      </div>
    </main>
    <PublicFooter />
  </>;
}
