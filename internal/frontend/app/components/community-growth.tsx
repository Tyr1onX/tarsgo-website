import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { CommunityIcon } from "~/components/community-icons";
import { communityClient, type CommunityGrowthProfile } from "~/lib/community-client";
import { getCommunityGrowthSnapshot, requestCommunityExperienceRefresh, subscribeCommunityGrowthError, subscribeCommunityGrowthProfile } from "~/lib/community-experience-sync";
import "./community-growth.css";

export function CommunityLevelBadge({ level }: { level: number }) {
  return <span className="community-level-badge" aria-label={`社区等级 Lv.${level}`} title={`社区等级 Lv.${level}`}>Lv.{level}</span>;
}

export function CommunityGrowthDetails({ profile }: { profile: CommunityGrowthProfile }) {
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
      <p>发帖奖励 {Math.min(profile.dailyPostsUsed, 2)}/2 · 回复奖励 {Math.min(profile.dailyRepliesUsed, 5)}/5</p>
      <p>发帖 +10/篇 · 回复 +2/条 · 首次上传自定义头像 +20 XP</p>
      <p>签到 10/12/15 XP · 收到点赞 +1 · 收到回复 +1 · 回答被采纳 +10 XP</p>
    </section>
    <div className="community-growth-week">
      <div className="community-growth-week__heading"><strong>连续签到奖励</strong><span>第 3 天起奖励增加</span></div>
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
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function loadProfile() {
    setError("");
    requestCommunityExperienceRefresh();
  }

  useEffect(() => subscribeCommunityGrowthError(userID, setError), [userID]);

  async function checkIn() {
    if (checkingIn || profile?.checkedInToday) return;
    setCheckingIn(true);
    setNotice("");
    setError("");
    try {
      const result = await communityClient.checkIn(userID);
      setNotice(result.earnedXp > 0 ? "" : "今天已经签到。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "签到失败，请稍后重试。");
    } finally {
      setCheckingIn(false);
    }
  }

  return <section className="community-growth" aria-label="社区成长">
    <div className="community-growth__bar">
      <button type="button" className={`community-growth__checkin${profile?.checkedInToday ? " is-complete" : ""}`} onClick={() => void checkIn()} disabled={!profile || checkingIn || profile.checkedInToday}>
        <CommunityIcon name={profile?.checkedInToday ? "check" : "calendarCheck"} />
        <span>{checkingIn ? "签到中…" : !profile && !error ? "读取签到状态…" : profile?.checkedInToday ? "今日已签到" : "每日签到"}</span>
        {profile && !profile.checkedInToday ? <strong>+{profile.upcomingCheckIns[0]?.rewardXp ?? 10} XP</strong> : null}
      </button>
      <span className="community-growth__summary" aria-live="polite">
        {profile ? <><CommunityLevelBadge level={profile.level} /><span>{profile.totalXp.toLocaleString("zh-CN")} XP</span><span className="community-growth__streak"><CommunityIcon name="flame" /> 连续 {profile.streakDays} 天</span></> : error ? "成长信息暂不可用" : "正在读取成长信息"}
      </span>
      <button type="button" className="community-growth__details-toggle" aria-expanded={open} onClick={() => { const next = !open; setOpen(next); if (next) loadProfile(); }} disabled={!profile}>
        成长详情 <CommunityIcon name="chevronDown" />
      </button>
    </div>
    {notice ? <p className="community-growth__notice" role="status">{notice}</p> : null}
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
