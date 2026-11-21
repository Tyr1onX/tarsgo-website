import { useMemo, useState } from "react";
import { Link } from "react-router";
import { teamHistorySources, teamHistoryYears, type TeamHistorySource } from "../data/team-history";
import { honorAwards } from "../lib/events-and-honors-data";
import { PublicPhotoLightbox, Reveal, useScrollSpy, type PublicLightboxPhoto } from "./public-motion";
import "./team-history-archive.css";

function HistorySource({ sourceId }: { sourceId: keyof typeof teamHistorySources }) {
  const source: TeamHistorySource = teamHistorySources[sourceId];
  const content = (
    <>
      <span className="team-history-source__kind">{source.kind}</span>
      <span>{source.label}</span>
    </>
  );

  return source.href?.startsWith("/") ? (
    <Link className="team-history-source" to={source.href}>{content}</Link>
  ) : source.href ? (
    <a className="team-history-source" href={source.href} target="_blank" rel="noreferrer">{content}</a>
  ) : (
    <span className="team-history-source">{content}</span>
  );
}

function HistoryHonor({ awardId, existingSourceHrefs }: { awardId: string; existingSourceHrefs: Array<string | undefined> }) {
  const award = honorAwards.find((item) => item.id === awardId);
  if (!award) return null;
  const additionalSources = award.sources?.filter((source) => !existingSourceHrefs.includes(source.href)) ?? [];

  return (
    <>
      <li>
        <Link className="team-history-source" to="/events-and-honors#competition-records">
          <span className="team-history-source__kind">赛事与荣誉</span>
          <span>{award.event} · {award.result}</span>
        </Link>
      </li>
      {additionalSources.map((source) => (
        <li key={`${award.id}-${source.href}`}>
          <a className="team-history-source" href={source.href} target="_blank" rel="noreferrer">
            <span className="team-history-source__kind">赛事原始公告</span>
            <span>{source.label}</span>
          </a>
        </li>
      ))}
    </>
  );
}

export function TeamHistoryArchive() {
  const activeYearId = useScrollSpy(teamHistoryYears.map(({ year }) => `team-history-${year}`));
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const galleryPhotos = useMemo<Array<PublicLightboxPhoto & { year: number }>>(
    () =>
      teamHistoryYears
        .filter((item) => Boolean(item.image))
        .map((item) => ({
          year: item.year,
          src: item.image!.src,
          alt: item.image!.alt,
        })),
    [],
  );

  return (
    <section id="achievements" className="team-history-archive border-t border-[var(--theme-border-subtle)] py-12 sm:py-16">
      <div className="public-home-container">
        <Reveal>
          <div className="team-history-identities" aria-label="平台与战队身份">
            <article className="team-history-identity">
              <p>实践平台</p>
              <h2>吉甲大师</h2>
              <span>吉林大学学生创新创业与工程实践平台</span>
            </article>
            <article className="team-history-identity">
              <p>赛事战队</p>
              <h2>TARS-Go</h2>
              <span>参与 RoboMaster 等赛事的学生工程战队</span>
            </article>
          </div>
        </Reveal>

        <nav className="team-history-years" aria-label="按年份浏览团队历程">
          {teamHistoryYears.map(({ year }) => (
            <a
              key={year}
              href={`#team-history-${year}`}
              className={activeYearId === `team-history-${year}` ? "is-active" : undefined}
            >
              {year}
            </a>
          ))}
        </nav>

        <div className="team-history-years-list">
          {teamHistoryYears.map(({ year, stories, image }) => {
            const photoIdx = image ? galleryPhotos.findIndex((p) => p.year === year) : -1;
            return (
              <Reveal key={year}>
                <section id={`team-history-${year}`} className={image ? "team-history-year team-history-year--illustrated" : "team-history-year"}>
                  <div className="team-history-year__number">
                    <h2>{year}</h2>
                  </div>

                  <div className="team-history-year__stories">
                    {stories.map((story) => (
                      <article key={story.id} className="team-history-story">
                        <div className="team-history-story__meta">
                          <span>{story.date}</span>
                          <span>{story.lane}</span>
                        </div>
                        <h3>{story.title}</h3>
                        <p>{story.summary}</p>
                        <ul className="team-history-story__sources" aria-label={`${story.title}的资料依据`}>
                          {story.sourceIds.map((sourceId) => (
                            <li key={sourceId}><HistorySource sourceId={sourceId} /></li>
                          ))}
                          {story.honorIds?.map((awardId) => (
                            <HistoryHonor
                              key={awardId}
                              awardId={awardId}
                              existingSourceHrefs={story.sourceIds.map((sourceId) => {
                                const source = teamHistorySources[sourceId];
                                return "href" in source ? source.href : undefined;
                              })}
                            />
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>

                  {image ? (
                    <figure className="team-history-photo">
                      <button
                        type="button"
                        className="team-history-photo__trigger"
                        aria-label={`放大查看 ${year} 年历史照片：${image.alt}`}
                        onClick={() => { if (photoIdx >= 0) setLightboxIndex(photoIdx); }}
                      >
                        <img src={image.src} alt={image.alt} loading="lazy" decoding="async" />
                      </button>
                      <ul aria-label={`${year}年照片资料依据`}>
                        {image.sourceIds.map((sourceId) => (
                          <li key={sourceId}><HistorySource sourceId={sourceId} /></li>
                        ))}
                      </ul>
                    </figure>
                  ) : null}
                </section>
              </Reveal>
            );
          })}
        </div>

        <nav className="team-history-related" aria-label="相关档案">
          <Link to="/events-and-honors">赛事与荣誉 <span aria-hidden="true">→</span></Link>
          <Link to="/robots">机器人赛季档案 <span aria-hidden="true">→</span></Link>
        </nav>
      </div>

      <PublicPhotoLightbox
        photos={galleryPhotos}
        activeIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onSelect={setLightboxIndex}
      />
    </section>
  );
}
