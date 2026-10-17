import "./about-team-page.css";

type AboutGroup = {
  name: string;
  directions: string[];
  logoBlack: string;
  logoWhite: string;
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
      <section className="about-chapter about-origin public-home-container" aria-labelledby="about-origin-heading">
        <div className="about-chapter__copy">
          <p className="about-eyebrow">2018 / THE BEGINNING</p>
          <h2 id="about-origin-heading">从一个名字开始</h2>
          <p>
            2018 年末，吉林大学的学生组建了 TARS-Go 战队。名字来自《星际穿越》中的机器人 TARS。
            第二年，他们带着机器人前往加拿大蒙特利尔，参加 ICRA RoboMaster 人工智能挑战赛。
          </p>
        </div>
        <figure className="about-photo">
          <img
            src="/assets/images/Milestone/2019-breakthrough.webp"
            alt="2019 年 ICRA RoboMaster 人工智能挑战赛现场，TARS-Go 队员与机器人合影。"
            loading="lazy"
            decoding="async"
          />
          <figcaption>2019 · 蒙特利尔 ICRA RoboMaster 人工智能挑战赛</figcaption>
        </figure>
      </section>

      <section className="about-making" aria-labelledby="about-making-heading">
        <div className="public-home-container">
          <div className="about-chapter__copy">
            <p className="about-eyebrow">MADE TOGETHER</p>
            <h2 id="about-making-heading">一台机器人，许多人的工作</h2>
            <p>从结构设计、电机控制到视觉感知和算法决策，再到赛事与日常工作的组织协调，每个方向都在为同一个目标付出。</p>
          </div>
          <ul className="about-groups-grid" aria-label="吉甲五个组别">
            {groups.map((group) => (
              <li className="about-group" key={group.name}>
                <GroupMark group={group} />
                <h3>{group.name}</h3>
                <p>{group.directions.join(" · ")}</p>
              </li>
            ))}
          </ul>
          <figure className="about-photo about-making__photo">
            <img
              src="/assets/images/Preparation_for_competition/preparation-02.webp"
              alt="TARS-Go 队员围绕机器人进行备赛检查与调试。"
              loading="lazy"
              decoding="async"
            />
            <figcaption>备赛现场 · 从各自的工作到整机联调</figcaption>
          </figure>
        </div>
      </section>

      <section className="about-chapter about-everyday public-home-container" aria-labelledby="about-everyday-heading">
        <figure className="about-photo">
          <img
            src="/assets/images/Daily/daily-02.webp"
            alt="队员围绕电脑与工程模型交流的日常场景。"
            loading="lazy"
            decoding="async"
          />
          <figcaption>吉甲日常 · 讨论与协作</figcaption>
        </figure>
        <div className="about-chapter__copy">
          <p className="about-eyebrow">BEYOND THE FIELD</p>
          <h2 id="about-everyday-heading">赛场之外</h2>
          <p>更多时候，队员们围着电脑和机器人，讨论设计、检查问题、反复调试。这些不在赛场上的普通时刻，同样属于吉甲。</p>
        </div>
      </section>

      <section className="about-legacy" aria-labelledby="about-legacy-heading">
        <div className="public-home-container">
          <div className="about-chapter__copy">
            <p className="about-eyebrow">WHAT REMAINS</p>
            <h2 id="about-legacy-heading">留下来的作品</h2>
            <p>赛季结束后，有些东西依然可以被打开：课程、图纸、模型与代码。它们记录着当时的思考，也为后来的人留下继续探索的起点。</p>
          </div>
          <div className="about-legacy__records">
            <article>
              <span>2021</span>
              <h3>电控夏令营公开课</h3>
              <p>九节公开视频，从 PCB、PWM 到 PID 与姿态解算。</p>
              <a href="https://www.bilibili.com/video/BV1nU4y1n7Xu/" target="_blank" rel="noopener noreferrer">查看课程 <span aria-hidden="true">↗</span></a>
            </article>
            <article>
              <span>2023</span>
              <h3>英雄机器人机械设计开源</h3>
              <p>二维图纸、三维模型、说明文档和测试视频。</p>
              <a href="https://bbs.robomaster.com/article/9447" target="_blank" rel="noopener noreferrer">查看资料 <span aria-hidden="true">↗</span></a>
            </article>
          </div>
          <p className="about-legacy__ending">有人从这里离开，也有人刚刚加入。留下的作品，让相隔多年的人仍有机会从同一个问题继续出发。</p>
        </div>
      </section>
    </main>
  );
}
