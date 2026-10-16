import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Link } from "react-router";

import type { Route } from "./+types/daily-signal";
import { Navbar } from "~/components/navbar";
import {
  getCachedCurrentUser,
  getOptionalCurrentUser,
  hasKnownAnonymousSession,
  subscribeAccountSessionChange,
  subscribeAuthStateChange,
  type AuthUser,
} from "~/lib/auth-client";
import { apiRequest, ApiError } from "~/lib/api-client";
import {
  addSignalDays,
  formatSignalDate,
  getCurrentBeijingDate,
  getMillisecondsUntilBeijingMidnight,
  getMonthMarkers,
  getSignalCellStatus,
  getSignalYearWeeks,
  type SignalDayStatus,
} from "~/lib/daily-signal-calendar";
import "./daily-signal.css";

const MOODS = ["状态不错", "稳定运行", "有点疲惫", "高负载中", "正在调试"] as const;
type Mood = (typeof MOODS)[number];

interface DailySignalArchive {
  year: number;
  today: string;
  authenticated: boolean;
  signedToday: boolean;
  todayMood: Mood | null;
  days: string[];
  moods: Array<{ date: string; mood: Mood }>;
}

interface DailySignalResult {
  date: string;
  mood: Mood | null;
  created: boolean;
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "每日通信 | TARSGO" },
    { name: "description", content: "向吉甲基地发送一条自愿的每日信号，查看属于自己的年度信号档案。" },
  ];
}

