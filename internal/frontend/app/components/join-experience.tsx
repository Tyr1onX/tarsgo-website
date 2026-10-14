import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link } from "react-router";

import "./join-experience.css";

type JoinGroup = {
  name: string;
  description: string;
  directions: string[];
  logoBlack: string;
  logoWhite: string;
  logoStructure: string;
};

const groupInterests: Record<string, string> = {
  机械组: "如果你对机器人结构、建模，以及把设计做成实物的过程更感兴趣，可以先了解机械组。",
  电控组: "如果你对嵌入式系统、电路与电机控制方向更感兴趣，可以先了解电控组。",
  视觉组: "如果你对机器视觉、目标识别与自动瞄准方向更感兴趣，可以先了解视觉组。",
  AI组: "如果你对智能算法、决策规划与自主控制方向更感兴趣，可以先了解 AI 组。",
  运营组: "如果你对内容表达、活动策划、赛事运营与对外沟通更感兴趣，可以先了解运营组。",
};

const activityStories = [
  {
    number: "01",
    title: "参与真实项目",
    description: "围绕具体任务开展机器人实践与组内协作，从承担实际工作开始积累经验。每组参与的内容会随项目不同而变化。",
    image: "/assets/images/Preparation_for_competition/preparation-02.webp",
    imageAlt: "队员围绕机器人进行赛前检查与调试。",
    caption: "团队备赛现场记录",
  },
  {
    number: "02",
    title: "走进比赛现场",
    description: "备赛成果会在 RoboMaster 比赛中接受检验。赛场上的协作、判断与调度，也是项目实践的一部分。",
    image: "/assets/images/ContestMoment/contest-moment-04.webp",
    imageAlt: "队员在 RoboMaster 比赛现场共同检查机器人。",
    caption: "RoboMaster 比赛现场",
  },
  {
    number: "03",
    title: "一起建设团队",
    description: "技术开发之外，宣传、策划、赛事运营与对外联络同样支撑团队运转。不同兴趣与专长都能成为协作的一部分。",
    image: "/assets/images/Daily/daily-02.webp",
    imageAlt: "队员围绕笔记本与模型进行日常讨论。",
    caption: "吉甲大师团队日常",
  },
];

const growthStages = [
  {
    number: "01",
    title: "了解方向",
    description: "认识战队、了解组别职责，选择自己感兴趣的方向。",
  },
  {
    number: "02",
    title: "基础学习",
    description: "接触必要的工具与知识，逐步熟悉组内协作。",
  },
  {
    number: "03",
    title: "参与实践",
    description: "从具体任务开始，在实践中积累经验。",
  },
  {
    number: "04",
    title: "深入项目",
    description: "结合个人能力与团队需求，尝试参与更完整的项目。",
  },
];

const recruitmentSteps = [
  {
    number: "01",
    title: "了解方向",
    description: "先了解五个组别的职责，想清楚感兴趣的方向。",
  },
  {
    number: "02",
    title: "创建平台账号",
    description: "在账号注册页创建登录账号；创建账号本身不等于提交招新报名。",
  },
  {
    number: "03",
    title: "查看开放报名",
    description: "登录后进入“我的招新”。只有当前有开放表单时，才能填写并提交报名。",
  },
  {
    number: "04",
    title: "线上初筛",
    description: "报名提交后进入材料初筛；初筛通过不代表最终录取。",
  },
  {
    number: "05",
    title: "确认面试",
    description: "初筛通过后，在“我的招新”查看通知并确认是否参加。",
  },
  {
    number: "06",
    title: "预约面试",
    description: "有可选时段时选择并保存面试时间；时段未开放时按页面提示等待安排。",
  },
  {
    number: "07",
    title: "查看结果",
    description: "在“我的招新”查看进度与结果；面试结果按系统流程通知报名邮箱。",
  },
];

function handleGroupTabKeyDown(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  currentIndex: number,
  groups: JoinGroup[],
  tabsRef: React.RefObject<HTMLDivElement | null>,
  setActiveIndex: (index: number) => void,
) {
  let nextIndex: number | null = null;
  if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % groups.length;
  if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + groups.length) % groups.length;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = groups.length - 1;
  if (nextIndex === null) return;

  event.preventDefault();
  setActiveIndex(nextIndex);
  tabsRef.current?.querySelector<HTMLButtonElement>("#join-group-tab-" + nextIndex)?.focus();
}

