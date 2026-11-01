import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";

import { CommunityBadgeInfo } from "~/components/community-badge-mark";
import { CommunityIcon } from "~/components/community-icons";
import { CommunityLevelBadge } from "~/components/community-growth";
import { CommunityAvatar } from "~/components/community-post-card";
import {
  communityMemberProfileClient,
  type CommunityMemberProfileResult,
  type CommunityPublicBadge,
} from "~/lib/community-member-profile-client";
import { communityCategoryLabel, formatCommunityDate } from "~/lib/community-client";
import { stripCommunityMarkdown } from "~/lib/community-markdown";
import "./community.css";

const tabs = [
  { id: "overview", label: "概览" },
  { id: "posts", label: "帖子" },
  { id: "replies", label: "回复" },
  { id: "badges", label: "徽章" },
] as const;

type ProfileTab = (typeof tabs)[number]["id"];

function profileTab(value: string | null): ProfileTab {
  return tabs.some((tab) => tab.id === value) ? (value as ProfileTab) : "overview";
}

export function meta() {
  return [{ title: "社区成员 | TARSGO" }];
}

export default function CommunityMemberProfileRoute() {
  const { id: rawID = "" } = useParams();
  const memberID = Number(rawID);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tab = profileTab(searchParams.get("tab"));
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const [result, setResult] = useState<CommunityMemberProfileResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [selectedBadge, setSelectedBadge] = useState("");
  const [saving, setSaving] = useState(false);
  const returnTarget = (location.state as { communityProfileReturnTo?: unknown } | null)?.communityProfileReturnTo;
  const hasReturnLocation = typeof returnTarget === "string" && (returnTarget === "/dashboard" || returnTarget.startsWith("/dashboard/") || returnTarget.startsWith("/dashboard?"));
  const returnTo = hasReturnLocation ? returnTarget : "/dashboard";
  const currentPath = `${location.pathname}${location.search}${location.hash}`;

  function returnToSource(event: MouseEvent<HTMLAnchorElement>) {
    if (!hasReturnLocation) return;
    event.preventDefault();
    navigate(-1);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    communityMemberProfileClient.get(memberID, tab, page).then((next) => {
      if (!active) return;
      setResult(next);
      setBioDraft(next.member.bio);
      setSelectedBadge(next.member.featuredBadgeKey ?? "");
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "成员主页暂时无法读取。");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [memberID, tab, page]);

  function changeTab(next: ProfileTab, nextPage = 1) {
    const params = new URLSearchParams(location.search);
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    if (nextPage > 1) params.set("page", String(nextPage));
    else params.delete("page");
    const query = params.toString();
    navigate(`${location.pathname}${query ? `?${query}` : ""}`, { state: location.state, preventScrollReset: true });
  }

  async function saveBio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result || saving) return;
    setSaving(true);
    setError("");
    try {
      await communityMemberProfileClient.updateMine({ bio: bioDraft });
      const next = await communityMemberProfileClient.get(memberID, tab, page);
      setResult(next);
      setBioDraft(next.member.bio);
      setEditingBio(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "简介保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function selectFeaturedBadge(key: string) {
    if (!result || saving) return;
    const previous = selectedBadge;
    setSelectedBadge(key);
    setSaving(true);
    setError("");
    try {
      await communityMemberProfileClient.updateMine({ featuredBadgeKey: key });
      const next = await communityMemberProfileClient.get(memberID, tab, page);
      setResult(next);
      setSelectedBadge(next.member.featuredBadgeKey ?? "");
    } catch (cause) {
      setSelectedBadge(previous);
      setError(cause instanceof Error ? cause.message : "代表徽章更新失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !result) return <section className="admin-design community-page"><p className="community-state" role="status">正在读取成员主页…</p></section>;
  if (!result) return <section className="admin-design community-page"><p className="community-state community-state--error" role="alert">{error || "成员主页不存在。"}</p><Link className="community-thread__back" to={returnTo} onClick={returnToSource}><CommunityIcon name="arrowLeft" />返回</Link></section>;

  const { member, stats } = result;
  const visibleBadges = result.badges ?? [];
  const postHrefState = { communityReturnTo: currentPath };
  const currentlyEarnedBadges = visibleBadges.filter((badge) => badge.isEarned);

  return <section className="admin-design community-page community-member-page" aria-labelledby="community-member-title">
    <Link className="community-thread__back" to={returnTo} onClick={returnToSource}><CommunityIcon name="arrowLeft" />返回</Link>
    {error ? <p className="community-state community-state--error" role="alert">{error}</p> : null}

    <header className="community-member-hero">
      <CommunityAvatar name={member.displayName} src={member.avatarUrl} />
      <div className="community-member-hero__identity">
        <div className="community-member-hero__name"><h1 id="community-member-title">{member.displayName}</h1><CommunityLevelBadge level={member.level.level} />{member.featuredBadge ? <CommunityBadgeInfo badge={member.featuredBadge} size={24} /> : null}</div>
        <div className="community-member-hero__groups">
          {member.groups.map((group) => <span key={`${group.name}-${group.role}`}>{group.name} · {group.role}</span>)}
          {member.positions.map((position) => <span key={position.id}>{position.categoryTitle} · {position.title}</span>)}
          {member.teamJoinedAt ? <span>加入战队 {formatLongDate(member.teamJoinedAt)}</span> : null}
        </div>
        {editingBio && member.isSelf ? <form className="community-member-bio-editor" onSubmit={(event) => void saveBio(event)}>
          <label htmlFor="community-member-bio">社区主页公开介绍</label>
          <textarea id="community-member-bio" value={bioDraft} onChange={(event) => setBioDraft(event.target.value)} maxLength={160} rows={3} />
          <p>这段介绍会展示在社区成员可访问的个人主页中。</p>
          <div className="community-member-bio-editor__actions"><span>{Array.from(bioDraft).length}/160</span><button type="button" className="community-button community-button--quiet" onClick={() => { setBioDraft(member.bio); setEditingBio(false); }}>取消</button><button type="submit" className="community-button community-button--primary" disabled={saving}>{saving ? "保存中…" : "保存简介"}</button></div>
        </form> : <div className="community-member-hero__bio-row">
          <p className={member.bio ? "" : "is-empty"}>{member.bio || (member.isSelf ? "添加一段个人介绍" : "暂无个人介绍")}</p>
          {member.isSelf ? <button type="button" className="community-button community-button--quiet community-member-edit-bio" onClick={() => setEditingBio(true)}>{member.bio ? "编辑简介" : "添加简介"}</button> : null}
        </div>}
        <div className="community-member-level" aria-label={`社区等级 Lv.${member.level.level}，经验进度 ${Math.round(member.level.progress * 100)}%`}>
          <div className="community-member-level__label"><span>Lv.{member.level.level}</span><span>{member.level.totalXp.toLocaleString("zh-CN")} XP</span></div>
          <div className="community-member-level__track"><span style={{ width: `${Math.round(member.level.progress * 100)}%` }} /></div>
          <span className="community-member-level__next">距离 Lv.{member.level.level + 1} 还差 {Math.max(0, member.level.xpToNextLevel).toLocaleString("zh-CN")} XP</span>
        </div>
      </div>
    </header>

    <section className="community-member-stats" aria-label="社区活动统计">
      <Stat label="帖子" value={stats.postCount} />
      <Stat label="回复" value={stats.replyCount} />
      <Stat label="获赞" value={stats.likeCount} />
    </section>

    <nav className="community-member-tabs" aria-label="成员主页栏目">
      {tabs.map((item) => <button key={item.id} type="button" aria-current={tab === item.id ? "page" : undefined} onClick={() => changeTab(item.id)}>{item.label}</button>)}
    </nav>
    {loading ? <p className="community-member-loading" role="status">正在更新内容…</p> : null}

    {tab === "overview" ? <div className="community-member-overview">
      <section className="community-member-section" aria-labelledby="community-member-activity-title">
        <header><h2 id="community-member-activity-title">近期活动</h2></header>
        {result.activities?.length ? <ol className="community-member-activity">{result.activities.map((activity) => <li key={`${activity.kind}-${activity.id}`}>
          <span className="community-member-activity__marker"><CommunityIcon name={activity.kind === "post" ? "messageCircle" : "cornerDownRight"} /></span>
          <div><p><strong>{activity.kind === "post" ? "发布了帖子" : "回复了讨论"}</strong><time dateTime={activity.createdAt}>{formatCommunityDate(activity.createdAt)}</time></p>
            <Link to={activity.href} state={postHrefState}>{activity.title || activity.body}</Link>
            {activity.title ? <p className="community-member-activity__excerpt">{stripCommunityMarkdown(activity.body)}</p> : null}
          </div>
        </li>)}</ol> : <EmptyState>还没有可展示的社区活动</EmptyState>}
      </section>
      <section className="community-member-section" aria-labelledby="community-member-honors-title">
        <header><h2 id="community-member-honors-title">代表荣誉</h2><button type="button" className="community-inline-link" onClick={() => changeTab("badges")}>全部徽章</button></header>
        {member.featuredBadge ? <div className="community-member-featured-honor"><CommunityBadgeInfo badge={member.featuredBadge} size={54} /><div><strong>{member.featuredBadge.name}</strong><span>{member.featuredBadge.levelLabel}</span></div></div> : <EmptyState>尚未获得徽章</EmptyState>}
      </section>
    </div> : null}

    {tab === "posts" ? <section className="community-member-section community-member-content-list" aria-label="成员发布的帖子">
      {result.posts?.length ? result.posts.map((post) => <article key={post.id} className="community-member-post-item">
        <div className="community-member-post-item__meta"><span>{communityCategoryLabel(post.category)}</span><time dateTime={post.createdAt}>{formatCommunityDate(post.createdAt)}</time></div>
        <h2><Link to={`/dashboard/community/${post.id}`} state={postHrefState}>{post.title}</Link></h2>
        <p>{stripCommunityMarkdown(post.body)}</p>
        <footer><span><CommunityIcon name="heart" />{post.likeCount}</span><span><CommunityIcon name="messageCircle" />{post.commentCount}</span></footer>
      </article>) : <EmptyState>{loading ? "" : "还没有可展示的帖子"}</EmptyState>}
      <Pagination page={page} hasMore={result.hasMore} onChange={(nextPage) => changeTab("posts", nextPage)} />
    </section> : null}

    {tab === "replies" ? <section className="community-member-section community-member-content-list" aria-label="成员参与的讨论">
      {result.replies?.length ? result.replies.map((reply) => <article key={reply.id} className="community-member-reply-item">
        <p><span>回复了</span><Link to={reply.href} state={postHrefState}>{reply.postTitle}</Link><time dateTime={reply.createdAt}>{formatCommunityDate(reply.createdAt)}</time></p>
        <Link className="community-member-reply-item__body" to={reply.href} state={postHrefState}>{stripCommunityMarkdown(reply.body)}</Link>
        <footer><span><CommunityIcon name="heart" />{reply.likeCount}</span></footer>
      </article>) : <EmptyState>{loading ? "" : "还没有可展示的回复"}</EmptyState>}
      <Pagination page={page} hasMore={result.hasMore} onChange={(nextPage) => changeTab("replies", nextPage)} />
    </section> : null}

    {tab === "badges" ? <section className="community-member-badges" aria-label="已获得的徽章">
      {member.isSelf ? <div className="community-member-badges__selection"><label htmlFor="community-featured-badge">代表徽章</label><select id="community-featured-badge" value={selectedBadge} disabled={saving} onChange={(event) => void selectFeaturedBadge(event.target.value)}>
        <option value="">自动选择最高等级</option>{currentlyEarnedBadges.map((badge) => <option key={badge.key} value={badge.key}>{badge.name} · {badge.levelLabel}</option>)}
      </select></div> : null}
      {visibleBadges.length ? visibleBadges.map((badge) => <BadgeCard key={badge.key} badge={badge} featured={member.featuredBadge?.key === badge.key} />) : <EmptyState>{loading ? "" : "还没有获得徽章"}</EmptyState>}
    </section> : null}
  </section>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="community-member-stat"><strong>{value.toLocaleString("zh-CN")}</strong><span>{label}</span></div>;
}

function EmptyState({ children }: { children: string }) {
  return <p className="community-member-empty">{children}</p>;
}

function Pagination({ page, hasMore, onChange }: { page: number; hasMore: boolean; onChange: (page: number) => void }) {
  if (page === 1 && !hasMore) return null;
  return <nav className="community-member-pagination" aria-label="分页">
    <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>上一页</button><span>第 {page} 页</span><button type="button" disabled={!hasMore} onClick={() => onChange(page + 1)}>下一页</button>
  </nav>;
}

function BadgeCard({ badge, featured }: { badge: CommunityPublicBadge; featured: boolean }) {
  return <article className="community-member-badge-card">
    <div className="community-member-badge-card__intro">
      <CommunityBadgeInfo badge={badge} size={64} />
      <div><div className="community-member-badge-card__title"><h2>{badge.name}</h2>{featured ? <span>代表徽章</span> : null}</div><strong>{badge.levelLabel}</strong>{badge.earnedAt ? <time dateTime={badge.earnedAt}>当前等级获得于 {formatLongDate(badge.earnedAt)}</time> : null}<p>{badge.description} {badge.condition}</p></div>
    </div>
    <section className="community-member-badge-card__history"><h3>等级记录</h3>
      {badge.tierHistory.length ? <ol>{badge.tierHistory.map((tier, index) => <li key={`${tier.levelCode}-${tier.earnedAt}-${index}`}><span className={`community-member-badge-card__dot is-${tier.levelCode}`} /><div><strong>{tier.levelLabel}</strong><time dateTime={tier.earnedAt}>{formatLongDate(tier.earnedAt)}</time><span className="community-member-badge-card__requirement">累计 {tier.requiredContributionCount} 项有效贡献</span>{tier.revokedAt ? <span className="community-member-badge-card__revoked">已撤销 · {formatLongDate(tier.revokedAt)}</span> : null}</div></li>)}</ol> : <p className="community-member-empty">暂无等级记录</p>}
    </section>
    <section className="community-member-badge-card__contributions"><h3>贡献记录</h3>
      {badge.contributions.length ? <ul>{badge.contributions.map((item, index) => <li key={`${item.createdAt}-${index}`}><span>{item.description}</span><time dateTime={item.createdAt}>{formatLongDate(item.createdAt)}</time>{item.revokedAt ? <small>已撤销</small> : null}</li>)}</ul> : null}
    </section>
  </article>;
}

function formatLongDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(date);
}
