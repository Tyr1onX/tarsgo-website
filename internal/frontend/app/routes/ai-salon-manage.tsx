import { useEffect, useState, type FormEvent } from "react";
import {
  AcademicSummary,
  SalonBackLink,
  SalonShell,
  salonPanel,
  salonButton,
  salonPrimaryButton,
  salonField,
  useSalonIdentity,
} from "~/components/ai-salon-shared";
import {
  salonClient,
  salonDate,
  salonError,
  salonStatus,
  type ManagedSalonEvent,
  type SalonRoster,
} from "~/lib/ai-salon-client";
import { ApiError } from "~/lib/api-client";
export function meta() {
  return [{ title: "管理活动 | 吉甲 AI 沙龙 | TARSGO" }];
}
type Draft = {
  id?: number;
  title: string;
  summary: string;
  posterUrl: string;
  startAt: string;
  endAt: string;
  location: string;
  deadline: string;
  capacity: number;
  published: boolean;
  registrationClosed: boolean;
};
const empty: Draft = {
  title: "",
  summary: "",
  posterUrl: "",
  startAt: "",
  endAt: "",
  location: "",
  deadline: "",
  capacity: 50,
  published: false,
  registrationClosed: false,
};
function toBeijing(value: string) {
  return new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 16);
}
function fromBeijing(value: string) {
  return new Date(`${value}:00+08:00`).toISOString();
}
export default function AISalonManage() {
  const { user, authError } = useSalonIdentity();
  const isSuper = user?.role.name === "super_admin";
  const [events, setEvents] = useState<{
    userId: number;
    items: ManagedSalonEvent[];
  } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [roster, setRoster] = useState<{
    userId: number;
    eventId: number;
    title: string;
    data: SalonRoster;
  } | null>(null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    setEvents(null);
    setDraft(null);
    setRoster(null);
    setError("");
    setNotice("");
    if (isSuper && user)
      void salonClient
        .adminList()
        .then((items) => {
          if (active) setEvents({ userId: user.id, items });
        })
        .catch((e) => {
          if (active) setError(salonError(e));
        });
    return () => {
      active = false;
    };
  }, [user?.id, isSuper]);
  const own = user && events?.userId === user.id ? events : null;
  const visibleRoster = user && roster?.userId === user.id ? roster : null;
  async function run(operation: () => Promise<unknown>, message: string) {
    if (!user || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      const items = await salonClient.adminList();
      setEvents({ userId: user.id, items });
      if (visibleRoster && items.some((e) => e.id === visibleRoster.eventId))
        setRoster({
          ...visibleRoster,
          data: await salonClient.roster(visibleRoster.eventId),
        });
      else setRoster(null);
      setNotice(message);
    } catch (e) {
      setError(salonError(e));
    } finally {
      setBusy(false);
    }
  }
  function edit(e: ManagedSalonEvent) {
    setDraft({
      ...e,
      startAt: toBeijing(e.startAt),
      endAt: toBeijing(e.endAt),
      deadline: toBeijing(e.deadline),
    });
    setNotice("");
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    await run(async () => {
      await salonClient.saveEvent({
        ...draft,
        startAt: fromBeijing(draft.startAt),
        endAt: fromBeijing(draft.endAt),
        deadline: fromBeijing(draft.deadline),
      });
      setDraft(null);
    }, "活动已保存");
  }
  async function viewRoster(e: ManagedSalonEvent) {
    if (!user || busy) return;
    setBusy(true);
    setError("");
    try {
      setRoster({
        userId: user.id,
        eventId: e.id,
        title: e.title,
        data: await salonClient.roster(e.id),
      });
      setFilter("all");
    } catch (e) {
      setError(salonError(e));
    } finally {
      setBusy(false);
    }
  }
  async function exportRoster() {
    if (!visibleRoster || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/ai-salon/events/${visibleRoster.eventId}/export`,
        { credentials: "include" },
      );
      if (!response.ok) {
        const body = await response.json();
        throw new ApiError(body.message || "导出失败", response.status);
      }
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `AI沙龙-${visibleRoster.title.replace(/[\\/:*?"<>|]/g, "-")}-名单.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(salonError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SalonShell>
      <SalonBackLink to="/programs/ai-salon">吉甲 AI 沙龙</SalonBackLink>
      <h1 className="mb-8 text-3xl font-semibold sm:text-4xl">管理活动</h1>
      {error || authError ? (
        <p role="alert" className="mb-5 text-red-500">
          {error || authError}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mb-5 text-accent-primary">
          {notice}
        </p>
      ) : null}
      {user === undefined ? (
        <p role="status">正在读取登录状态…</p>
      ) : !isSuper ? (
        <p role="alert">仅超级管理员可管理活动</p>
      ) : (
        <>
          <button
            className={`${salonPrimaryButton} mb-6`}
            disabled={busy}
            onClick={() => setDraft({ ...empty })}
          >
            创建活动
          </button>
          {draft ? (
            <form onSubmit={save} className={`${salonPanel} mb-8 space-y-5`}>
              <h2 className="text-xl font-semibold">
                {draft.id ? "编辑活动" : "新建活动"}
              </h2>
              <fieldset disabled={busy} className="space-y-5">
                <label className="block space-y-2">
                  <span>标题</span>
                  <input
                    required
                    maxLength={200}
                    className={salonField}
                    value={draft.title}
                    onChange={(e) =>
                      setDraft({ ...draft, title: e.target.value })
                    }
                  />
                </label>
                <label className="block space-y-2">
                  <span>简介</span>
                  <textarea
                    required
                    maxLength={10000}
                    rows={5}
                    className={salonField}
                    value={draft.summary}
                    onChange={(e) =>
                      setDraft({ ...draft, summary: e.target.value })
                    }
                  />
                </label>
                <label className="block space-y-2">
                  <span>海报地址（选填）</span>
                  <input
                    type="url"
                    maxLength={1000}
                    placeholder="https://"
                    className={salonField}
                    value={draft.posterUrl}
                    onChange={(e) =>
                      setDraft({ ...draft, posterUrl: e.target.value })
                    }
                  />
                </label>
                <div className="grid gap-5 sm:grid-cols-2">
                  {(
                    [
                      { key: "startAt", label: "开始时间（北京时间）" },
                      { key: "endAt", label: "结束时间（北京时间）" },
                      { key: "deadline", label: "报名截止时间（北京时间）" },
                    ] as const
                  ).map(({ key, label }) => (
                    <label className="block min-w-0 space-y-2" key={key}>
                      <span>{label}</span>
                      <input
                        required
                        type="datetime-local"
                        className={salonField}
                        value={draft[key]}
                        max={
                          key === "deadline"
                            ? draft.startAt || undefined
                            : undefined
                        }
                        onChange={(e) =>
                          setDraft({ ...draft, [key]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                  <label className="block space-y-2">
                    <span>人数上限</span>
                    <input
                      required
                      type="number"
                      min={1}
                      max={100000}
                      className={salonField}
                      value={draft.capacity}
                      onChange={(e) =>
                        setDraft({ ...draft, capacity: Number(e.target.value) })
                      }
                    />
                  </label>
                </div>
                <label className="block space-y-2">
                  <span>地点</span>
                  <input
                    required
                    maxLength={300}
                    className={salonField}
                    value={draft.location}
                    onChange={(e) =>
                      setDraft({ ...draft, location: e.target.value })
                    }
                  />
                </label>
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={draft.published}
                    onChange={(e) =>
                      setDraft({ ...draft, published: e.target.checked })
                    }
                  />
                  发布活动
                </label>
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={draft.registrationClosed}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        registrationClosed: e.target.checked,
                      })
                    }
                  />
                  提前关闭报名
                </label>
              </fieldset>
              <div className="flex gap-3">
                <button className={salonPrimaryButton} disabled={busy}>
                  {busy ? "保存中…" : "保存活动"}
                </button>
                <button
                  type="button"
                  className={salonButton}
                  disabled={busy}
                  onClick={() => setDraft(null)}
                >
                  取消编辑
                </button>
              </div>
            </form>
          ) : null}
          <section className="space-y-4" aria-label="活动管理列表">
            {!own ? (
              !error ? (
                <p role="status">正在读取活动…</p>
              ) : null
            ) : !own.items.length ? (
              <p className="text-fg-muted">暂无活动</p>
            ) : (
              own.items.map((e) => (
                <article className={salonPanel} key={e.id}>
                  <div className="flex flex-wrap justify-between gap-5">
                    <div className="min-w-0">
                      <h2 className="break-words text-xl font-semibold">
                        {e.title}
                      </h2>
                      <p className="mt-3 text-sm text-fg-muted">
                        {salonDate(e.startAt)} ·{" "}
                        {e.published ? "已发布" : "草稿"} ·{" "}
                        {e.registrationClosed ||
                        Date.parse(e.deadline) <= Date.now()
                          ? "报名关闭"
                          : "报名开放"}
                      </p>
                      <p className="mt-2 text-sm text-fg-muted">
                        人数上限 {e.capacity}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-start gap-3">
                      <button
                        className={salonButton}
                        disabled={busy}
                        onClick={() => edit(e)}
                      >
                        编辑
                      </button>
                      <button
                        className={salonButton}
                        disabled={busy}
                        onClick={() => void viewRoster(e)}
                      >
                        名单与统计
                      </button>
                      <button
                        className={salonButton}
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              salonClient.saveEvent({
                                ...e,
                                registrationClosed: !e.registrationClosed,
                              }),
                            e.registrationClosed
                              ? "已重新开放报名"
                              : "已提前关闭报名",
                          )
                        }
                      >
                        {e.registrationClosed ? "重新开放报名" : "提前关闭报名"}
                      </button>
                      <button
                        className={`${salonButton} text-red-500`}
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `删除「${e.title}」及其全部报名、签到记录？此操作无法撤销。`,
                            )
                          )
                            void run(
                              () => salonClient.deleteEvent(e.id),
                              "活动已删除",
                            );
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </section>
          {visibleRoster ? (
            <section
              className={`${salonPanel} mt-8 min-w-0`}
              aria-labelledby="salon-roster-heading"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 id="salon-roster-heading" className="text-xl font-semibold">
                  {visibleRoster.title} · 名单与统计
                </h2>
                <div className="flex flex-wrap gap-3">
                  <button
                    className={salonButton}
                    disabled={busy}
                    onClick={() => void exportRoster()}
                  >
                    导出名单
                  </button>
                  <button
                    className={salonButton}
                    disabled={busy}
                    onClick={() => setRoster(null)}
                  >
                    收起
                  </button>
                </div>
              </div>
              <p className="my-5 text-sm">
                已报名 {visibleRoster.data.registered} · 候补{" "}
                {visibleRoster.data.waitlisted} · 已签到{" "}
                {visibleRoster.data.checkedIn}
              </p>
              <label className="mb-5 block max-w-xs space-y-2">
                <span className="text-sm">筛选名单</span>
                <select
                  aria-label="筛选名单"
                  className={salonField}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">全部</option>
                  <option value="registered">已报名</option>
                  <option value="waitlisted">候补中</option>
                  <option value="checked">已签到</option>
                  <option value="cancelled">已取消</option>
                </select>
              </label>
              <div className="divide-y divide-border-subtle">
                {visibleRoster.data.items
                  .filter(
                    (r) =>
                      filter === "all" ||
                      (filter === "checked"
                        ? r.checkedInAt
                        : r.status === filter),
                  )
                  .map((r, i) => (
                    <details key={i} className="py-4">
                      <summary className="cursor-pointer break-words text-sm">
                        {r.realName} · {r.studentId} · {salonStatus[r.status]} ·{" "}
                        {r.checkedInAt ? "已签到" : "未签到"}
                      </summary>
                      <AcademicSummary value={r} />
                      <p className="mt-4 text-xs text-fg-muted">
                        提交时间：{salonDate(r.submittedAt)}
                        {r.checkedInAt
                          ? ` · 签到时间：${salonDate(r.checkedInAt)}`
                          : ""}
                      </p>
                    </details>
                  ))}
              </div>
              {!visibleRoster.data.items.length ? (
                <p className="text-sm text-fg-muted">暂无报名记录</p>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </SalonShell>
  );
}
