import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import {
  AcademicFields,
  AcademicSummary,
  SalonBackLink,
  SalonShell,
  salonPanel,
  salonButton,
  salonPrimaryButton,
  useSalonIdentity,
} from "~/components/ai-salon-shared";
import { getCurrentUser } from "~/lib/auth-client";
import {
  salonClient,
  salonDate,
  salonError,
  salonStatus,
  type AcademicInfo,
  type SalonEvent,
  type SalonRecord,
} from "~/lib/ai-salon-client";
import { leaveClient, type CollegeOption } from "~/lib/leave-client";
export function meta() {
  return [{ title: "活动报名 | 吉甲 AI 沙龙 | TARSGO" }];
}
export default function AISalonDetail() {
  const { id = "" } = useParams();
  const { user, authError } = useSalonIdentity();
  const [event, setEvent] = useState<SalonEvent | null>(null);
  const [privateData, setPrivateData] = useState<{
    userId: number;
    profile: AcademicInfo;
    records: SalonRecord[];
    colleges: CollegeOption[];
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
    setEvent(null);
    setError("");
    setNotice("");
    async function load() {
      try {
        const next = await salonClient.event(id);
        if (active) {
          setEvent(next);
          setClock({ now: Date.parse(next.serverNow), receivedAt: Date.now() });
          setError("");
        }
      } catch (e) {
        if (active) setError(salonError(e));
      }
    }
    void load();
    const onFocus = () => {
      void load();
    };
    const timer = window.setInterval(onFocus, 30000);
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [id]);
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    setPersonalError("");
    if (!user) {
      setPrivateData(null);
      return;
    }
    void Promise.all([
      salonClient.profile(),
      salonClient.mine(),
      leaveClient.colleges(),
    ])
      .then(([profile, records, colleges]) => {
        if (active)
          setPrivateData({ userId: user.id, profile, records, colleges });
      })
      .catch((e) => {
        if (active) setPersonalError(salonError(e));
      });
    return () => {
      active = false;
    };
  }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    async function refreshRecords() {
      try {
        const records = await salonClient.mine();
        if (active)
          setPrivateData((current) =>
            current?.userId === user!.id ? { ...current, records } : current,
          );
      } catch (e) {
        if (active) setPersonalError(salonError(e));
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
  }, [user?.id]);
  const data = user && privateData?.userId === user.id ? privateData : null;
  const record = data?.records.find((r) => r.eventId === Number(id));
  const now = clock.now + Math.max(0, tick - clock.receivedAt);
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
      await getCurrentUser({ force: true });
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
        () => salonClient.register(event.id, data.profile),
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
          <p role="status">正在读取活动…</p>
        ) : null
      ) : (
        <>
          <h1 className="break-words text-3xl font-semibold leading-tight sm:text-5xl">
            {event.title}
          </h1>
          <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <section className="min-w-0">
              {event.posterUrl ? (
                <img
                  src={event.posterUrl}
                  alt={`${event.title}海报`}
                  referrerPolicy="no-referrer"
                  className="mb-7 max-h-[650px] w-full rounded-2xl object-contain"
                />
              ) : null}
              <p className="whitespace-pre-wrap break-words leading-8">
                {event.summary}
              </p>
              <dl className="mt-8 space-y-5 border-t border-border-subtle pt-7 text-sm">
                {[
                  [
                    "活动时间",
                    `${salonDate(event.startAt)} — ${salonDate(event.endAt)}（北京时间）`,
                  ],
                  ["地点", event.location],
                  ["报名截止", `${salonDate(event.deadline)}（北京时间）`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-fg-muted">{label}</dt>
                    <dd className="mt-2 break-words leading-6">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section
              className={`${salonPanel} min-w-0`}
              aria-labelledby="salon-registration-heading"
            >
              <h2
                id="salon-registration-heading"
                className="text-xl font-semibold"
              >
                线下报名
              </h2>
              {notice ? (
                <p role="status" className="mt-4 text-accent-primary">
                  {notice}
                </p>
              ) : null}
              {authError || personalError ? (
                <p role="alert" className="mt-4 text-red-500">
                  {authError || personalError}
                </p>
              ) : null}
              {user === undefined ? (
                <p className="mt-5 text-fg-muted">正在读取登录状态…</p>
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
                <p className="mt-5 text-fg-muted">
                  {personalError ? "请刷新重试" : "正在读取报名资料…"}
                </p>
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
                  <AcademicFields
                    value={data.profile}
                    colleges={data.colleges}
                    disabled={busy}
                    onChange={(profile) => setPrivateData({ ...data, profile })}
                  />
                  <p className="break-all text-sm text-fg-muted">
                    邮箱：{user.email}
                  </p>
                  <button className={salonPrimaryButton} disabled={busy}>
                    {busy ? "提交中…" : "提交报名"}
                  </button>
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
            </section>
          </div>
        </>
      )}
    </SalonShell>
  );
}
