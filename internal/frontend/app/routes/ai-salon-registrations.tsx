import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  AcademicFields,
  AcademicSummary,
  SalonBackLink,
  SalonShell,
  salonPanel,
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
  type SalonRecord,
} from "~/lib/ai-salon-client";
import { leaveClient, type CollegeOption } from "~/lib/leave-client";
export function meta() {
  return [{ title: "我的报名 | 吉甲 AI 沙龙 | TARSGO" }];
}
export default function AISalonRegistrations() {
  const { user, authError } = useSalonIdentity();
  const [data, setData] = useState<{
    userId: number;
    records: SalonRecord[];
    profile: AcademicInfo;
    colleges: CollegeOption[];
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    setNotice("");
    if (user)
      void Promise.all([
        salonClient.mine(),
        salonClient.profile(),
        leaveClient.colleges(),
      ])
        .then(([records, profile, colleges]) => {
          if (active) setData({ userId: user.id, records, profile, colleges });
        })
        .catch((e) => {
          if (active) setError(salonError(e));
        });
    return () => {
      active = false;
    };
  }, [user?.id]);
  const own = user && data?.userId === user.id ? data : null;
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!own || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const profile = await salonClient.saveProfile(own.profile);
      setData({ ...own, profile });
      setNotice("个人资料已保存");
      await getCurrentUser({ force: true });
    } catch (e) {
      setError(salonError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SalonShell>
      <SalonBackLink to="/programs/ai-salon">吉甲 AI 沙龙</SalonBackLink>
      <h1 className="mb-8 text-3xl font-semibold sm:text-4xl">我的报名</h1>
      {error || authError ? (
        <p className="mb-5 text-red-500" role="alert">
          {error || authError}
        </p>
      ) : null}
      {user === undefined ? (
        <p role="status">正在读取登录状态…</p>
      ) : !user ? (
        <Link
          className={salonPrimaryButton}
          to="/login?redirect=%2Fprograms%2Fai-salon%2Fregistrations"
        >
          登录查看
        </Link>
      ) : !own ? (
        !error ? (
          <p role="status">正在读取报名记录…</p>
        ) : null
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <section className="min-w-0 space-y-5" aria-label="报名记录">
            {own.records.length ? (
              own.records.map((r, index) => (
                <article className={salonPanel} key={`${r.eventId}-${index}`}>
                  <Link
                    className="text-xl font-semibold hover:text-accent-primary"
                    to={`/programs/ai-salon/${r.eventId}`}
                  >
                    {r.title}
                  </Link>
                  <p className="mt-3 text-sm text-fg-muted">
                    {salonDate(r.startAt)}
                  </p>
                  <p className="mt-4 font-medium text-accent-primary">
                    {salonStatus[r.status]} ·{" "}
                    {r.checkedInAt
                      ? `已签到 ${salonDate(r.checkedInAt)}`
                      : "未签到"}
                  </p>
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm text-fg-muted">
                      报名信息
                    </summary>
                    <AcademicSummary value={r} />
                  </details>
                </article>
              ))
            ) : (
              <p className="text-fg-muted">暂无报名记录</p>
            )}
          </section>
          <section className={`${salonPanel} min-w-0`}>
            <h2 className="mb-6 text-xl font-semibold">个人资料</h2>
            <form className="space-y-5" onSubmit={save}>
              <AcademicFields
                value={own.profile}
                colleges={own.colleges}
                disabled={busy}
                onChange={(profile) => setData({ ...own, profile })}
              />
              <p className="break-all text-sm text-fg-muted">
                邮箱：{user.email}
              </p>
              {notice ? (
                <p role="status" className="text-sm text-accent-primary">
                  {notice}
                </p>
              ) : null}
              <button className={salonPrimaryButton} disabled={busy}>
                {busy ? "保存中…" : "保存个人资料"}
              </button>
            </form>
          </section>
        </div>
      )}
    </SalonShell>
  );
}
