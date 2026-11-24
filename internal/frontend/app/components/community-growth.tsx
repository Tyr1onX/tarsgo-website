import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BrandLoader } from "~/components/brand-loader";

import { CommunityIcon } from "~/components/community-icons";
import { communityClient, type CommunityGrowthProfile } from "~/lib/community-client";
import { getCommunityGrowthSnapshot, requestCommunityExperienceRefresh, subscribeCommunityGrowthError, subscribeCommunityGrowthProfile } from "~/lib/community-experience-sync";
import "./community-growth.css";

function CommunityXpNumber({ targetXp }: { targetXp: number }) {
  const [displayed, setDisplayed] = useState(targetXp);
  const displayedRef = useRef(targetXp);

  useEffect(() => {
    const from = displayedRef.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    function finish() {
      window.cancelAnimationFrame(frame);
      displayedRef.current = targetXp;
      setDisplayed(targetXp);
    }
    if (from === targetXp || preference.matches) {
      finish();
      return;
    }
    const start = performance.now();
    function step(now: number) {
      const progress = Math.min(1, (now - start) / 240);
      displayedRef.current = Math.round(from + (targetXp - from) * (1 - Math.pow(1 - progress, 3)));
      setDisplayed(displayedRef.current);
      if (progress < 1) frame = window.requestAnimationFrame(step);
    }
    function onPreferenceChange(event: MediaQueryListEvent) {
      if (event.matches) finish();
    }
    preference.addEventListener("change", onPreferenceChange);
    frame = window.requestAnimationFrame(step);
    return () => {
      window.cancelAnimationFrame(frame);
      preference.removeEventListener("change", onPreferenceChange);
    };
  }, [targetXp]);

  return <span className="community-growth__xp-num">
    <span aria-hidden="true">{displayed.toLocaleString("zh-CN")} XP</span>
    <span className="sr-only">{targetXp.toLocaleString("zh-CN")} XP</span>
  </span>;
}

export function CommunityLevelBadge({ level }: { level: number }) {
  return <span className="community-level-badge" aria-label={`社区等级 Lv.${level}`} title={`社区等级 Lv.${level}`}>Lv.{level}</span>;
}

export function CommunityGrowthDetails({ profile }: { profile: CommunityGrowthProfile }) {
  const checkinPct = profile.checkedInToday ? 100 : 0;
  const postPct = Math.min(100, Math.round((Math.min(profile.dailyPostsUsed, 2) / 2) * 100));
  const replyPct = Math.min(100, Math.round((Math.min(profile.dailyRepliesUsed, 5) / 5) * 100));

  return <div className="community-growth-details">
    <div className="community-growth-details__top">
      <span>社区成长</span>
      <span>{profile.totalXp.toLocaleString("zh-CN")} XP</span>
    </div>
    <div className="community-growth-details__level">
      <CommunityLevelBadge level={profile.level} />
      <strong>距离 Lv.{profile.level + 1} 还差 {profile.xpToNextLevel.toLocaleString("zh-CN")} XP</strong>
    </div>
    <div className="community-growth-progress" role="progressbar" aria-label="升级进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(profile.progress * 100)}>
      <span style={{ width: `${Math.round(profile.progress * 100)}%` }} />
    </div>
    <p className="community-growth-details__caption">{profile.totalXp.toLocaleString("zh-CN")} / {profile.nextLevelXp.toLocaleString("zh-CN")} XP</p>
    <section className="community-growth-rewards" aria-label="经验规则和今日奖励进度">
      <div className="community-growth-rewards__heading"><strong>每日奖励进度</strong><span>当前有效 {profile.dailyContributionXp}/30 XP</span></div>
      <div className="community-growth-energy" aria-hidden="true">
        <span className="community-growth-energy__seg community-growth-energy__seg--checkin"><i style={{ width: `${checkinPct}%` }} /></span>
        <span className="community-growth-energy__seg community-growth-energy__seg--post"><i style={{ width: `${postPct}%` }} /></span>
        <span className="community-growth-energy__seg community-growth-energy__seg--reply"><i style={{ width: `${replyPct}%` }} /></span>
      </div>
      <p>签到 {profile.checkedInToday ? "已完成" : "待签到"} · 发帖奖励 {Math.min(profile.dailyPostsUsed, 2)}/2 · 回复奖励 {Math.min(profile.dailyRepliesUsed, 5)}/5</p>
      <p>发帖 +10/篇 · 回复 +2/条 · 首次上传自定义头像 +20 XP</p>
      <p>签到 10/12/15 XP · 收到点赞 +1 · 收到回复 +1 · 回答被采纳 +10 XP</p>
    </section>
    <div className="community-growth-week">
      <div className="community-growth-week__heading"><strong>连续签到奖励</strong><span>第 3 天起奖励增加 · 满 7 天解锁「超频核心」头像框</span></div>
      <ol>
        {profile.upcomingCheckIns.map((day) => <li key={day.day} className={day.completed ? "is-complete" : day.isToday ? "is-today" : ""}>
          <span>{day.isToday ? "今天" : formatShortDay(day.day)}</span>
          <strong>{day.rewardXp} XP</strong>
          <span className="community-growth-week__status">{day.completed ? <><CommunityIcon name="check" /> 已签到</> : `第 ${day.streakDay} 天`}</span>
        </li>)}
      </ol>
    </div>
    <div className="community-growth-events">
      <strong>最近经验</strong>
      {profile.recentEvents.length ? <ol>{profile.recentEvents.slice(0, 8).map((event) => <li key={event.id}>
        <span><span>{event.label}</span><time dateTime={event.createdAt}>{formatEventTime(event.createdAt)}</time></span>
        <strong className={event.revoked ? "is-revoked" : ""}>{event.points > 0 ? "+" : ""}{event.points} XP</strong>
      </li>)}</ol> : <p>完成签到或参与讨论，经验会记录在这里。</p>}
    </div>
  </div>;
}

