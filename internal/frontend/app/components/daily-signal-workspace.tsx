import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { AuthUser } from "~/lib/auth-client";
import { apiRequest, ApiError } from "~/lib/api-client";
import { getDailySignalReply, type DailySignalMood } from "~/lib/daily-signal-reply";
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
import { scrollHeatmapCellIntoView, scrollHeatmapToDate } from "~/lib/daily-signal-scroll";
import "../routes/daily-signal.css";

const MOODS: readonly DailySignalMood[] = ["状态不错", "稳定运行", "有点疲惫", "高负载中", "正在调试"];
type Mood = DailySignalMood;

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

const pendingArchiveRequests = new Map<string, Promise<DailySignalArchive>>();

function requestArchive(accountId: number, year: number, refreshVersion: number) {
  const key = `${accountId}:${year}:${refreshVersion}`;
  const pending = pendingArchiveRequests.get(key);
  if (pending) return pending;

  const request = apiRequest<DailySignalArchive>(`/api/daily-signals?year=${year}`, {
    cache: "no-store",
  }).finally(() => {
    if (pendingArchiveRequests.get(key) === request) pendingArchiveRequests.delete(key);
  });
  pendingArchiveRequests.set(key, request);
  return request;
}

export function DailySignalWorkspace({ currentUser }: { currentUser: AuthUser }) {
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedYear, setSelectedYear] = useState(() => Number(getCurrentBeijingDate().slice(0, 4)));
  const [archive, setArchive] = useState<DailySignalArchive | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [archiveError, setArchiveError] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [focusedDate, setFocusedDate] = useState(() => getCurrentBeijingDate());
  const [moodDraft, setMoodDraft] = useState<Mood | null>(null);
  const [editingTodayMood, setEditingTodayMood] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingMood, setSavingMood] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [transmitting, setTransmitting] = useState(false);

  const archiveViewportRef = useRef<HTMLDivElement | null>(null);
  const archiveRef = useRef<DailySignalArchive | null>(null);
  const requestGenerationRef = useRef(0);
  const pendingScrollDateRef = useRef<string | null>(getCurrentBeijingDate());

  useEffect(() => {
    archiveRef.current = archive;
  }, [archive]);

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    let active = true;
    setArchiveLoading(true);
    setArchiveError("");

    void requestArchive(currentUser.id, selectedYear, refreshVersion)
      .then((result) => {
        if (!active || generation !== requestGenerationRef.current) return;
        setArchive(result);
        setArchiveError("");
      })
      .catch((error) => {
        if (!active || generation !== requestGenerationRef.current) return;
        setArchiveError("信号档案暂时无法载入，请重试。");
        setArchive(null);
      })
      .finally(() => {
        if (active && generation === requestGenerationRef.current) setArchiveLoading(false);
      });

    return () => { active = false; };
  }, [currentUser.id, selectedYear, refreshVersion]);

  useEffect(() => {
    if (!archive || archive.year !== selectedYear || !pendingScrollDateRef.current) return;
    const date = pendingScrollDateRef.current;
    pendingScrollDateRef.current = null;
    requestAnimationFrame(() => scrollHeatmapToDate(date, archiveViewportRef.current, reducedMotion() ? "auto" : "smooth"));
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
  const detailStatus = selectedDate ? getStatusForDate(selectedDate, year, today, sentDates) : null;
  const todaySigned = archive?.signedToday ?? false;
  const authenticated = archive?.authenticated ?? false;
  const canUseTerminal = authenticated && !archiveLoading;
  const todayReply = todaySigned
    ? getDailySignalReply(currentUser.id, archive?.today ?? today, archive?.todayMood ?? null)
    : null;
  const historicalReply = selectedDate && detailStatus === "sent" && selectedDate !== today && authenticated
    ? getDailySignalReply(currentUser.id, selectedDate, moodByDate.get(selectedDate) ?? null)
    : null;
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
    setSending(true);
    setMessage(null);
    const requestedMood = moodDraft;
    try {
      const result = await apiRequest<DailySignalResult>("/api/daily-signals", {
        method: "POST",
        body: { mood: requestedMood },
      });
      const selectedYearHasToday = String(year) === result.date.slice(0, 4);
      setArchive((previous) => previous ? {
        ...previous,
        today: result.date,
        signedToday: true,
        todayMood: result.mood,
        days: selectedYearHasToday && !previous.days.includes(result.date)
          ? [...previous.days, result.date].sort()
          : previous.days,
        moods: selectedYearHasToday && result.mood
          ? [...previous.moods.filter((item) => item.date !== result.date), { date: result.date, mood: result.mood }]
          : previous.moods.filter((item) => item.date !== result.date),
      } : previous);
      setFocusedDate(result.date);
      pendingScrollDateRef.current = result.date;
      setTransmitting(result.created);
      setMessage({ tone: "success", text: getDailySignalReply(currentUser.id, result.date, result.mood) });
      if (result.created) window.setTimeout(() => setTransmitting(false), 720);
    } catch (error) {
      setMessage({ tone: "error", text: getRequestMessage(error, "信号未能送达，请稍后重试。") });
    } finally {
      setSending(false);
    }
  };

  const handleSaveTodayMood = async () => {
    if (!canUseTerminal || !todaySigned || savingMood) return;
    setSavingMood(true);
    setMessage(null);
    try {
      const result = await apiRequest<DailySignalResult>("/api/daily-signals/today/mood", {
        method: "PATCH",
        body: { mood: moodDraft },
      });
      setArchive((previous) => previous ? {
        ...previous,
        today: result.date,
        todayMood: result.mood,
        moods: String(previous.year) === result.date.slice(0, 4)
          ? result.mood
            ? [...previous.moods.filter((item) => item.date !== result.date), { date: result.date, mood: result.mood }]
            : previous.moods.filter((item) => item.date !== result.date)
          : previous.moods,
      } : previous);
      setEditingTodayMood(false);
      setMessage({ tone: "success", text: getDailySignalReply(currentUser.id, result.date, result.mood) });
    } catch (error) {
      setMessage({ tone: "error", text: getRequestMessage(error, "今日状态暂时无法保存，请重试。") });
    } finally {
      setSavingMood(false);
    }
  };

  const chooseYear = (nextYear: number) => {
    if (nextYear === selectedYear) return;
    const nextDate = nextYear === currentYear ? today : `${nextYear}-01-01`;
    setSelectedYear(nextYear);
    setFocusedDate(nextDate);
    setSelectedDate(null);
    pendingScrollDateRef.current = nextDate;
  };

  const returnToToday = () => {
    const nextYear = currentYear;
    setSelectedYear(nextYear);
    setSelectedDate(null);
    setFocusedDate(today);
    if (nextYear === selectedYear) {
      pendingScrollDateRef.current = null;
      requestAnimationFrame(() => scrollHeatmapToDate(today, archiveViewportRef.current, reducedMotion() ? "auto" : "smooth"));
    } else {
      pendingScrollDateRef.current = today;
    }
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
      setFocusedDate(nextDate);
      nextCell.focus({ preventScroll: true });
      scrollHeatmapCellIntoView(nextCell, archiveViewportRef.current, reducedMotion() ? "auto" : "smooth");
    }
  };

  const selectedMoodEntry = selectedDate ? moodByDate.get(selectedDate) ?? null : null;
  const detailCopy = historicalReply ?? (detailStatus ? getDateDetailCopy(detailStatus) : "");

  return (
    <section id="daily-signal" className="daily-signal-page daily-signal-page--workspace" aria-labelledby="daily-signal-title">
      <header className="daily-signal__section-head">
        <div>
          <p className="daily-signal__eyebrow"><span aria-hidden="true" />今日通信</p>
          <p className="daily-signal__date">北京时间 · {formatSignalDate(today, { year: undefined, month: "long", day: "numeric", weekday: "long" })}</p>
        </div>
        <span className="daily-signal__privacy"><LockIcon />仅自己可见</span>
      </header>

      <section className="daily-signal__terminal" aria-labelledby="daily-signal-title" aria-busy={archiveLoading} data-mode={sending ? "sending" : todaySigned ? "signed" : "ready"} data-transmitting={transmitting || undefined}>
        <div className="daily-signal__terminal-main">
          <h2 id="daily-signal-title" className="sr-only">今日通信</h2>

          {archiveLoading ? (
            <p className="daily-signal__loading" role="status" aria-live="polite">正在读取今天的状态…</p>
          ) : archiveError || !authenticated ? (
            <div className="daily-signal__load-error" role="alert">
              <span>{archiveError || "登录状态已变化，请重新登录后再试。"}</span>
              <button type="button" onClick={() => setRefreshVersion((version) => version + 1)}>重试</button>
            </div>
          ) : todaySigned && !editingTodayMood ? (
            <div className="daily-signal__signed-state">
              <span className="daily-signal__signed-label"><span className="daily-signal__online-dot" aria-hidden="true" />今日信号已送达</span>
              <div className="daily-signal__saved-mood">
                <span className="daily-signal__mood-icon" aria-hidden="true"><MoodGlyph mood={archive?.todayMood ?? null} /></span>
                <span>{archive?.todayMood ?? "未记录状态"}</span>
                <button type="button" className="daily-signal__quiet-action" disabled={!canUseTerminal} onClick={() => { setMoodDraft(archive?.todayMood ?? null); setEditingTodayMood(true); setMessage(null); }}>
                  {archive?.todayMood ? "修改状态" : "添加状态"}
                </button>
              </div>
            </div>
          ) : (
            <div className="daily-signal__mood-section">
              <div className="daily-signal__mood-heading">{editingTodayMood ? "修改今日状态" : "今天的状态"}<span>可选</span></div>
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
                  <button type="button" className="daily-signal__clear-mood" aria-pressed={moodDraft === null} disabled={savingMood} onClick={() => setMoodDraft(null)}>
                    不记录状态
                  </button>
                ) : null}
              </div>
              <div className="daily-signal__terminal-footer">
                <button
                  type="button"
                  className="daily-signal__send-button"
                  disabled={!canUseTerminal || sending || savingMood}
                  onClick={() => void (editingTodayMood ? handleSaveTodayMood() : handleSignToday())}
                >
                  {editingTodayMood ? savingMood ? "保存中…" : "保存状态" : sending ? "正在发送…" : "发送今日信号"}
                  <ArrowIcon />
                </button>
                {editingTodayMood ? (
                  <button type="button" className="daily-signal__quiet-action" disabled={savingMood} onClick={() => { setEditingTodayMood(false); setMoodDraft(archive?.todayMood ?? null); }}>
                    取消
                  </button>
                ) : <span>不选择状态，也可以直接签到</span>}
              </div>
            </div>
          )}

          {todaySigned && todayReply ? (
            <p className="daily-signal__reply-copy" aria-live="polite"><span aria-hidden="true">基地回信</span>{todayReply}</p>
          ) : null}
          {message ? <p className={`daily-signal__message daily-signal__message--${message.tone}${message.tone === "success" && message.text === todayReply ? " sr-only" : ""}`} role={message.tone === "error" ? "alert" : "status"} aria-live="polite">{message.text}</p> : null}
        </div>
        <div className="daily-signal__orbit" aria-hidden="true"><i className="daily-signal__orbit-outer" /><i className="daily-signal__orbit-mid" /><i className="daily-signal__orbit-inner" /><i className="daily-signal__signal-ripple" /><i className="daily-signal__signal-core"><i /></i><i className="daily-signal__signal-trace" /></div>
      </section>

      <section className="daily-signal__archive" aria-labelledby="daily-signal-archive-title">
        <div className="daily-signal__archive-head">
          <div className="daily-signal__archive-title"><h2 id="daily-signal-archive-title">年度信号</h2><span>{year}</span></div>
          <div className="daily-signal__archive-actions">
            <label className="daily-signal__year-control"><span className="sr-only">选择档案年份</span>
              <select value={selectedYear} onChange={(event) => chooseYear(Number(event.target.value))} aria-label="选择档案年份">
                {Array.from({ length: Math.max(1, currentYear - 2000 + 1) }, (_, index) => currentYear - index).map((availableYear) => <option key={availableYear} value={availableYear}>{availableYear} 年</option>)}
              </select>
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
                          aria-current={day.date === today ? "date" : undefined}
                          aria-pressed={selectedDate === day.date}
                          disabled={status === "future"}
                          tabIndex={focusedDate === day.date ? 0 : -1}
                          onFocus={() => setFocusedDate(day.date)}
                          onClick={() => { setSelectedDate(day.date); setFocusedDate(day.date); }}
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
          <span className="daily-signal__archive-note">情绪记录仅自己可见</span>
        </div>

        {selectedDate && detailStatus ? (
          <div className={`daily-signal__date-detail daily-signal__date-detail--${detailStatus}`} aria-live="polite">
            <span className="daily-signal__detail-date">{formatSignalDate(selectedDate, { year: "numeric" })}</span>
            <span className="daily-signal__detail-copy">{detailCopy}</span>
            {detailStatus === "sent" ? <span className="daily-signal__detail-tag">已发送</span> : detailStatus === "today" ? <span className="daily-signal__detail-tag">今天</span> : null}
            {selectedMoodEntry ? <span className="daily-signal__history-mood"><span className="daily-signal__mood-icon" aria-hidden="true"><MoodGlyph mood={selectedMoodEntry} /></span><span>当日状态：{selectedMoodEntry}</span></span> : null}
          </div>
        ) : null}
      </section>
    </section>
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

function getDateDetailCopy(status: SignalDayStatus) {
  if (status === "future") return "这一天还没有到来。";
  if (status === "today") return "今天的方块会在信号送达后亮起。";
  if (status === "sent") return "这一天留下过一条基地信号。";
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
function ReturnIcon() { return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.2 6A5.5 5.5 0 1 0 14 9M13 2.5v3.8H9.2" /></svg>; }
