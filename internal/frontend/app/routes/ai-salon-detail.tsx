import ReactMarkdown from "react-markdown";
import { useEffect, useState, type FormEvent } from "react";
import { BrandLoader } from "~/components/brand-loader";
import { SiteLogo } from "~/components/site-logo";
import { Notify } from "~/components/notify";
import { Link, useParams } from "react-router";
import {
  AcademicSummary,
  SalonBackLink,
  SalonShell,
  salonButton,
  salonPrimaryButton,
  useSalonIdentity,
} from "~/components/ai-salon-shared";
import { accountProfilePath, getAccountProfile, profileComplete, type AccountProfile } from "~/lib/account-profile";
import {
  salonClient,
  getCachedSalonEvent,
  salonDate,
  salonError,
  salonStatus,
  type SalonEvent,
  type SalonRecord,
} from "~/lib/ai-salon-client";
import { salonEventStatus } from "~/lib/salon-event-status";
import { salonContent } from "~/lib/salon-content";
import { trackSalonRegistrationClick } from "~/lib/salon-registration-click";
import "~/salon.css";

export function meta() {
  return [{ title: "活动详情 | 吉甲 AI 沙龙 | TARSGO" }];
}
export default function AISalonDetail() {
  const { id = "" } = useParams();
  const { user, authError } = useSalonIdentity();
  const [event, setEvent] = useState<SalonEvent | null>(() => getCachedSalonEvent(id));
  const [privateData, setPrivateData] = useState<{
    userId: number;
    profile: AccountProfile;
    records: SalonRecord[];
  } | null>(null);
  const [error, setError] = useState("");
  const [personalError, setPersonalError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState({
    now: Date.now(),
    receivedAt: Date.now(),
  });
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    let active = true;
    let inFlight = false;
    let lastRequestedAt = 0;
    setEvent(getCachedSalonEvent(id));
    setError("");
    setNotice("");
    async function load() {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      lastRequestedAt = Date.now();
      try {
        const next = await salonClient.event(id);
        if (active) {
          setEvent(next);
          setClock({ now: Date.parse(next.serverNow), receivedAt: Date.now() });
          setError("");
        }
      } catch (e) {
        if (active) setError(salonError(e));
      } finally {
        inFlight = false;
      }
    }
    void load();
    const onFocus = () => {
      if (Date.now() - lastRequestedAt >= 30_000) void load();
    };
    const timer = window.setInterval(onFocus, 30_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [id]);
  useEffect(() => {
    if (!event) return;
    const now = clock.now + Math.max(0, Date.now() - clock.receivedAt);
    const nextBoundary = [event.deadline, event.startAt, event.endAt]
      .map(Date.parse).filter((time) => time > now).sort((a, b) => a - b)[0];
    if (nextBoundary === undefined) return;
    const timer = window.setTimeout(() => setTick(Date.now()), Math.min(nextBoundary - now + 50, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [event, clock, tick]);
  useEffect(() => {
    let active = true;
    setPersonalError("");
    if (!user || !event || event.online) {
      setPrivateData(null);
      return;
    }
    void Promise.all([
      getAccountProfile(),
      salonClient.mine(),
    ])
      .then(([profile, records]) => {
        if (active)
          setPrivateData({ userId: user.id, profile, records });
      })
      .catch((e) => {
        if (active) setPersonalError(salonError(e));
      });
    return () => {
      active = false;
    };
  }, [user?.id, event?.id, event?.online]);
  useEffect(() => {
    if (!user || !event || event.online) return;
    let active = true;
    let inFlight = false;
    let lastRequestedAt = Date.now();
    async function refreshRecords() {
      if (inFlight || document.visibilityState === "hidden" || Date.now() - lastRequestedAt < 30_000) return;
      inFlight = true;
      lastRequestedAt = Date.now();
      try {
        const records = await salonClient.mine();
        if (active)
          setPrivateData((current) =>
            current?.userId === user!.id ? { ...current, records } : current,
          );
      } catch (e) {
        if (active) setPersonalError(salonError(e));
      } finally {
        inFlight = false;
      }
    }
    const timer = window.setInterval(() => void refreshRecords(), 30000);
    const onFocus = () => void refreshRecords();
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [user?.id, event?.id, event?.online]);
  const data = user && privateData?.userId === user.id ? privateData : null;
  const record = data?.records.find((r) => r.eventId === Number(id));
  const now = clock.now + Math.max(0, tick - clock.receivedAt);
  const content = salonContent(event?.summary ?? "", Boolean(event?.online));
  const registrationOpen = Boolean(
    event?.registrationOpen && now < Date.parse(event.deadline),
  );
  const canCheckIn = Boolean(
    event && now >= Date.parse(event.startAt) && now < Date.parse(event.endAt),
  );
  async function action(operation: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      const next = await salonClient.event(id);
      setEvent(next);
      setClock({ now: Date.parse(next.serverNow), receivedAt: Date.now() });
      const records = await salonClient.mine();
      setPrivateData((current) =>
        current && current.userId === user?.id
          ? { ...current, records }
          : current,
      );
      setNotice(message);
    } catch (e) {
      setError(salonError(e));
    } finally {
      setBusy(false);
    }
  }
  function register(e: FormEvent) {
    e.preventDefault();
    if (event && data)
      void action(
        () => salonClient.register(event.id),
        "报名已提交",
      );
  }
  return (
    <SalonShell>
      <SalonBackLink to="/programs/ai-salon">吉甲 AI 沙龙</SalonBackLink>
      {error ? (
        <p role="alert" className="mb-5 text-red-500">
          {error}
        </p>
      ) : null}
      {!event ? (
        !error ? (
          <BrandLoader label="正在加载活动" />
        ) : null
      ) : (
        <>
          <p className="text-sm text-accent-primary">{salonEventStatus(event, now)}</p>
          <div className="salon-partners" aria-label="吉甲大师与 JLUAI 社区联动">
            <SiteLogo className="salon-partners__team-logo" />
            <span className="salon-partners__cross" aria-hidden="true">×</span>
            <a className="salon-partners__community" href="https://jluai.cn/" target="_blank" rel="noopener noreferrer">
              <img src="/assets/images/Community/jluai.png" alt="" width="36" height="36" />
              <span>JLUAI 社区</span>
            </a>
          </div>
          <h1 className="salon-detail-heading">
            {event.title}
          </h1>
          <div className={`salon-detail-layout${event.online ? " salon-detail-layout--online" : ""}`}>
            <section className="salon-detail-content" aria-label="活动介绍">
              {event.posterUrl ? (
                <img
                  src={event.posterUrl}
                  alt={`${event.title}海报`}
                  referrerPolicy="no-referrer"
                  className="salon-detail-poster"
                />
              ) : null}
              {event.summary ? <div className="salon-detail-description"><h2>活动内容</h2>{event.online ? <ReactMarkdown skipHtml components={{
                a: ({ children, href }) => <a href={href} target={href?.startsWith("https://") ? "_blank" : undefined} rel="noopener noreferrer">{children}</a>,
                img: ({ src, alt }) => <img src={src} alt={alt ?? ""} loading="lazy" />,
              }}>{content.summary}</ReactMarkdown> : <p>{event.summary}</p>}</div> : null}
              <section className="salon-community-feature" aria-labelledby="salon-pixel-title">
                <a className="salon-community-feature__preview" href="https://jlu.online/" target="_blank" rel="noopener noreferrer" aria-label="打开像素吉大地图">
                  <img src="/assets/images/Community/pixel-jlu-preview.jpg" alt="像素吉大校园地图，展示前卫南区的建筑和地标" loading="lazy" width="1120" height="255" />
                </a>
                <p className="salon-community-feature__credit">截图来源：像素吉大 · 地图数据 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap 贡献者</a></p>
                <h2 id="salon-pixel-title">像素吉大</h2>
                <p>在像素画风的校园地图里，探索熟悉的建筑与地标。</p>
                <div className="salon-community-feature__links">
                  <a href="https://jlu.online/" target="_blank" rel="noopener noreferrer">探索像素吉大 ↗</a>
                  <a href="https://jluai.cn/" target="_blank" rel="noopener noreferrer">进入 JLUAI 社区 ↗</a>
                </div>
              </section>
            </section>
            <section
              className="salon-registration"
              aria-labelledby="salon-registration-heading"
            >
              <h2
                id="salon-registration-heading"
                className="text-xl font-semibold"
              >
                {event.online ? "线上参与" : "线下报名"}
              </h2>
              <dl className="salon-detail-facts">
                {[
                  [
                    "活动时间",
                    `${salonDate(event.startAt)} — ${salonDate(event.endAt)}（北京时间）`,
                  ],
                  ["地点", event.location],
                  ...(!event.online ? [["报名截止", `${salonDate(event.deadline)}（北京时间）`]] : []),
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              {event.online ? (
                <div className="space-y-4">
                  {content.action ? <a className={`${salonPrimaryButton} w-full`} href={content.action.href} target="_blank" rel="noopener noreferrer" onClick={() => trackSalonRegistrationClick(event.id)} onAuxClick={(e) => { if (e.button === 1) trackSalonRegistrationClick(event.id); }}>{content.action.label}</a> : null}
                  {now >= Date.parse(event.endAt) ? <p className="text-fg-muted">活动已结束</p> : event.meetingUrl ? (
                    <a className={`${content.action ? salonButton : salonPrimaryButton} w-full`} href={event.meetingUrl} target="_blank" rel="noopener noreferrer">进入腾讯会议</a>
                  ) : <p role="status" className="text-fg-muted">腾讯会议链接待公布，请于活动前回到本页查看。</p>}
                  <p className="text-sm text-fg-muted">无需注册或登录吉甲大师官网。</p>
                </div>
              ) : <>
              {notice ? <Notify tone="success" message={notice} onClose={() => setNotice("")} /> : null}
              {authError || personalError ? (
                <p role="alert" className="mt-4 text-red-500">
                  {authError || personalError}
                </p>
              ) : null}
              {user === undefined ? (
                <BrandLoader label="正在读取登录状态" size="sm" />
              ) : !user ? (
                <div className="mt-5">
                  <p className="mb-5 text-sm text-fg-muted">
                    {registrationOpen ? "登录后报名" : "报名已关闭"}
                  </p>
                  <Link
                    className={salonPrimaryButton}
                    to={`/login?redirect=${encodeURIComponent(`/programs/ai-salon/${id}`)}`}
                  >
                    登录
                  </Link>
                </div>
              ) : !data ? (
                personalError ? <p className="mt-5 text-fg-muted">请刷新重试</p> : <BrandLoader label="正在读取报名资料" size="sm" />
              ) : record && record.status !== "cancelled" ? (
                <>
                  <p className="mt-5 text-lg font-semibold text-accent-primary">
                    {salonStatus[record.status]}
                  </p>
                  <p className="mt-3 text-sm">
                    {record.checkedInAt
                      ? `已签到 · ${salonDate(record.checkedInAt)}`
                      : "未签到"}
                  </p>
                  <AcademicSummary value={record} />
                  <div className="mt-6 flex flex-wrap gap-3">
                    {record.status === "registered" && !record.checkedInAt ? (
                      <button
                        className={salonPrimaryButton}
                        disabled={busy || !canCheckIn}
                        onClick={() =>
                          void action(
                            () => salonClient.checkIn(event.id),
                            "签到成功",
                          )
                        }
                      >
                        {canCheckIn
                          ? "签到"
                          : now < Date.parse(event.startAt)
                            ? "活动开始后可签到"
                            : "签到已结束"}
                      </button>
                    ) : null}
                    <button
                      className={salonButton}
                      disabled={busy || now >= Date.parse(event.deadline)}
                      onClick={() => {
                        if (window.confirm("确认取消本场报名？"))
                          void action(
                            () => salonClient.cancel(event.id),
                            "已取消报名",
                          );
                      }}
                    >
                      取消报名
                    </button>
                  </div>
                </>
              ) : registrationOpen ? (
                <form className="mt-6 space-y-5" onSubmit={register}>
                  {record ? (
                    <p className="text-sm text-fg-muted">已取消，可重新报名</p>
                  ) : null}
                  {profileComplete(data.profile) ? <>
                    <AcademicSummary value={data.profile} />
                    <button className={`${salonPrimaryButton} w-full`} disabled={busy}>{busy ? "提交中…" : "确认报名"}</button>
                  </> : <p className="text-sm text-fg-muted">请先补齐个人资料</p>}
                  <Link className={salonButton} to={accountProfilePath(user.id, `/programs/ai-salon/${id}`)}>{profileComplete(data.profile) ? "修改个人资料" : "完善个人资料"}</Link>
                </form>
              ) : (
                <p className="mt-5 text-fg-muted">
                  报名已关闭{record?.status === "cancelled" ? " · 已取消" : ""}
                </p>
              )}
              {user ? (
                <Link
                  className="mt-6 inline-block text-sm text-accent-primary"
                  to="/programs/ai-salon/registrations"
                >
                  我的报名 →
                </Link>
              ) : null}
              </>}
            </section>
          </div>
        </>
      )}
    </SalonShell>
  );
}