export function JoinExperience({ groups }: { groups: JoinGroup[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabsRef = useRef<HTMLDivElement>(null);
  const activeGroup = groups[activeIndex] ?? groups[0];

  if (!activeGroup) return null;

  return (
    <main className="join-page">
      <section className="join-hero" aria-labelledby="join-page-heading">
        <img
          className="join-hero__image"
          src="/assets/images/Daily/daily-02.webp"
          alt="队员围绕笔记本与模型进行日常讨论。"
          fetchPriority="high"
          decoding="async"
        />
        <div className="join-hero__shade" aria-hidden="true" />
        <div className="join-page__container join-hero__content">
          <p className="join-eyebrow">YOUR JOURNEY STARTS HERE</p>
          <h1 id="join-page-heading">和我们一起，创造更多可能。</h1>
          <p className="join-hero__description">
            从接触机器人，到参与项目与赛事，在工程实践和团队协作中探索属于自己的方向。
          </p>
          <a className="join-hero__link" href="#join-groups">
            探索五个组别 <span aria-hidden="true">↓</span>
          </a>
        </div>
      </section>

      <div className="join-page__container">
        <section id="join-groups" className="join-section" aria-labelledby="join-groups-heading">
          <div className="join-section__heading">
            <p className="join-eyebrow">FIND YOUR DIRECTION</p>
            <h2 id="join-groups-heading">探索五个组别</h2>
            <p>从真实职责与兴趣出发，先找到值得深入了解的方向。</p>
          </div>

          <div className="join-group-tabs" ref={tabsRef} role="tablist" aria-label="选择一个专业组别">
            {groups.map((group, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={group.name}
                  id={"join-group-tab-" + index}
                  type="button"
                  role="tab"
                  data-group-index={index}
                  aria-selected={isActive}
                  aria-controls="join-group-panel"
                  tabIndex={isActive ? 0 : -1}
                  className="join-group-tab"
                  onClick={() => setActiveIndex(index)}
                  onKeyDown={(event) => handleGroupTabKeyDown(event, index, groups, tabsRef, setActiveIndex)}
                >
                  <span className="join-group-mark" aria-hidden="true">
                    <img src={group.logoBlack} alt="" className="join-group-mark__light" />
                    <img src={group.logoWhite} alt="" className="join-group-mark__dark" />
                  </span>
                  <span className="join-group-tab__name">{group.name}</span>
                </button>
              );
            })}
          </div>

          <div
            id="join-group-panel"
            className="join-group-panel"
            role="tabpanel"
            aria-labelledby={"join-group-tab-" + activeIndex}
            tabIndex={0}
          >
            <figure className="join-group-panel__photo">
              <img
                src="/assets/images/Preparation_for_competition/preparation-02.webp"
                alt="吉甲大师团队备赛现场的通用影像，与当前选择的组别不直接对应。"
                loading="lazy"
                decoding="async"
              />
              <figcaption>团队备赛现场 · 通用团队影像，不代表当前组别的专属工作现场。</figcaption>
            </figure>

            <div className="join-group-panel__content" aria-live="polite" aria-atomic="true">
              <div className="join-group-panel__brand" aria-hidden="true">
                <img src={activeGroup.logoStructure} alt="" className="join-group-panel__structure" />
                <span className="join-group-mark join-group-panel__mark">
                  <img src={activeGroup.logoBlack} alt="" className="join-group-mark__light" />
                  <img src={activeGroup.logoWhite} alt="" className="join-group-mark__dark" />
                </span>
              </div>
              <p className="join-group-panel__index">
                GROUP / {String(activeIndex + 1).padStart(2, "0")}
              </p>
              <h3>{activeGroup.name}</h3>

              <div className="join-group-facts">
                <section>
                  <h4>我们在做什么？</h4>
                  <p>{activeGroup.description}</p>
                </section>
                <section>
                  <h4>你会接触什么？</h4>
                  <ul className="join-direction-list" aria-label={activeGroup.name + "涉及方向"}>
                    {activeGroup.directions.map((direction) => <li key={direction}>{direction}</li>)}
                  </ul>
                </section>
                <section>
                  <h4>适合怎样的兴趣方向？</h4>
                  <p>{groupInterests[activeGroup.name] ?? "可以先从本组职责与涉及方向开始了解，再结合自己的兴趣选择。"}</p>
                </section>
              </div>
            </div>
          </div>
        </section>

        <section className="join-section join-stories" aria-labelledby="join-stories-heading">
          <div className="join-section__heading">
            <p className="join-eyebrow">LIFE AT TARSGO</p>
            <h2 id="join-stories-heading">在吉甲，你可以经历什么？</h2>
            <p>机器人项目、比赛现场与团队日常，构成不同成员共同参与的实践。</p>
          </div>

          <div className="join-story-list">
            {activityStories.map((story, index) => (
              <article
                key={story.number}
                className={"join-story " + (index % 2 === 1 ? "join-story--image-right" : "")}
              >
                <figure className="join-story__media">
                  <img src={story.image} alt={story.imageAlt} loading="lazy" decoding="async" />
                  <figcaption>{story.caption}</figcaption>
                </figure>
                <div className="join-story__copy">
                  <p className="join-story__number">{story.number} <span aria-hidden="true">/</span> TARSGO</p>
                  <h3>{story.title}</h3>
                  <p>{story.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="join-section" aria-labelledby="join-growth-heading">
          <div className="join-section__heading">
            <p className="join-eyebrow">A POSSIBLE JOURNEY</p>
            <h2 id="join-growth-heading">新人如何成长？</h2>
            <p>这是一条可能的成长方向，不代表统一执行的培养制度；具体内容与安排以各组和项目实际情况为准。</p>
          </div>
          <ol className="join-growth-path">
            {growthStages.map((stage) => (
              <li key={stage.number}>
                <span className="join-growth-path__number">{stage.number}</span>
                <h3>{stage.title}</h3>
                <p>{stage.description}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="join-process" className="join-section join-process-section" aria-labelledby="join-process-heading">
          <div className="join-section__heading">
            <p className="join-eyebrow">HOW TO JOIN</p>
            <h2 id="join-process-heading">如何加入我们？</h2>
            <p>页面会根据当前招新状态显示开放信息；不要把平台账号注册当作完成报名。</p>
          </div>

          <ol className="join-process">
            {recruitmentSteps.map((step) => (
              <li key={step.number}>
                <span className="join-process__number">{step.number}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="join-process__status">
            当前是否开放招新，以登录后“我的招新”页面显示为准；本页不预设报名开放或截止状态。
          </p>

          <div className="join-actions">
            <Link className="join-action join-action--primary" to="/register">
              创建平台账号 <span aria-hidden="true">→</span>
            </Link>
            <Link className="join-action join-action--secondary" to="/dashboard/users/registrations">
              已有账号？进入“我的招新”
            </Link>
          </div>
          <p className="join-actions__note">
            创建账号只会开通平台登录；请在“我的招新”确认是否有开放表单，并单独提交招新报名。
          </p>
        </section>
      </div>
    </main>
  );
}
