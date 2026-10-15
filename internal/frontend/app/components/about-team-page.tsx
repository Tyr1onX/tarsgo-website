import { Link } from "react-router";

import {
  engineeringStages,
  inheritancePractices,
  memberGrowthStages,
  teamOutcomes,
} from "../data/about-team";
import "./about-team-page.css";

type AboutGroup = {
  name: string;
  description: string;
  directions: string[];
  logoBlack: string;
  logoWhite: string;
  collaboration: string;
  contribution: string;
};

function GroupMark({ group }: { group: AboutGroup }) {
  return (
    <span className="about-group-mark" aria-hidden="true">
      <img src={group.logoBlack} alt="" className="about-group-mark__light" />
      <img src={group.logoWhite} alt="" className="about-group-mark__dark" />
    </span>
  );
}

export function AboutTeamPage({ groups }: { groups: AboutGroup[] }) {
  return (
    <main id="about" className="about-team-page">
      <section className="about-team-identity public-home-container" aria-labelledby="about-identity-heading">
        <div className="about-section-intro">
          <p className="about-eyebrow">PLATFORM / TEAM</p>
          <h2 id="about-identity-heading">一个实践平台，一支工程战队</h2>
        </div>
        <div className="about-identity-grid">
          <article className="about-identity-panel about-identity-panel--platform">
            <span className="about-identity-panel__index">平台 / JIJIA MASTER</span>
            <h3>吉甲大师</h3>
            <p>围绕智能机器、真实竞赛与工程项目开展跨学科实践，也承载创新创业、人才培养和团队经验沉淀。</p>
          </article>
          <article className="about-identity-panel about-identity-panel--team">
            <span className="about-identity-panel__index">战队 / TARS-GO</span>
            <h3>TARS-Go</h3>
            <p>吉甲大师体系中面向 RoboMaster 的学生工程战队，通过赛季研发、系统联调和比赛检验工程能力。</p>
          </article>
        </div>
        <p className="about-identity-note">吉甲大师是平台，TARS-Go 是战队；两者相连，但不是同一个组织概念。</p>
      </section>

      <section className="about-team-purpose" aria-labelledby="about-purpose-heading">
        <div className="public-home-container">
          <div className="about-section-intro about-section-intro--wide">
            <p className="about-eyebrow">WHY WE BUILD TOGETHER</p>
            <h2 id="about-purpose-heading">比赛、成长与传承，共同构成团队的价值</h2>
          </div>
          <div className="about-outcomes">
            {teamOutcomes.map((outcome) => (
              <article className="about-outcome" key={outcome.number}>
                <span className="about-outcome__number">{outcome.number}</span>
                <div>
                  <h3>{outcome.title}</h3>
                  <p>{outcome.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="about-team-groups public-home-container" aria-labelledby="about-groups-heading">
        <div className="about-section-intro about-section-intro--wide">
          <p className="about-eyebrow">FIVE GROUPS, ONE SYSTEM</p>
          <h2 id="about-groups-heading">五个组别，协作完成一套系统</h2>
          <p>每个组别有清晰的专业方向，机器人能否完成任务，则取决于模块之间能否接上。</p>
        </div>
        <div className="about-groups-grid">
          {groups.map((group, index) => (
            <article className="about-group" key={group.name}>
              <div className="about-group__topline">
                <span className="about-group__number">{String(index + 1).padStart(2, "0")}</span>
                <GroupMark group={group} />
              </div>
              <h3>{group.name}</h3>
              <p className="about-group__description">{group.description}</p>
              <ul className="about-group__directions" aria-label={`${group.name}主要方向`}>
                {group.directions.map((direction) => <li key={direction}>{direction}</li>)}
              </ul>
              <div className="about-group__role">
                <h4>在协作中的作用</h4>
                <p>{group.contribution}</p>
              </div>
              <p className="about-group__collaboration"><span>协作接口</span>{group.collaboration}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about-team-engineering" aria-labelledby="about-engineering-heading">
        <div className="public-home-container">
          <div className="about-section-intro about-section-intro--wide">
            <p className="about-eyebrow">FROM REQUIREMENTS TO FIELD TEST</p>
            <h2 id="about-engineering-heading">工程工作如何接起来</h2>
          </div>
          <div className="about-engineering-grid">
            <figure className="about-engineering-photo">
              <img
                src="/assets/images/Preparation_for_competition/preparation-02.webp"
                alt="TARS-Go 队员围绕机器人开展备赛检查与调试。"
                loading="lazy"
                decoding="async"
                width="2133"
                height="1600"
              />
              <figcaption>团队备赛现场</figcaption>
            </figure>
            <div className="about-engineering-content">
              <ol className="about-engineering-flow">
                {engineeringStages.map((stage) => (
                  <li key={stage.number}>
                    <span className="about-engineering-flow__number">{stage.number}</span>
                    <div>
                      <h3>{stage.title}</h3>
                      <p>{stage.group}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="about-operations-thread"><strong>运营贯穿全程</strong>：识别运营需求、拆解任务、协调时间与资源、跟进交付，并让成果得到记录、发布和复盘。它支撑团队运作，不只是宣传。</p>
              <p className="about-engineering-note">这是常见的协作关系示意；具体项目会按任务调整分工和先后。</p>
            </div>
          </div>
        </div>
      </section>

      <section className="about-team-growth public-home-container" aria-labelledby="about-growth-heading">
        <div className="about-section-intro about-section-intro--wide">
          <p className="about-eyebrow">LEARN / BUILD / HAND OVER</p>
          <h2 id="about-growth-heading">从学习者到能独立承担，再把经验留下</h2>
        </div>
        <ol className="about-growth-path">
          {memberGrowthStages.map((stage) => (
            <li key={stage.number}>
              <span className="about-growth-path__number">{stage.number}</span>
              <h3>{stage.title}</h3>
              <p>{stage.description}</p>
            </li>
          ))}
        </ol>
        <div className="about-inheritance">
          <div className="about-inheritance__heading">
            <h3>经验会以不同形式留下</h3>
            <p>训练营、校内实践、技术开源和前辈分享，都曾在不同年份成为学习与交接的载体。具体活动会随组别和赛季变化，不是统一课表或固定晋升制度。</p>
          </div>
          <ul>
            {inheritancePractices.map((practice) => (
              <li key={practice.title}>
                <h4>{practice.title}</h4>
                <p>{practice.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <nav className="about-team-related" aria-label="继续了解吉甲大师">
        <div className="public-home-container about-team-related__inner">
          <Link to="/team-history">团队历程 <span aria-hidden="true">↗</span></Link>
          <Link to="/robots">机器人展厅 <span aria-hidden="true">↗</span></Link>
          <Link to="/events-and-honors">赛事与荣誉 <span aria-hidden="true">↗</span></Link>
          <Link to="/join">加入我们 <span aria-hidden="true">↗</span></Link>
        </div>
      </nav>
    </main>
  );
}
