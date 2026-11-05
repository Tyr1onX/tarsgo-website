import { useEffect, useState } from "react";
import { Link } from "react-router";
import { SalonShell, salonButton, salonPrimaryButton, useSalonIdentity } from "~/components/ai-salon-shared";
import { BrandLoader } from "~/components/brand-loader";
import { SalonArtwork } from "~/components/salon-artwork";
import { SalonHeroArt } from "~/components/salon-hero-art";
import { salonClient, salonDate, salonError, type SalonEvent } from "~/lib/ai-salon-client";
import { salonEventStatus } from "~/lib/salon-event-status";
import { salonContent } from "~/lib/salon-content";
import "~/salon.css";

export function meta() {
  return [
    { title: "吉甲 AI 沙龙 | TARSGO" },
    { name: "description", content: "面向吉林大学学生的长期 AI 创作实践与交流活动。让想法成为作品，让作品带来交流，让交流产生下一次共创。" },
  ];
}

function EventCard({ event }: { event: SalonEvent }) {
  const status = salonEventStatus(event, Date.parse(event.serverNow));
  return (
    <Link to={`/programs/ai-salon/${event.id}`} className="salon-event-card">
      <div className="salon-event-cover">
        {event.posterUrl ? (
          <img src={event.posterUrl} alt={`${event.title}海报`} loading="lazy" referrerPolicy="no-referrer" />
        ) : <SalonArtwork />}
      </div>
      <div className="salon-event-body">
        <span className={`salon-event-status${event.registrationOpen ? " salon-event-status--open" : ""}`}>{status}</span>
        <h3>{event.title}</h3>
        <dl className="salon-event-meta">
          <div><dt>时间</dt><dd>{salonDate(event.startAt)}（北京时间）</dd></div>
          {event.location ? <div><dt>地点</dt><dd>{event.location}</dd></div> : null}
        </dl>
        {event.summary ? <p className="salon-event-summary">{event.online ? salonContent(event.summary, true).summary.split("\n\n")[0] : event.summary}</p> : null}
        <span className="salon-event-link">{event.registrationOpen ? "了解活动与报名" : "查看活动"}<span aria-hidden="true">↗</span></span>
      </div>
    </Link>
  );
}

export default function AISalon() {
  const { user } = useSalonIdentity();
  const [events, setEvents] = useState<SalonEvent[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void salonClient.list().then((rows) => { if (active) setEvents(rows); })
      .catch((e) => { if (active) setError(salonError(e)); });
    return () => { active = false; };
  }, []);
  const upcoming = events?.filter((e) => Date.parse(e.endAt) > Date.parse(e.serverNow)) ?? [];
  const past = events?.filter((e) => Date.parse(e.endAt) <= Date.parse(e.serverNow)).reverse() ?? [];
  return (
    <SalonShell>
      <div className="salon-home">
        <section className="salon-hero" aria-labelledby="salon-title">
          <div className="salon-hero-heading">
            <h1 id="salon-title"><span className="salon-brand-mark" aria-hidden="true" />吉甲 AI 沙龙</h1>
            <div className="salon-personal-links">
              {user ? <Link className={salonButton} to="/programs/ai-salon/registrations">我的报名</Link> : null}
              {user?.role.name === "super_admin" ? <Link className={salonButton} to="/programs/ai-salon/manage">管理活动</Link> : null}
            </div>
          </div>
          <div className="salon-hero-content">
            <div className="salon-hero-copy">
              <p className="salon-manifesto">让想法，<br /><span>成为作品。</span></p>
              <p className="salon-intro">面向吉林大学同学的<br className="sm:hidden" />长期 AI 创作实践与交流活动。</p>
              <a className={salonPrimaryButton} href="#salon-events">查看近期活动 <span className="ml-6" aria-hidden="true">↓</span></a>
            </div>
            <div className="salon-hero-art"><SalonHeroArt /></div>
          </div>
        </section>
        <section id="salon-events" className="salon-events" aria-labelledby="salon-events-title">
          <div className="salon-section-heading"><h2 id="salon-events-title">近期活动</h2></div>
          {error ? <p className="salon-empty" role="alert">{error}</p> : !events ? (
            <BrandLoader label="正在加载活动" />
          ) : upcoming.length ? (
            <div className="salon-event-grid">{upcoming.map((event) => <EventCard key={event.id} event={event} />)}</div>
          ) : <div className="salon-empty"><span className="salon-empty-dot" aria-hidden="true" /><p>新一期活动筹备中</p></div>}
        </section>
        <section className="salon-format" aria-labelledby="salon-format-title">
          <div className="salon-section-heading"><h2 id="salon-format-title">让作品带来交流，让交流产生下一次共创。</h2></div>
          <ol className="salon-steps">
            {([
              ["创作入门", "线上体验、线下实践，从工具上手到自主完善作品。"],
              ["作品展示", "分享作品、创作思路与经验，从学习者成为分享者。"],
              ["交流共创", <>围绕「像素吉大」（吉大版星露谷物语）等校园创作，在 <a className="text-accent-primary underline" href="https://jluai.cn/" target="_blank" rel="noopener noreferrer">JLUAI</a> 交流想法、一起共创。</>],
            ] as const).map(([title, description], index) => (
              <li key={title}><span className="salon-step-number" aria-hidden="true">0{index + 1}</span><h3>{title}</h3><p>{description}</p></li>
            ))}
          </ol>
        </section>
        {past.length ? (
          <section className="salon-past" aria-labelledby="salon-past-title">
            <div className="salon-section-heading"><h2 id="salon-past-title">往期活动</h2></div>
            <div className="salon-event-grid">{past.map((event) => <EventCard key={event.id} event={event} />)}</div>
          </section>
        ) : null}
      </div>
    </SalonShell>
  );
}