export default function DailySignalPage() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null | undefined>(
    () => getCachedCurrentUser() ?? (hasKnownAnonymousSession() ? null : undefined),
  );
  const [authError, setAuthError] = useState(false);
  const [identityVersion, setIdentityVersion] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedYear, setSelectedYear] = useState(() => Number(getCurrentBeijingDate().slice(0, 4)));
  const [archive, setArchive] = useState<DailySignalArchive | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [archiveError, setArchiveError] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => getCurrentBeijingDate());
  const [focusedDate, setFocusedDate] = useState(() => getCurrentBeijingDate());
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [moodDraft, setMoodDraft] = useState<Mood | null>(null);
  const [editingTodayMood, setEditingTodayMood] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingMood, setSavingMood] = useState(false);
  const [deletingMood, setDeletingMood] = useState(false);
  const [confirmMoodDelete, setConfirmMoodDelete] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [transmitting, setTransmitting] = useState(false);

  const archiveViewportRef = useRef<HTMLDivElement | null>(null);
  const archiveRef = useRef<DailySignalArchive | null>(null);
  const identityRef = useRef<number | null | undefined>(undefined);
  const identityGenerationRef = useRef(0);
  const requestGenerationRef = useRef(0);
  const pendingScrollDateRef = useRef<string | null>(getCurrentBeijingDate());

  useEffect(() => {
    archiveRef.current = archive;
  }, [archive]);

  const applyIdentity = useCallback((user: AuthUser | null) => {
    setCurrentUser(user);
    setAuthError(false);
    const nextID = user?.id ?? null;
    if (identityRef.current !== nextID) {
      identityRef.current = nextID;
      identityGenerationRef.current += 1;
      setArchive(null);
      setMessage(null);
      setEditingTodayMood(false);
      setSelectedDate(getCurrentBeijingDate());
      setFocusedDate(getCurrentBeijingDate());
      pendingScrollDateRef.current = getCurrentBeijingDate();
      setIdentityVersion((version) => version + 1);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    const unsubscribeAuth = subscribeAuthStateChange((user) => {
      if (!disposed) applyIdentity(user);
    });
    const unsubscribeAccountSession = subscribeAccountSessionChange(() => {
      void getOptionalCurrentUser({ force: true })
        .then((user) => {
          if (!disposed) applyIdentity(getCachedCurrentUser() ?? (hasKnownAnonymousSession() ? null : user));
        })
        .catch(() => {
          if (!disposed) setAuthError(true);
        });
    });

    void getOptionalCurrentUser({ force: true })
      .then((user) => {
        if (!disposed) applyIdentity(getCachedCurrentUser() ?? (hasKnownAnonymousSession() ? null : user));
      })
      .catch((error) => {
        if (!disposed) {
          setCurrentUser(null);
          setAuthError(!(error instanceof ApiError && error.status === 401));
        }
      });

    return () => {
      disposed = true;
      unsubscribeAuth();
      unsubscribeAccountSession();
    };
  }, [applyIdentity]);

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++requestGenerationRef.current;
    setArchiveLoading(true);
    setArchiveError("");

    void apiRequest<DailySignalArchive>(`/api/daily-signals?year=${selectedYear}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((result) => {
        if (generation !== requestGenerationRef.current) return;
        setArchive(result);
        setArchiveError("");
      })
      .catch((error) => {
        if (controller.signal.aborted || generation !== requestGenerationRef.current) return;
        setArchiveError("信号档案暂时无法载入，请重试。");
        setArchive(null);
      })
      .finally(() => {
        if (generation === requestGenerationRef.current) setArchiveLoading(false);
      });

    return () => controller.abort();
  }, [selectedYear, identityVersion, refreshVersion]);

  useEffect(() => {
    if (!archive || archive.year !== selectedYear || !pendingScrollDateRef.current) return;
    const date = pendingScrollDateRef.current;
    pendingScrollDateRef.current = null;
    requestAnimationFrame(() => scrollToDate(date, archiveViewportRef.current));
  }, [archive, selectedYear]);

  useEffect(() => {
    const midnightTimer = window.setTimeout(() => {
      const previousToday = archiveRef.current?.today;
      const nextToday = getCurrentBeijingDate();
      if (previousToday && selectedDate === previousToday && selectedYear === Number(nextToday.slice(0, 4))) {
        setSelectedDate(nextToday);
        setFocusedDate(nextToday);
      }
      setRefreshVersion((version) => version + 1);
    }, getMillisecondsUntilBeijingMidnight());

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && archiveRef.current?.today !== getCurrentBeijingDate()) {
        setRefreshVersion((version) => version + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      window.clearTimeout(midnightTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [selectedDate, selectedYear]);

  const year = archive?.year ?? selectedYear;
  const currentYear = Number(archive?.today.slice(0, 4) ?? getCurrentBeijingDate().slice(0, 4));
  const today = archive?.today ?? getCurrentBeijingDate();
  const weeks = useMemo(() => getSignalYearWeeks(year), [year]);
  const monthMarkers = useMemo(() => getMonthMarkers(weeks, year), [weeks, year]);
  const sentDates = useMemo(() => new Set(archive?.days ?? []), [archive?.days]);
  const moodByDate = useMemo(() => new Map((archive?.moods ?? []).map((item) => [item.date, item.mood])), [archive?.moods]);
  const dateForDetail = hoveredDate ?? selectedDate;
  const detailStatus = getStatusForDate(dateForDetail, year, today, sentDates);
  const todaySigned = archive?.signedToday ?? false;
  const authenticated = archive?.authenticated ?? false;
  const canUseTerminal = authenticated && !archiveLoading;

  useEffect(() => {
    if (!todaySigned) {
      setEditingTodayMood(false);
      setMoodDraft(null);
      return;
    }
    if (!editingTodayMood) setMoodDraft(archive?.todayMood ?? null);
  }, [archive?.todayMood, todaySigned, editingTodayMood]);

  const handleSignToday = async () => {
    if (!canUseTerminal || todaySigned || sending) return;
    const identityGeneration = identityGenerationRef.current;
    setSending(true);
    setMessage(null);
    const requestedMood = moodDraft;
    try {
      const result = await apiRequest<DailySignalResult>("/api/daily-signals", {
        method: "POST",
        body: { mood: requestedMood },
      });
      if (identityGeneration !== identityGenerationRef.current) return;
      const selectedYearHasToday = String(year) === result.date.slice(0, 4);
      setArchive((previous) => previous ? {
        ...previous,
        signedToday: true,
        todayMood: result.mood,
        days: selectedYearHasToday && !previous.days.includes(result.date)
          ? [...previous.days, result.date].sort()
          : previous.days,
        moods: selectedYearHasToday && result.mood
          ? [...previous.moods.filter((item) => item.date !== result.date), { date: result.date, mood: result.mood }]
          : previous.moods.filter((item) => item.date !== result.date),
      } : previous);
      setSelectedDate(result.date);
      setFocusedDate(result.date);
      pendingScrollDateRef.current = result.date;
      setTransmitting(result.created);
      if (result.created) {
        setMessage({
          tone: "success",
          text: result.mood === "有点疲惫"
            ? "收到啦。今天可以给自己留一点余地。"
            : "今天的信号收到了。谢谢你又来到这里。",
        });
        window.setTimeout(() => setTransmitting(false), 720);
      } else {
        setMessage({ tone: "success", text: "今天已经见过你啦，今天的记录已为你保留。" });
      }
    } catch (error) {
      if (identityGeneration === identityGenerationRef.current) {
        setMessage({ tone: "error", text: getRequestMessage(error, "信号未能送达，请稍后重试。") });
      }
    } finally {
      setSending(false);
    }
  };

  const handleSaveTodayMood = async () => {
    if (!canUseTerminal || !todaySigned || savingMood) return;
    const identityGeneration = identityGenerationRef.current;
    setSavingMood(true);
    setMessage(null);
    try {
      const result = await apiRequest<DailySignalResult>("/api/daily-signals/today/mood", {
        method: "PATCH",
        body: { mood: moodDraft },
      });
      if (identityGeneration !== identityGenerationRef.current) return;
      setArchive((previous) => previous ? {
        ...previous,
        todayMood: result.mood,
        moods: String(previous.year) === result.date.slice(0, 4)
          ? result.mood
            ? [...previous.moods.filter((item) => item.date !== result.date), { date: result.date, mood: result.mood }]
            : previous.moods.filter((item) => item.date !== result.date)
          : previous.moods,
      } : previous);
      setEditingTodayMood(false);
      setMessage({ tone: "success", text: result.mood ? "今日状态已更新。" : "今日状态已清除，信号仍会保留。" });
    } catch (error) {
      if (identityGeneration === identityGenerationRef.current) {
        setMessage({ tone: "error", text: getRequestMessage(error, "今日状态暂时无法保存，请重试。") });
      }
    } finally {
      setSavingMood(false);
    }
  };

  const handleDeleteHistoricalMood = async () => {
    if (!authenticated || !dateForDetail || deletingMood) return;
    const identityGeneration = identityGenerationRef.current;
    setDeletingMood(true);
    setMessage(null);
    try {
      await apiRequest(`/api/daily-signals/${dateForDetail}/mood`, { method: "DELETE" });
      if (identityGeneration !== identityGenerationRef.current) return;
      setArchive((previous) => previous ? {
        ...previous,
        moods: previous.moods.filter((item) => item.date !== dateForDetail),
      } : previous);
      setConfirmMoodDelete(false);
      setMessage({ tone: "success", text: "状态已删除，签到日期仍会保留。" });
    } catch (error) {
      if (identityGeneration === identityGenerationRef.current) {
        setMessage({ tone: "error", text: getRequestMessage(error, "状态暂时无法删除，请重试。") });
      }
    } finally {
      setDeletingMood(false);
    }
  };

  const chooseYear = (nextYear: number) => {
    if (nextYear === selectedYear) return;
    const nextDate = nextYear === currentYear ? today : `${nextYear}-01-01`;
    setSelectedYear(nextYear);
    setSelectedDate(nextDate);
    setFocusedDate(nextDate);
    setHoveredDate(null);
    setConfirmMoodDelete(false);
    pendingScrollDateRef.current = nextDate;
  };

  const returnToToday = () => {
    const nextYear = currentYear;
    setSelectedYear(nextYear);
    setSelectedDate(today);
    setFocusedDate(today);
    setHoveredDate(null);
    setConfirmMoodDelete(false);
    pendingScrollDateRef.current = today;
    if (nextYear === selectedYear) requestAnimationFrame(() => scrollToDate(today, archiveViewportRef.current));
  };

  const moveGridFocus = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const increments: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: 7,
      ArrowUp: -7,
    };
    const increment = increments[event.key];
    if (!increment) return;
    event.preventDefault();
    const nextDate = addSignalDays(date, increment);
    const nextCell = document.querySelector<HTMLButtonElement>(`[data-signal-date="${nextDate}"]`);
    if (nextCell && !nextCell.disabled) {
      setSelectedDate(nextDate);
      setFocusedDate(nextDate);
      nextCell.focus();
      nextCell.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    }
  };

  const selectedMoodEntry = moodByDate.get(dateForDetail) ?? null;
  const canDeleteSelectedMood = authenticated && selectedMoodEntry && dateForDetail < today;
  const detailCopy = getDateDetailCopy(detailStatus, selectedMoodEntry, authenticated);

  return (
    <div className="public-home daily-signal-page min-h-screen bg-surface-primary text-fg-primary">
      <Navbar currentUser={currentUser} authError={authError} />
      <main className="daily-signal__shell">
        <header className="daily-signal__page-head">
          <div>
            <div className="daily-signal__eyebrow"><span aria-hidden="true" />BASE / DAILY COMMS</div>
            <h1>每日通信</h1>
            <p className="daily-signal__intro">今天也向基地发送一个信号吧。</p>
          </div>
          <div className="daily-signal__date">
            <span>北京时间 · {today ? formatSignalDate(today, { year: undefined, month: "long", day: "numeric", weekday: "long" }) : ""}</span>
            <strong>{today.replaceAll("-", " / ")}</strong>
          </div>
        </header>

        <section className="daily-signal__terminal" aria-labelledby="daily-signal-terminal-title" data-mode={sending ? "sending" : todaySigned ? "signed" : "ready"} data-transmitting={transmitting || undefined}>
          <div className="daily-signal__terminal-main">
            <div className="daily-signal__topline">
              <div className="daily-signal__panel-label"><span className="daily-signal__online-dot" aria-hidden="true" />基地终端 <span aria-hidden="true">/</span> <span className="daily-signal__mono">SIGNAL ONLINE</span></div>
              {authenticated ? <span className="daily-signal__privacy"><LockIcon />仅自己可见</span> : null}
            </div>
            <h2 id="daily-signal-terminal-title">给今天，留一个温柔的落点。</h2>

            {archiveError ? (
              <div className="daily-signal__load-error" role="alert">
                <span>{archiveError}</span>
                <button type="button" onClick={() => setRefreshVersion((version) => version + 1)}>重试</button>
              </div>
            ) : !authenticated ? (
              <div className="daily-signal__visitor-note">
                <p>{archiveLoading ? "正在连接基地终端…" : "你可以浏览信号档案；登录后可发送属于自己的信号。"}</p>
                {!archiveLoading ? <Link to="/login?redirect=%2Fdaily-signal">登录后发送信号</Link> : null}
              </div>
            ) : todaySigned && !editingTodayMood ? (
              <div className="daily-signal__signed-state">
                <div className="daily-signal__mood-heading">今日状态 <span>已保存</span></div>
                <div className="daily-signal__saved-mood">
                  <span className="daily-signal__mood-icon" aria-hidden="true"><MoodGlyph mood={archive?.todayMood ?? null} /></span>
                  <span>{archive?.todayMood ?? "今天没有选择状态"}</span>
                  <button type="button" className="daily-signal__quiet-action" disabled={!canUseTerminal} onClick={() => { setMoodDraft(archive?.todayMood ?? null); setEditingTodayMood(true); setMessage(null); }}>
                    {archive?.todayMood ? "修改状态" : "添加状态"}
                  </button>
                </div>
                <p className="daily-signal__mood-readonly">今天已经见过你啦。</p>
              </div>
            ) : (
              <div className="daily-signal__mood-section">
                <div className="daily-signal__mood-heading">今日状态 <span>可选</span></div>
                <div className="daily-signal__mood-grid" role="group" aria-label="选择今日状态，可不选择">
                  {MOODS.map((mood) => (
                    <button
                      key={mood}
                      type="button"
                      className="daily-signal__mood-option"
                      aria-pressed={moodDraft === mood}
                      disabled={!canUseTerminal || sending || savingMood}
                      onClick={() => setMoodDraft((current) => current === mood ? null : mood)}
                    >
                      <span className="daily-signal__mood-icon" aria-hidden="true"><MoodGlyph mood={mood} /></span>
                      <span>{mood}</span>
                    </button>
                  ))}
                  {editingTodayMood ? (
                    <button type="button" className="daily-signal__clear-mood" aria-pressed={moodDraft === null} onClick={() => setMoodDraft(null)}>
                      不记录状态
                    </button>
                  ) : null}
                </div>
                {editingTodayMood ? (
                  <div className="daily-signal__edit-actions">
                    <button type="button" className="daily-signal__send-button" disabled={savingMood || !canUseTerminal} onClick={() => void handleSaveTodayMood()}>
                      {savingMood ? "保存中…" : "保存状态"}
                    </button>
                    <button type="button" className="daily-signal__quiet-action" disabled={savingMood} onClick={() => { setEditingTodayMood(false); setMoodDraft(archive?.todayMood ?? null); }}>
                      取消
                    </button>
                  </div>
                ) : (
                  <div className="daily-signal__terminal-footer">
                    <button type="button" className="daily-signal__send-button" disabled={!canUseTerminal || sending} onClick={() => void handleSignToday()}>
                      {sending ? "正在发送…" : "发送今日信号"}
                      <ArrowIcon />
                    </button>
                    <span>{archiveLoading ? "正在读取今日状态…" : "不选择状态，也可以直接签到"}</span>
                  </div>
                )}
              </div>
            )}

            {message ? <p className={`daily-signal__message daily-signal__message--${message.tone}`} role={message.tone === "error" ? "alert" : "status"} aria-live="polite">{message.text}</p> : null}
          </div>

          <aside className="daily-signal__transmitter" aria-label="通信终端状态">
            <div className="daily-signal__transmitter-head"><span>TX / 01</span><span>吉甲基地</span></div>
            <div className="daily-signal__orbit" aria-hidden="true"><i className="daily-signal__orbit-outer" /><i className="daily-signal__orbit-mid" /><i className="daily-signal__orbit-inner" /><i className="daily-signal__signal-core"><i /></i><i className="daily-signal__signal-trace" /></div>
            <div className="daily-signal__transmitter-state"><span>TERMINAL STATE</span><strong>{sending ? "正在传输" : archiveLoading ? "连接中" : todaySigned ? "信号已接收" : "等待发送"}</strong></div>
            <div className="daily-signal__readout"><span>CHANNEL</span><strong>BASE—01</strong><span>VISIBILITY</span><strong><i /> PRIVATE</strong></div>
            <span className="daily-signal__terminal-index">GJ / {today.slice(2, 4)}</span>
          </aside>
          <span className="daily-signal__corner daily-signal__corner--top" aria-hidden="true" />
          <span className="daily-signal__corner daily-signal__corner--bottom" aria-hidden="true" />
        </section>

        <section className="daily-signal__archive" aria-labelledby="daily-signal-archive-title">
          <div className="daily-signal__archive-head">
            <div>
              <div className="daily-signal__eyebrow"><span aria-hidden="true" />SIGNAL ARCHIVE</div>
              <div className="daily-signal__archive-title"><h2 id="daily-signal-archive-title">信号档案</h2><span>{year}</span></div>
            </div>
            <div className="daily-signal__archive-actions">
              <label className="daily-signal__year-control"><span className="sr-only">选择档案年份</span>
                <select value={selectedYear} onChange={(event) => chooseYear(Number(event.target.value))} aria-label="选择档案年份">
                  {Array.from({ length: Math.max(1, currentYear - 2000 + 1) }, (_, index) => currentYear - index).map((availableYear) => <option key={availableYear} value={availableYear}>{availableYear} 年</option>)}
                </select>
                <ChevronIcon />
              </label>
              <button type="button" className="daily-signal__today-button" onClick={returnToToday} aria-label="返回今天并定位到今日所在周">
                <ReturnIcon /><span>回到今天</span>
              </button>
            </div>
          </div>

          <div className="daily-signal__heatmap-viewport" ref={archiveViewportRef} tabIndex={0} aria-label={`${year} 年信号档案，可横向滚动查看`}>
            <div className="daily-signal__heatmap-content" style={{ "--week-count": weeks.length } as CSSProperties}>
              <div className="daily-signal__month-labels" aria-hidden="true">
                {monthMarkers.map((marker) => <span key={`${marker.week}-${marker.label}`} style={{ gridColumn: marker.week + 1 }}>{marker.label}</span>)}
              </div>
              <div className="daily-signal__heatmap-body">
                <div className="daily-signal__weekdays" aria-hidden="true"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>
                <div className="daily-signal__heatmap-grid" role="group" aria-label={`${year} 年每日信号`}>
                  {weeks.map((week, weekIndex) => (
                    <div key={`${year}-week-${weekIndex}`} className="daily-signal__week" role="group" aria-label={`第 ${weekIndex + 1} 周`}>
                      {week.map((day) => {
                        const status = getSignalCellStatus(day, today, sentDates);
                        if (status === "outside") return <span key={day.date} className="daily-signal__outside" aria-hidden="true" />;
                        const accessibleName = cellAccessibleName(day.date, status);
                        return (
                          <button
                            key={day.date}
                            type="button"
                            className="daily-signal__cell"
                            data-signal-date={day.date}
                            data-status={status}
                            data-is-today={day.date === today || undefined}
                            aria-label={accessibleName}
                            aria-pressed={selectedDate === day.date}
                            title={accessibleName}
                            disabled={status === "future"}
                            tabIndex={focusedDate === day.date ? 0 : -1}
                            onFocus={() => { setFocusedDate(day.date); setSelectedDate(day.date); setHoveredDate(null); setConfirmMoodDelete(false); }}
                            onClick={() => { setSelectedDate(day.date); setFocusedDate(day.date); setHoveredDate(null); setConfirmMoodDelete(false); }}
                            onPointerEnter={(event) => { if (event.pointerType === "mouse") setHoveredDate(day.date); }}
                            onPointerLeave={(event) => { if (event.pointerType === "mouse") setHoveredDate(null); }}
                            onKeyDown={(event) => moveGridFocus(event, day.date)}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="daily-signal__swipe-hint" aria-hidden="true">← <span>滑动浏览</span> →</div>
          {archiveLoading ? <p className="daily-signal__archive-status" role="status" aria-live="polite">正在读取档案…</p> : null}
          {!archiveLoading && archiveError ? <p className="daily-signal__archive-status daily-signal__archive-status--error" role="alert">档案未更新；当前画面不代表完整记录。</p> : null}
          <div className="daily-signal__archive-bottom">
            <div className="daily-signal__legend" aria-label="图例">
              <span><i className="daily-signal__legend-cell daily-signal__legend-cell--quiet" />未发送</span>
              <span><i className="daily-signal__legend-cell daily-signal__legend-cell--sent" />已发送</span>
              <span><i className="daily-signal__legend-cell daily-signal__legend-cell--today" />今天</span>
              <span><i className="daily-signal__legend-cell daily-signal__legend-cell--future" />未来</span>
            </div>
            <span className="daily-signal__archive-note">{authenticated ? "只展示当前账号的记录" : "登录后查看自己的记录"}</span>
          </div>

          <div className={`daily-signal__date-detail daily-signal__date-detail--${detailStatus}`} aria-live="polite">
            <span className="daily-signal__detail-date">{formatSignalDate(dateForDetail, { year: "numeric" })}</span>
            <span className="daily-signal__detail-divider" aria-hidden="true" />
            <span className="daily-signal__detail-copy">{detailCopy}</span>
            {detailStatus === "sent" ? <span className="daily-signal__detail-tag">信号已发送</span> : detailStatus === "today" ? <span className="daily-signal__detail-tag">今天</span> : null}
            {canDeleteSelectedMood ? (
              <div className="daily-signal__delete-mood">
                {confirmMoodDelete ? (
                  <>
                    <span>删除这条状态？日期仍会保留。</span>
                    <button type="button" disabled={deletingMood} onClick={() => void handleDeleteHistoricalMood()}>{deletingMood ? "删除中…" : "确认删除"}</button>
                    <button type="button" disabled={deletingMood} onClick={() => setConfirmMoodDelete(false)}>取消</button>
                  </>
                ) : <button type="button" onClick={() => setConfirmMoodDelete(true)}>删除状态</button>}
              </div>
            ) : null}
          </div>

          {detailStatus === "sent" && selectedMoodEntry ? <div className="daily-signal__history-mood"><span className="daily-signal__mood-icon" aria-hidden="true"><MoodGlyph mood={selectedMoodEntry} /></span><span>当日状态：{selectedMoodEntry}</span></div> : null}
        </section>
      </main>
    </div>
  );
}

function getStatusForDate(date: string, year: number, today: string, sentDates: ReadonlySet<string>): SignalDayStatus {
  return getSignalCellStatus({ date, weekday: 0, inYear: date.startsWith(`${year}-`) }, today, sentDates);
}

function cellAccessibleName(date: string, status: SignalDayStatus) {
  const label = formatSignalDate(date);
  if (status === "sent") return `${label}，已发送信号`;
  if (status === "today") return `${label}，今天，尚未发送信号`;
  if (status === "future") return `${label}，未来日期`;
  return `${label}，这一天没有留下基地信号`;
}

function getDateDetailCopy(status: SignalDayStatus, mood: Mood | null, authenticated: boolean) {
  if (status === "future") return "这一天还没有到来。";
  if (status === "today") return "今天的方块会在信号送达后亮起。";
  if (status === "sent") {
    if (mood) return authenticated ? `当日状态：${mood}` : "这一天留下过一条基地信号。";
    return "这一天留下过一条基地信号，没有保留状态。";
  }
  return "这一天没有留下基地信号，生活仍在继续。";
}

function getRequestMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.status === 401) return "登录状态已结束，请重新登录后再试。";
  if (error instanceof ApiError && error.status === 429) return "请求有些频繁，请稍后再试。";
  return fallback;
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollToDate(date: string, viewport: HTMLDivElement | null) {
  if (!viewport) return;
  const target = viewport.querySelector<HTMLButtonElement>(`[data-signal-date="${date}"]`);
  if (!target) return;
  const targetRect = target.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  const targetCenter = viewport.scrollLeft + targetRect.left - viewportRect.left + targetRect.width / 2;
  const left = Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, targetCenter - viewport.clientWidth * 0.58));
  viewport.scrollTo({ left, behavior: reducedMotion() ? "auto" : "smooth" });
}

function MoodGlyph({ mood }: { mood: Mood | null }) {
  if (mood === "状态不错") return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2.8v2m0 14.4v2M4.9 4.9l1.5 1.5m11.2 11.2 1.5 1.5M2.8 12h2m14.4 0h2M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5" /></svg>;
  if (mood === "稳定运行") return <svg viewBox="0 0 24 24"><path d="M3 12h4l2.2-5 3.7 10 2.2-5H21" /></svg>;
  if (mood === "有点疲惫") return <svg viewBox="0 0 24 24"><path d="M18.8 14.8A7.6 7.6 0 0 1 9.2 5.2a7.8 7.8 0 1 0 9.6 9.6Z" /><path d="M17 4v3m-1.5-1.5h3" /></svg>;
  if (mood === "高负载中") return <svg viewBox="0 0 24 24"><path d="M4 18.5h16M6.5 15l3-3 2.3 1.8 5.7-6.3" /><path d="M17.5 7.5h2v2" /></svg>;
  if (mood === "正在调试") return <svg viewBox="0 0 24 24"><path d="M4 7h8m4 0h4M4 17h4m4 0h8" /><circle cx="14" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>;
  return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" /><path d="M12 9v3l2 1" /></svg>;
}

function LockIcon() { return <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.25" y="7" width="9.5" height="7" rx="1.6" /><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" /></svg>; }
function ArrowIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13m-5-5 5 5-5 5" /></svg>; }
function ChevronIcon() { return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>; }
function ReturnIcon() { return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.2 6A5.5 5.5 0 1 0 14 9M13 2.5v3.8H9.2" /></svg>; }
