import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Notify } from "~/components/notify";
import {
  addDays,
  beijingToday,
  clockTime,
  fromBeijing,
  monthDays,
  moveTimeline,
  selectScheduleDate,
  shiftMonth,
  timelineRange,
  withTimeline,
  type SalonSchedule,
  type TimePart,
} from "~/lib/salon-schedule";
import "./salon-schedule-picker.css";

const dateLabel = (date: string) => date.replaceAll("-", ".");
const exactTime = (value: string) =>
  value.slice(11, 16) +
  (Number(value.slice(17)) ? value.slice(16).replace(/\.000$/, "") : "");

type HandleId = "first" | "second";

export function SalonSchedulePicker({
  value,
  onChange,
  editing = false,
  registrationRequired = true,
}: {
  value: SalonSchedule;
  onChange: (value: SalonSchedule) => void;
  editing?: boolean;
  registrationRequired?: boolean;
}) {
  const [today, setToday] = useState(beijingToday);
  const [target, setTarget] = useState<"event" | "deadline">("event");
  const [month, setMonth] = useState(() =>
    editing ? value.startAt.slice(0, 7) : beijingToday().slice(0, 7),
  );
  useEffect(() => { if (!registrationRequired) setTarget("event"); }, [registrationRequired]);
  const [message, setMessage] = useState("");
  // Physical handles retain pointer capture and focus when their time roles swap.
  const [flipped, setFlipped] = useState(false);
  const [preview, setPreview] = useState<{ handle: HandleId; minute: number } | null>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number;
    handle: HandleId | "range";
    part: TimePart;
    x: number;
    width: number;
    left: number;
    start: number;
    end: number;
    fixed: number;
    offset: number;
    minute: number;
    moved: boolean;
  } | null>(null);
  const range = timelineRange(value);
  const handles: [number, number] = range
    ? flipped ? [range[1], range[0]] : [range[0], range[1]]
    : [0, 0];
  if (preview) handles[preview.handle === "first" ? 0 : 1] = preview.minute;
  const shownRange: [number, number] | null = range
    ? [Math.min(...handles), Math.max(...handles)]
    : null;
  const eventDate = value.startAt.slice(0, 10);
  const deadlineDate = value.deadline.slice(0, 10);
  const activeDate = target === "event" ? eventDate : deadlineDate;
  const earliestMonth = [today, eventDate, deadlineDate].sort()[0].slice(0, 7);

  useEffect(() => {
    // Re-evaluate the disabled dates at Beijing midnight even in a foreign zone.
    let timer: ReturnType<typeof setTimeout>;
    function refresh() {
      const date = beijingToday();
      setToday(date);
      timer = setTimeout(
        refresh,
        Date.parse(fromBeijing(`${addDays(date, 1)}T00:00`)) - Date.now() + 50,
      );
    }
    refresh();
    return () => clearTimeout(timer);
  }, []);

  function canSelect(date: string) {
    return date >= beijingToday() && (target === "event" || date <= eventDate);
  }
  function choose(date: string) {
    if (!canSelect(date)) return;
    const next = selectScheduleDate(value, target, date);
    setMessage(
      next.deadline !== value.deadline && target === "event"
        ? "报名截止已同步为活动当天 00:00"
        : "",
    );
    onChange(next);
  }
  function calendarKey(e: KeyboardEvent<HTMLButtonElement>, date: string) {
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[
      e.key
    ];
    if (
      offset === undefined &&
      e.key !== "PageUp" &&
      e.key !== "PageDown" &&
      e.key !== "Home" &&
      e.key !== "End"
    )
      return;
    e.preventDefault();
    let next = offset !== undefined ? addDays(date, offset) : date;
    if (e.key === "PageUp" || e.key === "PageDown") {
      const nextMonth = shiftMonth(
        date.slice(0, 7),
        e.key === "PageUp" ? -1 : 1,
      );
      const dates = monthDays(nextMonth).filter((d): d is string => Boolean(d));
      next = dates[Math.min(Number(date.slice(8)), dates.length) - 1];
    }
    if (e.key === "Home") next = `${month}-01`;
    if (e.key === "End") next = addDays(`${shiftMonth(month, 1)}-01`, -1);
    if (!canSelect(next)) return;
    setMonth(next.slice(0, 7));
    requestAnimationFrame(() =>
      calendar.current
        ?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)
        ?.focus(),
    );
  }
  function commit(nextRange: [number, number]) {
    const next = withTimeline(value, nextRange);
    setMessage(
      next.deadline !== value.deadline ? "报名截止已同步为活动当天 00:00" : "",
    );
    onChange(next);
  }
  function startDrag(e: PointerEvent<HTMLButtonElement>, target: HandleId | "range") {
    if (!range || drag.current || !e.isPrimary || e.button !== 0 || e.currentTarget.disabled)
      return;
    const rect = track.current!.getBoundingClientRect();
    if (!rect.width) return;
    const positions = flipped ? [range[1], range[0]] : [range[0], range[1]];
    let handle = target;
    if (target !== "range") {
      // Overlapping touch targets still pick the nearest visible line.
      const index = target === "first" ? 0 : 1;
      const x = (minute: number) => rect.left + (minute / 1440) * rect.width;
      if (Math.abs(e.clientX - x(positions[1 - index])) <
          Math.abs(e.clientX - x(positions[index])))
        handle = target === "first" ? "second" : "first";
    }
    const index = handle === "first" ? 0 : 1;
    const part: TimePart = handle === "range"
      ? "range" : positions[index] === range[0] ? "start" : "end";
    const owner = handle === target
      ? e.currentTarget
      : track.current!.querySelector<HTMLButtonElement>(`[data-handle="${handle}"]`);
    if (!owner) return;
    owner.setPointerCapture(e.pointerId);
    owner.focus();
    drag.current = {
      pointerId: e.pointerId,
      handle,
      part,
      x: e.clientX,
      width: rect.width,
      left: rect.left,
      start: range[0],
      end: range[1],
      fixed: handle === "range" ? 0 : positions[1 - index],
      // Grabbing the edge of a touch target must not jump the line to the pointer.
      offset: handle === "range" ? 0 : positions[index] -
        ((e.clientX - rect.left) / rect.width) * 1440,
      minute: handle === "range" ? 0 : positions[index],
      moved: false,
    };
  }
  function moveDrag(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.handle === "range") {
      commit(moveTimeline(d.start, d.end, "range", ((e.clientX - d.x) / d.width) * 1440));
      return;
    }
    const amount = ((e.clientX - d.left) / d.width) * 1440 + d.offset;
    const minute = Math.max(0, Math.min(1440, Math.round(amount / 30) * 30));
    d.moved ||= Math.abs(e.clientX - d.x) > 2;
    d.minute = minute;
    setPreview({ handle: d.handle, minute });
  }
  function stopDrag(e: PointerEvent<HTMLButtonElement>, completed: boolean) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    if (d.handle === "range") return;
    if (completed && d.moved) {
      // A crossing may temporarily collapse the preview; persist only valid ranges.
      const target = d.minute === d.fixed
        ? d.fixed + (d.part === "start" ? -30 : 30)
        : d.minute;
      const next = moveTimeline(d.start, d.end, d.part, target);
      const movingIsEnd = next[0] === d.fixed;
      setFlipped(d.handle === "first" ? movingIsEnd : !movingIsEnd);
      commit(next);
    }
    setPreview(null);
  }
  function timelineKey(e: KeyboardEvent<HTMLButtonElement>, handle: HandleId | "range") {
    if (!range) return;
    const direction = {
      ArrowLeft: -30,
      ArrowDown: -30,
      ArrowRight: 30,
      ArrowUp: 30,
    }[e.key];
    if (direction === undefined && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const part: TimePart = handle === "range"
      ? "range"
      : handles[handle === "first" ? 0 : 1] === range[0] ? "start" : "end";
    const current = part === "end" ? range[1] : range[0];
    const amount =
      e.key === "Home"
        ? part === "range" ? -range[0] : 0
        : e.key === "End"
          ? part === "range" ? 1440 - range[1] : 1440
          : part === "range" ? direction! : current + direction!;
    const next = moveTimeline(...range, part, amount);
    if (handle !== "range") {
      const fixed = part === "start" ? range[1] : range[0];
      const movingIsEnd = next[0] === fixed;
      setFlipped(handle === "first" ? movingIsEnd : !movingIsEnd);
    }
    commit(next);
  }
  const pointerHandlers = (handle: HandleId | "range") => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => startDrag(e, handle),
    onPointerMove: moveDrag,
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => stopDrag(e, true),
    onPointerCancel: (e: PointerEvent<HTMLButtonElement>) => stopDrag(e, false),
    onLostPointerCapture: (e: PointerEvent<HTMLButtonElement>) => stopDrag(e, false),
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => timelineKey(e, handle),
  });
  const duration = preview && shownRange
    ? shownRange[1] - shownRange[0]
    : (Date.parse(fromBeijing(value.endAt)) -
        Date.parse(fromBeijing(value.startAt))) / 60_000;
  const durationLabel = `${Number(duration.toFixed(2))} 分钟`;
  return (
    <section className="salon-schedule" aria-label="活动日期与时间（北京时间）">
      <div className="salon-date-picker">
        <div className="salon-date-targets" aria-label="日期选择目标">
          {(
            [
              ["event", "活动日期", eventDate],
              ["deadline", "报名截止日期", deadlineDate],
            ] as const
          ).filter(([key]) => registrationRequired || key === "event").map(([key, label, date]) => (
            <button
              type="button"
              key={key}
              aria-pressed={target === key}
              className={`salon-date-target salon-date-target--${key}`}
              onClick={() => {
                setTarget(key);
                setMonth(date.slice(0, 7));
              }}
            >
              <span>{label}</span>
              <strong>{dateLabel(date)}</strong>
              {key === "deadline" ? (
                <small>{exactTime(value.deadline)}</small>
              ) : null}
            </button>
          ))}
        </div>
        <div className="salon-month-nav">
          <button
            type="button"
            aria-label="上个月"
            disabled={month <= earliestMonth}
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            ‹
          </button>
          <span aria-live="polite">
            {month.slice(0, 4)} 年 {Number(month.slice(5))} 月
          </span>
          <button
            type="button"
            aria-label="下个月"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            ›
          </button>
        </div>
        <div
          className="salon-calendar"
          ref={calendar}
          aria-label={`${month}月历`}
        >
          {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
            <span className="salon-weekday" key={d} aria-hidden="true">
              {d}
            </span>
          ))}
          {monthDays(month).map((date, i) =>
            date ? (
              <button
                type="button"
                key={date}
                data-date={date}
                disabled={!canSelect(date)}
                aria-current={date === today ? "date" : undefined}
                aria-label={`${dateLabel(date)}${date === eventDate ? "，活动日期" : ""}${registrationRequired && date === deadlineDate ? "，报名截止日期" : ""}`}
                aria-pressed={date === activeDate}
                onClick={() => choose(date)}
                onKeyDown={(e) => calendarKey(e, date)}
                className={`salon-day${date === eventDate ? " salon-day--event" : ""}${registrationRequired && date === deadlineDate ? " salon-day--deadline" : ""}`}
              >
                {Number(date.slice(8))}
              </button>
            ) : (
              <span key={`blank-${i}`} />
            ),
          )}
        </div>
      </div>
      <div className="salon-time-picker">
        <div className="salon-time-heading">
          <h3>
            活动时段 <small>北京时间</small>
          </h3>
          <output aria-live="polite" aria-atomic="true">
            {durationLabel}
          </output>
        </div>
        {shownRange ? (
          <>
            <div className="salon-time-summary">
              <span>
                开始 <strong>{clockTime(shownRange[0])}</strong>
              </span>
              <span>
                结束 <strong>{clockTime(shownRange[1])}</strong>
              </span>
            </div>
            <div className="salon-timeline-wrap">
              <div className="salon-timeline" ref={track}>
                <div className="salon-timeline-ticks" aria-hidden="true">
                  {Array.from({ length: 49 }, (_, i) => (
                    <i
                      key={i}
                      style={{ left: `${(i / 48) * 100}%` }}
                      className={i % 2 ? "" : "salon-tick-hour"}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="salon-time-range"
                  style={{
                    left: `${shownRange[0] / 14.4}%`,
                    width: `${(shownRange[1] - shownRange[0]) / 14.4}%`,
                  }}
                  role="slider"
                  aria-label="整体平移活动时段"
                  aria-valuemin={0}
                  aria-valuemax={1440 - (shownRange[1] - shownRange[0])}
                  aria-valuenow={shownRange[0]}
                  aria-valuetext={`${clockTime(shownRange[0])} 至 ${clockTime(shownRange[1])}，${durationLabel}`}
                  {...pointerHandlers("range")}
                />
                {(["first", "second"] as const).map((handle, i) => {
                  const minute = handles[i];
                  const isStart = minute < handles[1 - i] ||
                    (minute === handles[1 - i] && (flipped ? i === 1 : i === 0));
                  return (
                    <button
                      type="button"
                      key={handle}
                      data-handle={handle}
                      className="salon-time-handle"
                      data-dragging={preview?.handle === handle || undefined}
                      style={{ left: `${minute / 14.4}%` }}
                      role="slider"
                      aria-label={isStart ? "活动开始时间" : "活动结束时间"}
                      aria-orientation="horizontal"
                      aria-valuemin={0}
                      aria-valuemax={1440}
                      aria-valuenow={minute}
                      aria-valuetext={clockTime(minute)}
                      {...pointerHandlers(handle)}
                    >
                      <span className="salon-handle-line" aria-hidden="true" />
                      <span
                        className="salon-handle-time"
                        aria-hidden="true"
                        style={{
                          transform: minute < 180
                            ? "translateX(0)"
                            : minute > 1260
                              ? "translateX(-100%)"
                              : "translateX(-50%)",
                        }}
                      >
                        {clockTime(minute)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="salon-hour-labels" aria-hidden="true">
                {[0, 6, 12, 18, 24].map((h) => (
                  <span key={h}>{String(h).padStart(2, "0")}</span>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="salon-legacy-time">
            <p>
              {dateLabel(eventDate)} {exactTime(value.startAt)} —{" "}
              {dateLabel(value.endAt.slice(0, 10))} {exactTime(value.endAt)}
            </p>
            <button type="button" onClick={() => commit([840, 930])}>
              调整为当天 14:00–15:30
            </button>
          </div>
        )}
        {message ? <Notify tone="success" message={message} onClose={() => setMessage("")} /> : null}
      </div>
    </section>
  );
}
