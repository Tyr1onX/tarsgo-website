import { useEffect, useRef, useState } from "react";

import { CommunityIcon } from "~/components/community-icons";
import { communityClient, type CommunityGrowthProfile } from "~/lib/community-client";
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

export function CommunityGrowthBar({
  profile,
  onProfileChange,
  loading,
  onRetry,
}: {
  profile: CommunityGrowthProfile | null;
  onProfileChange: (profile: CommunityGrowthProfile) => void;
  loading: boolean;
  onRetry: () => void;
}) {
  const [checkingIn, setCheckingIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const profileRef = useRef(profile);
  profileRef.current = profile;

  function updateProfile(next: CommunityGrowthProfile, announceLevelUp = true) {
    const previousLevel = profileRef.current?.level;
    profileRef.current = next;
    onProfileChange(next);
    if (announceLevelUp && previousLevel && next.level > previousLevel) {
      setNotice(`恭喜升级到 Lv.${next.level}！继续参与社区讨论吧。`);
    }
  }

  async function loadProfile() {
    setError("");
    try {
      const next = await communityClient.growth();
      updateProfile(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "社区成长信息暂时无法读取。");
    }
  }

  useEffect(() => {
    let lastRefreshAt = Date.now();
    const refreshOnReturn = () => {
      const now = Date.now();
      if (document.visibilityState !== "visible" || now - lastRefreshAt < 1200) return;
      lastRefreshAt = now;
      void loadProfile();
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("focus", refreshOnReturn);
    return () => {
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.removeEventListener("focus", refreshOnReturn);
    };
  }, []);

  async function checkIn() {
    if (checkingIn || profile?.checkedInToday) return;
    setCheckingIn(true);
    setNotice("");
    setError("");
    try {
      const result = await communityClient.checkIn();
      const previousLevel = profileRef.current?.level;
      updateProfile(result.profile, false);
      setNotice(result.alreadyCheckedIn
        ? "今天已经签到。"
        : previousLevel && result.profile.level > previousLevel
          ? `升级成功，现为 Lv.${result.profile.level} · 签到获得 ${result.earnedXp} XP`
          : `签到成功，获得 ${result.earnedXp} XP · 连续第 ${result.streakDay} 天`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "签到失败，请稍后重试。");
    } finally {
      setCheckingIn(false);
    }
  }

  return <section className="community-growth" aria-label="社区成长">
    <div className="community-growth__bar">
      <button type="button" className={`community-growth__checkin${profile?.checkedInToday ? " is-complete" : ""}`} onClick={() => void checkIn()} disabled={loading || checkingIn || profile?.checkedInToday}>
        <CommunityIcon name={profile?.checkedInToday ? "check" : "calendarCheck"} />
        <span>{loading ? "读取签到状态…" : checkingIn ? "签到中…" : profile?.checkedInToday ? "今日已签到" : "每日签到"}</span>
        {profile && !profile.checkedInToday ? <strong>+{profile.upcomingCheckIns[0]?.rewardXp ?? 10} XP</strong> : null}
      </button>
      <span className="community-growth__summary" aria-live="polite">
        {profile ? <><CommunityLevelBadge level={profile.level} /><span>{profile.totalXp.toLocaleString("zh-CN")} XP</span><span className="community-growth__streak"><CommunityIcon name="flame" /> 连续 {profile.streakDays} 天</span></> : error ? "成长信息暂不可用" : "正在读取成长信息"}
      </span>
      <button type="button" className="community-growth__details-toggle" aria-expanded={open} onClick={() => { const next = !open; setOpen(next); if (next) void loadProfile(); }} disabled={loading && !profile}>
        成长详情 <CommunityIcon name="chevronDown" />
      </button>
    </div>
    {notice ? <p className="community-growth__notice" role="status">{notice}</p> : null}
    {error ? <p className="community-growth__error" role="alert">{error}<button type="button" onClick={() => void loadProfile()}>重试</button></p> : null}
    {!profile && !loading && !error ? <p className="community-growth__error" role="alert">成长信息暂不可用。<button type="button" onClick={onRetry}>重试</button></p> : null}
    {open && profile ? <CommunityGrowthDetails profile={profile} /> : null}
  </section>;
}

export function CommunityGrowthProfileSection() {
  const [profile, setProfile] = useState<CommunityGrowthProfile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void communityClient.growth().then((result) => {
      if (active) setProfile(result);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "社区成长信息暂时无法读取。");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return <section className="community-growth-profile" aria-labelledby="community-growth-profile-heading">
    <div className="community-growth-profile__heading">
      <span className="community-growth-profile__icon"><CommunityIcon name="award" /></span>
      <div><h3 id="community-growth-profile-heading">社区成长</h3><p>经验记录真实的社区参与，和共建者勋章并行展示。</p></div>
    </div>
    {loading ? <p className="community-growth-profile__state" role="status">正在读取社区成长…</p> : error ? <p className="community-growth-profile__state is-error" role="alert">{error}</p> : profile ? <CommunityGrowthDetails profile={profile} /> : null}
  </section>;
}

function formatShortDay(value: string) {
  const [, month = "", day = ""] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatEventTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric" }).format(new Date(value));
}
