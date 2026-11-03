import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  SalonBackLink,
  SalonShell,
  salonPanel,
  salonButton,
  useSalonIdentity,
} from "~/components/ai-salon-shared";
import {
  salonClient,
  salonDate,
  salonError,
  type SalonEvent,
} from "~/lib/ai-salon-client";
export function meta() {
  return [{ title: "吉甲 AI 沙龙 | TARSGO" }];
}
export default function AISalon() {
  const { user } = useSalonIdentity();
  const [events, setEvents] = useState<SalonEvent[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void salonClient
      .list()
      .then((rows) => {
        if (active) setEvents(rows);
      })
      .catch((e) => {
        if (active) setError(salonError(e));
      });
    return () => {
      active = false;
    };
  }, []);
  const now = events?.[0] ? Date.parse(events[0].serverNow) : Date.now();
  const groups = [
    {
      title: "即将举行",
      rows: events?.filter((e) => Date.parse(e.endAt) > now) ?? [],
    },
    {
      title: "往期活动",
      rows: events?.filter((e) => Date.parse(e.endAt) <= now).reverse() ?? [],
    },
  ];
  return (
    <SalonShell>
      <SalonBackLink to="/programs">基地项目</SalonBackLink>
      <div className="mb-10 flex flex-wrap items-center justify-between gap-5">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          吉甲 AI 沙龙
        </h1>
        <div className="flex flex-wrap gap-3">
          {user ? (
            <Link className={salonButton} to="/programs/ai-salon/registrations">
              我的报名
            </Link>
          ) : null}
          {user?.role.name === "super_admin" ? (
            <Link className={salonButton} to="/programs/ai-salon/manage">
              管理活动
            </Link>
          ) : null}
        </div>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : !events ? (
        <p role="status" className="text-fg-muted">
          正在读取活动…
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.title} className="mb-12">
            <h2 className="mb-5 text-xl font-semibold">{group.title}</h2>
            {group.rows.length ? (
              <div className="grid gap-5 sm:grid-cols-2">
                {group.rows.map((e) => (
                  <Link
                    to={`/programs/ai-salon/${e.id}`}
                    key={e.id}
                    className={`${salonPanel} min-w-0 hover:border-accent-primary`}
                  >
                    {e.posterUrl ? (
                      <img
                        src={e.posterUrl}
                        alt={`${e.title}海报`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="mb-5 max-h-72 w-full rounded-lg object-contain"
                      />
                    ) : null}
                    <h3 className="break-words text-xl font-semibold">
                      {e.title}
                    </h3>
                    <p className="mt-4 text-sm leading-7 text-fg-muted">
                      {salonDate(e.startAt)}
                      <br />
                      {e.location}
                    </p>
                    <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-7">
                      {e.summary}
                    </p>
                    <p className="mt-5 text-sm text-accent-primary">
                      查看活动 →
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-fg-muted">
                {group.title === "即将举行"
                  ? "暂无即将举行的活动"
                  : "暂无往期活动"}
              </p>
            )}
          </section>
        ))
      )}
    </SalonShell>
  );
}
