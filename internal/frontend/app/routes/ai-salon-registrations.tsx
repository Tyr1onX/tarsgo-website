import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  AcademicSummary,
  SalonBackLink,
  SalonShell,
  salonPanel,
  salonPrimaryButton,
  useSalonIdentity,
} from "~/components/ai-salon-shared";
import {
  salonClient,
  salonDate,
  salonError,
  salonStatus,
  type SalonRecord,
} from "~/lib/ai-salon-client";
export function meta() {
  return [{ title: "我的报名 | 吉甲 AI 沙龙 | TARSGO" }];
}
export default function AISalonRegistrations() {
  const { user, authError } = useSalonIdentity();
  const [data, setData] = useState<{
    userId: number;
    records: SalonRecord[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    if (user)
      void salonClient.mine().then((records) => {
        if (active) setData({ userId: user.id, records });
      })
        .catch((e) => {
          if (active) setError(salonError(e));
        });
    return () => {
      active = false;
    };
  }, [user?.id]);
  const own = user && data?.userId === user.id ? data : null;
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
        <div className="max-w-3xl">
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

        </div>
      )}
    </SalonShell>
  );
}
