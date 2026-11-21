import { useState } from "react";
import { Link } from "react-router";
import { teamHistorySources } from "../data/team-history";
import { GroupAnimatedMark } from "./tarsgo-motion-marks";
import { PublicPhotoLightbox, Reveal, type PublicLightboxPhoto } from "./public-motion";
import "./about-team-page.css";

type AboutGroup = {
  name: string;
  aboutSummary: string;
  logoBlack: string;
  logoWhite: string;
};

type PlacePhoto = {
  image: string;
  alt: string;
  layout: string;
};

const placePhotos: PlacePhoto[] = [
  {
    image: "/assets/images/Preparation_for_competition/preparation-01.webp",
    alt: "队员在带有吉甲大师标识的工作空间围绕桌面机器人讨论。",
    layout: "about-place-photo--space",
  },
  {
    image: "/assets/images/Daily/daily-03.webp",
    alt: "几名队员围着笔记本电脑讨论设计，其他成员在一旁查看资料。",
    layout: "about-place-photo--discussion",
  },
  {
    image: "/assets/images/Preparation_for_competition/preparation-02.webp",
    alt: "队员坐在机器人旁检查整机结构与部件。",
    layout: "about-place-photo--assembly",
  },
  {
    image: "/assets/images/Daily/daily-08.webp",
    alt: "吉甲大师标识下，队员围坐在桌旁分享生日蛋糕。",
    layout: "about-place-photo--daily",
  },
  {
    image: "/assets/images/Preparation_for_competition/preparation-07.webp",
    alt: "两台机器人在灯光照明的场地中进行测试。",
    layout: "about-place-photo--testing",
  },
];

const placeLightboxPhotos: PublicLightboxPhoto[] = placePhotos.map((photo) => ({
  src: photo.image,
  alt: photo.alt,
}));

const archiveRecords = [
  {
    year: "2022",
    title: "人工智能挑战赛算法",
    source: teamHistorySources.rm2022Algorithm,
  },
  {
    year: "2023",
    title: "英雄机器人机械设计",
    source: teamHistorySources.rm2023Hero,
  },
  {
    year: "2025",
    title: "步兵机器人方案",
    source: teamHistorySources.rm2025OpenSource,
  },
  {
    year: "2026",
    title: "工程机器人机械结构",
    source: teamHistorySources.rm2026Engineering,
  },
];

export function AboutTeamPage({ groups }: { groups: AboutGroup[] }) {
  const originSource = teamHistorySources.jlu2020Origin;
  const firstCompetitionSource = teamHistorySources.jlu2019Icra;
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [hoverTick, setHoverTick] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  return (
    <main id="about" className="about-team-page">
      <Reveal>
        <section className="about-story-origin public-home-container" aria-labelledby="about-origin-heading">
          <div className="about-story-origin__copy">
            <p className="about-eyebrow">2019 / MONTREAL</p>
            <h2 id="about-origin-heading">一面队旗，第一次走上国际赛场。</h2>
            <p>
              2019 年，TARS-Go 前往加拿大蒙特利尔，参加 ICRA RoboMaster AI Challenge。队旗、机器人和这群年轻的工程师，都留在了同一张照片里。
            </p>
            <div className="about-source-links" aria-label="起源与赛事资料">
              {originSource.href ? (
                <a href={originSource.href} target="_blank" rel="noreferrer">吉林大学起源报道 <span aria-hidden="true">↗</span></a>
              ) : null}
              {firstCompetitionSource.href ? (
                <a href={firstCompetitionSource.href} target="_blank" rel="noreferrer">ICRA 2019 赛事报道 <span aria-hidden="true">↗</span></a>
              ) : null}
            </div>
          </div>
          <figure className="about-origin-photo">
            <img
              src="/assets/images/Milestone/2019-breakthrough.webp"
              alt="TARS-Go 队员在 2019 年 ICRA RoboMaster AI Challenge 场地与队旗、机器人合影。"
              loading="lazy"
              decoding="async"
              width="900"
              height="550"
            />
          </figure>
        </section>
      </Reveal>

      <Reveal delay={60}>
        <section className="about-story-groups" aria-labelledby="about-groups-heading">
          <div className="public-home-container">
            <div className="about-section-heading">
              <p className="about-eyebrow">ONE ROBOT, MANY HANDS</p>
              <h2 id="about-groups-heading">一台机器人，由五种专长共同完成。</h2>
            </div>
            <ul className="about-groups-list">
              {groups.map((group, index) => (
                <li
                  className="about-group"
                  key={group.name}
                  onMouseEnter={() => {
                    setHoveredGroup(group.name);
                    setHoverTick((t) => t + 1);
                  }}
                >
                  <Link
                    to={`/join?group=${encodeURIComponent(group.name)}#join-groups`}
                    className="about-group-card-link"
                  >
                    <span className="about-group__index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    <span className="about-group-mark" aria-hidden="true">
                      <GroupAnimatedMark
                        key={hoveredGroup === group.name ? `${group.name}-${hoverTick}` : group.name}
                        groupName={group.name}
                        play
                      />
                    </span>
                    <h3>{group.name}</h3>
                    <p>{group.aboutSummary}</p>
                    <span className="about-group__cta" aria-hidden="true">了解方向 →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </Reveal>

      <Reveal delay={80}>
        <section className="about-story-place public-home-container" aria-labelledby="about-place-heading">
          <div className="about-section-heading about-section-heading--place">
            <p className="about-eyebrow">WHERE IDEAS TAKE SHAPE</p>
            <h2 id="about-place-heading">创造发生在日常里。</h2>
            <p>讨论、装配、测试，也有一起收工的时刻。</p>
          </div>
          <div className="about-place-grid">
            {placePhotos.map((photo, index) => (
              <figure className={`about-place-photo ${photo.layout}`} key={photo.image}>
                <button
                  type="button"
                  className="about-place-photo__trigger"
                  aria-label={`放大查看：${photo.alt}`}
                  onClick={() => setLightboxIndex(index)}
                >
                  <img src={photo.image} alt={photo.alt} loading="lazy" decoding="async" />
                </button>
              </figure>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal delay={80}>
        <section className="about-story-traces" aria-labelledby="about-traces-heading">
          <div className="public-home-container">
            <div className="about-traces-layout">
              <div className="about-section-heading about-traces-heading">
                <p className="about-eyebrow">OPEN RECORDS</p>
                <h2 id="about-traces-heading">公开的方案，可以继续使用。</h2>
                <p>算法、图纸和整机资料，记录了当时如何把问题做出来。</p>
              </div>
              <ul className="about-archive-list">
                {archiveRecords.map(({ year, title, source }) => (
                  <li key={year}>
                    <span className="about-archive-list__year">{year}</span>
                    <a href={source.href} target="_blank" rel="noreferrer">
                      <span>{title}</span>
                      <span className="about-archive-list__arrow" aria-hidden="true">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </Reveal>

      <PublicPhotoLightbox
        photos={placeLightboxPhotos}
        activeIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onSelect={setLightboxIndex}
      />
    </main>
  );
}