export function CommunityGrowthBar({ userID }: { userID: number }) {
  const subscribe = useCallback((notify: () => void) => subscribeCommunityGrowthProfile(userID, notify), [userID]);
  const getSnapshot = useCallback(() => getCommunityGrowthSnapshot(userID), [userID]);
  const profile = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [burstXp, setBurstXp] = useState<number | null>(null);
  useEffect(() => {
    if (burstXp === null) return;
    const timeout = window.setTimeout(() => setBurstXp(null), 1150);
    return () => window.clearTimeout(timeout);
  }, [burstXp]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  function loadProfile() {
    setError("");
    requestCommunityExperienceRefresh();
  }

  useEffect(() => subscribeCommunityGrowthError(userID, setError), [userID]);

  async function checkIn() {
    if (checkingIn || profile?.checkedInToday) return;
    const rewardXp = profile?.upcomingCheckIns[0]?.rewardXp ?? 10;
    setCheckingIn(true);
    setError("");
    try {
      await communityClient.checkIn(userID);
      setBurstXp(rewardXp);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "签到失败，请稍后重试。");
    } finally {
      setCheckingIn(false);
    }
  }

  const progressPct = profile ? Math.min(100, Math.max(0, Math.round(profile.progress * 100))) : 0;

  return <section className="community-growth" aria-label="社区成长">
    <div className="community-growth__bar">
      <span className="community-growth__checkin-wrap">
        <button type="button" className={`community-growth__checkin${profile?.checkedInToday ? " is-complete" : ""}`} onClick={() => void checkIn()} disabled={!profile || checkingIn || profile.checkedInToday}>
          <CommunityIcon name={profile?.checkedInToday ? "check" : "calendarCheck"} />
          <span>{checkingIn ? "签到中…" : !profile && !error ? "读取签到状态…" : profile?.checkedInToday ? "今日已签到" : "每日签到"}</span>
          {profile && !profile.checkedInToday ? <strong>+{profile.upcomingCheckIns[0]?.rewardXp ?? 10} XP</strong> : null}
        </button>
        {burstXp !== null ? (
          <>
            <span className="community-growth__xp-float" aria-hidden="true">+{burstXp} XP</span>
            <span className="community-growth__ripple" aria-hidden="true" />
          </>
        ) : null}
      </span>
      <div className="community-growth__summary" aria-live="polite">
        {profile ? (
          <>
            <CommunityLevelBadge level={profile.level} />
            <CommunityXpNumber targetXp={profile.totalXp} />
            <span className={`community-growth__streak${profile.streakDays >= 3 ? " is-hot" : ""}`}>
              <CommunityIcon name="flame" /> 连续 {profile.streakDays} 天
            </span>
          </>
        ) : error ? "成长信息暂不可用" : <BrandLoader label="正在读取成长信息" size="inline" />}
      </div>
      <button type="button" className="community-growth__details-toggle" aria-expanded={open} onClick={() => { const next = !open; setOpen(next); if (next) loadProfile(); }} disabled={!profile}>
        成长详情 <CommunityIcon name="chevronDown" />
      </button>
      {profile ? (
        <span className="community-growth__mini-progress" aria-hidden="true" title={`升级进度 ${progressPct}%`}>
          <i style={{ width: `${progressPct}%` }} />
        </span>
      ) : null}
    </div>
    {error ? <p className="community-growth__error" role="alert">{error}<button type="button" onClick={() => void loadProfile()}>重试</button></p> : null}
    {open && profile ? <CommunityGrowthDetails profile={profile} /> : null}
  </section>;
}

function formatShortDay(value: string) {
  const [, month = "", day = ""] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatEventTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric" }).format(new Date(value));
}
