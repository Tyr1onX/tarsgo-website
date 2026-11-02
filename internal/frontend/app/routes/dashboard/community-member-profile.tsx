import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { Link, useLocation, useNavigate, useNavigationType, useOutletContext, useParams, useSearchParams } from "react-router";

import { CommunityBadgeInfo } from "~/components/community-badge-mark";
import { CommunityFeaturedMark } from "~/components/community-featured-mark";
import { TeamIdentityBadge } from "~/components/community-team-identity";
import { CoBuilderBadgeAdminPanel } from "~/components/co-builder-badge-admin-panel";
import { CoBuilderBadgeProfile } from "~/components/co-builder-badge-profile";
import { CommunityIcon } from "~/components/community-icons";
import { CommunityLevelBadge } from "~/components/community-growth";
import { CommunityAvatar } from "~/components/community-post-card";
import { PersonalProfileSettings } from "~/components/personal-profile-settings";
import type { CoBuilderBadgeLevel } from "~/lib/co-builder-badge-client";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import {
  communityMemberProfileClient,
  type CommunityMemberProfileResult,
  type CommunityPublicBadge,
} from "~/lib/community-member-profile-client";
import { clearCommunityLists } from "~/lib/community-list-cache";
import { useDeferredCommunityScrollRestoration } from "~/lib/community-scroll-restoration";
import { communityCategoryLabel, communityClient, formatCommunityDate } from "~/lib/community-client";
import { stripCommunityMarkdown } from "~/lib/community-markdown";
import "./community.css";

const tabs = [
  { id: "overview", label: "概览" },
  { id: "posts", label: "帖子" },
  { id: "replies", label: "回复" },
  { id: "badges", label: "徽章" },
  { id: "settings", label: "资料设置" },
  { id: "management", label: "成员管理" },
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
  const navigationType = useNavigationType();
  const [searchParams] = useSearchParams();
  const { currentUser, groupResolution, profileRevision, refreshAccountProfile, requestBadgeReplay } = useOutletContext<DashboardLayoutOutletContext>();
  const tab = profileTab(searchParams.get("tab"));
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const [result, setResult] = useState<CommunityMemberProfileResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [selectedBadge, setSelectedBadge] = useState("");
  const [saving, setSaving] = useState(false);
  const [featureAction, setFeatureAction] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const returnTarget = (location.state as { communityProfileReturnTo?: unknown } | null)?.communityProfileReturnTo;
  const hasReturnLocation = typeof returnTarget === "string" && (returnTarget === "/dashboard" || returnTarget.startsWith("/dashboard/") || returnTarget.startsWith("/dashboard?"));
  const returnTo = hasReturnLocation ? returnTarget : "/dashboard";
  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  const isSuperAdmin = currentUser.role.name === "super_admin";
  useDeferredCommunityScrollRestoration(location.key, navigationType, result !== null, location.hash);

  function returnToSource(event: MouseEvent<HTMLAnchorElement>) {
    if (!hasReturnLocation) return;
    event.preventDefault();
    navigate(-1);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const apiTab = tab === "settings" ? "badges" : tab === "management" ? "card" : tab;
    communityMemberProfileClient.get(memberID, apiTab, tab === "settings" ? 1 : page).then((next) => {
      if (!active) return;
      setResult(next);
      setBioDraft(next.member.bio);
      setSelectedBadge(next.member.featuredBadgeKey ?? "");
      if ((tab === "settings" && (next.member.id !== currentUser.id || !next.member.isSelf)) || (tab === "management" && !isSuperAdmin)) {
        const params = new URLSearchParams(location.search);
        params.delete("tab");
        params.delete("page");
        const query = params.toString();
        navigate(`${location.pathname}${query ? `?${query}` : ""}`, { replace: true, state: location.state });
      }
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "成员主页暂时无法读取。");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [memberID, tab, page, currentUser.id, isSuperAdmin, profileRevision]);

  function changeTab(next: ProfileTab, nextPage = 1) {
    const params = new URLSearchParams(location.search);
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    if (nextPage > 1) params.set("page", String(nextPage));
    else params.delete("page");
    const query = params.toString();
    navigate(`${location.pathname}${query ? `?${query}` : ""}`, { state: location.state, preventScrollReset: true });
  }

  async function savePublicProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await communityMemberProfileClient.updateMine({ bio: bioDraft, featuredBadgeKey: selectedBadge });
      const next = await communityMemberProfileClient.get(memberID, "badges", 1);
      setResult(next);
      setBioDraft(next.member.bio);
      setSelectedBadge(next.member.featuredBadgeKey ?? "");
      setNotice("公开资料已更新。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "公开资料保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function setFeatured(kind: "post" | "reply", id: number, currentValue: boolean) {
    if (!isSuperAdmin || featureAction) return;
    const actionKey = `${kind}-${id}`;
    const nextValue = !currentValue;
    setFeatureAction(actionKey);
    setError("");
    setNotice("");
    try {
      const state = kind === "post"
        ? await communityClient.setPostFeatured(id, nextValue)
        : await communityClient.setReplyFeatured(id, nextValue);
      setResult((current) => {
        if (!current) return current;
        return kind === "post"
          ? { ...current, posts: current.posts?.map((item) => item.id === id ? { ...item, isFeatured: state.isFeatured } : item) }
          : { ...current, replies: current.replies?.map((item) => item.id === id ? { ...item, isFeatured: state.isFeatured } : item) };
      });
      clearCommunityLists();
      setNotice(state.isFeatured ? "已设为精华。" : "已取消精华。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "精华状态更新失败，请稍后重试。");
    } finally {
      setFeatureAction(null);
    }
  }

  async function refreshManagedMember() {
    clearCommunityLists();
    try {
      const next = await communityMemberProfileClient.get(memberID, "badges", 1);
      setResult((current) => current ? { ...current, member: next.member, badges: next.badges } : next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "贡献已更新，但成员主页同步失败。");
    }
  }

  if (loading && !result) return <section className="admin-design community-page"><p className="community-state" role="status">正在读取成员主页…</p></section>;
  if (!result) return <section className="admin-design community-page"><p className="community-state community-state--error" role="alert">{error || "成员主页不存在。"}</p><Link className="community-thread__back" to={returnTo} onClick={returnToSource}><CommunityIcon name="arrowLeft" />返回</Link></section>;

  const { member, stats } = result;
  const isSelf = member.isSelf && member.id === currentUser.id;
  const visibleBadges = result.badges ?? [];
  const postHrefState = { communityReturnTo: currentPath };
  const currentlyEarnedBadges = visibleBadges.filter((badge) => badge.isEarned);

  return <section className="admin-design community-page community-member-page" aria-labelledby="community-member-title">
    <Link className="community-thread__back" to={returnTo} onClick={returnToSource}><CommunityIcon name="arrowLeft" />返回</Link>
    {error ? <p className="community-state community-state--error" role="alert">{error}</p> : null}

    <header className="community-member-hero">
      <CommunityAvatar name={member.displayName} src={member.avatarUrl} />
      <div className="community-member-hero__identity">
        <div className="community-member-hero__name"><h1 id="community-member-title">{member.displayName}</h1><TeamIdentityBadge status={member.teamIdentityStatus} /><CommunityLevelBadge level={member.level.level} />{member.featuredBadge ? <CommunityBadgeInfo badge={member.featuredBadge} size={24} /> : null}</div>
        <div className="community-member-hero__groups">
          {member.groups.map((group) => <span key={`${group.name}-${group.role}`}>{group.name} · {group.role}</span>)}
          {member.positions.map((position) => <span key={position.id}>{position.title}</span>)}
          {member.teamJoinedAt ? <span>加入战队 {formatLongDate(member.teamJoinedAt)}</span> : null}
        </div>
        <div className="community-member-hero__bio-row">
          <p className={member.bio ? "" : "is-empty"}>{member.bio || (member.isSelf ? "添加一段个人介绍" : "暂无个人介绍")}</p>
          {isSelf ? <button type="button" className="community-button community-button--quiet community-member-edit-bio" onClick={() => changeTab("settings")}>编辑资料</button> : null}
        </div>
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
      {tabs.filter((item) => (item.id !== "settings" || isSelf) && (item.id !== "management" || isSuperAdmin)).map((item) => <button key={item.id} type="button" aria-current={tab === item.id ? "page" : undefined} onClick={() => changeTab(item.id)}>{item.label}</button>)}
    </nav>
    {loading ? <p className="community-member-loading" role="status">正在更新内容…</p> : null}
    {notice ? <p className="community-state" role="status">{notice}</p> : null}
    {error ? <p className="community-state community-state--error" role="alert">{error}</p> : null}

    {tab === "overview" ? <div className="community-member-overview">
      <section className="community-member-section" aria-labelledby="community-member-activity-title">
        <header><h2 id="community-member-activity-title">近期活动</h2></header>
        {result.activities?.length ? <ol className="community-member-activity">{result.activities.map((activity) => <li key={`${activity.kind}-${activity.id}`}>
          <span className="community-member-activity__marker"><CommunityIcon name={activity.kind === "post" ? "messageCircle" : "cornerDownRight"} /></span>
          <div><p><strong>{activity.kind === "post" ? "发布了帖子" : "回复了讨论"}</strong><time dateTime={activity.createdAt}>{formatCommunityDate(activity.createdAt)}</time></p>
            <div className="community-member-activity__content"><Link to={activity.href} state={postHrefState}>{activity.title || activity.body}</Link><CommunityFeaturedMark featured={activity.isFeatured} /></div>
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
        <div className="community-member-post-item__meta"><span>{communityCategoryLabel(post.category)}</span><time dateTime={post.createdAt}>{formatCommunityDate(post.createdAt)}</time><CommunityFeaturedMark featured={post.isFeatured} />{isSuperAdmin ? <button type="button" className="community-member-feature-action" disabled={featureAction !== null} aria-pressed={post.isFeatured} aria-label={`${post.isFeatured ? "取消" : "设为"}精华：${post.title}`} onClick={() => void setFeatured("post", post.id, post.isFeatured)}><CommunityIcon name="star" />{post.isFeatured ? "取消精华" : "设为精华"}</button> : null}</div>
        <h2><Link to={`/dashboard/community/${post.id}`} state={postHrefState}>{post.title}</Link></h2>
        <p>{stripCommunityMarkdown(post.body)}</p>
        <footer><span><CommunityIcon name="heart" />{post.likeCount}</span><span><CommunityIcon name="messageCircle" />{post.commentCount}</span></footer>
      </article>) : <EmptyState>{loading ? "" : "还没有可展示的帖子"}</EmptyState>}
      <Pagination page={page} hasMore={result.hasMore} onChange={(nextPage) => changeTab("posts", nextPage)} />
    </section> : null}

    {tab === "replies" ? <section className="community-member-section community-member-content-list" aria-label="成员参与的讨论">
      {result.replies?.length ? result.replies.map((reply) => <article key={reply.id} className="community-member-reply-item">
        <p><span>回复了</span><Link to={reply.href} state={postHrefState}>{reply.postTitle}</Link><time dateTime={reply.createdAt}>{formatCommunityDate(reply.createdAt)}</time></p>
        <div className="community-member-reply-item__meta"><CommunityFeaturedMark featured={reply.isFeatured} />{isSuperAdmin ? <button type="button" className="community-member-feature-action" disabled={featureAction !== null} aria-pressed={reply.isFeatured} aria-label={`${reply.isFeatured ? "取消" : "设为"}精华：${reply.postTitle} 中的回复`} onClick={() => void setFeatured("reply", reply.id, reply.isFeatured)}><CommunityIcon name="star" />{reply.isFeatured ? "取消精华" : "设为精华"}</button> : null}</div>
        <Link className="community-member-reply-item__body" to={reply.href} state={postHrefState}>{stripCommunityMarkdown(reply.body)}</Link>
        <footer><span><CommunityIcon name="heart" />{reply.likeCount}</span></footer>
      </article>) : <EmptyState>{loading ? "" : "还没有可展示的回复"}</EmptyState>}
      <Pagination page={page} hasMore={result.hasMore} onChange={(nextPage) => changeTab("replies", nextPage)} />
    </section> : null}

    {tab === "badges" ? <section className="community-member-badges" aria-label="已获得的徽章">
      {isSelf ? <CoBuilderBadgeProfile onReplay={(level: CoBuilderBadgeLevel) => requestBadgeReplay(level)} /> : null}
      {visibleBadges.length ? visibleBadges.map((badge) => <BadgeCard key={badge.key} badge={badge} featured={member.featuredBadge?.key === badge.key} />) : <EmptyState>{loading ? "" : "还没有获得徽章"}</EmptyState>}
    </section> : null}
    {tab === "settings" && isSelf ? <section className="community-member-section community-member-settings" aria-labelledby="community-member-settings-title">
      <header><h2 id="community-member-settings-title">资料设置</h2></header>
      <form className="community-member-public-settings" onSubmit={(event) => void savePublicProfile(event)}>
        <h3>公开资料</h3>
        <label htmlFor="community-member-bio">个人简介</label>
        <textarea id="community-member-bio" value={bioDraft} onChange={(event) => setBioDraft(event.target.value)} maxLength={160} rows={4} />
        <p>简介和代表徽章会展示给社区成员。组别、职位和战队身份由权威资料维护。</p>
        <div className="community-member-public-settings__badge"><label htmlFor="community-featured-badge">代表徽章</label><select id="community-featured-badge" value={selectedBadge} disabled={saving} onChange={(event) => setSelectedBadge(event.target.value)}>
          <option value="">自动选择最高等级</option>{currentlyEarnedBadges.map((badge) => <option key={badge.key} value={badge.key}>{badge.name} · {badge.levelLabel}</option>)}
        </select></div>
        <div className="community-member-bio-editor__actions"><span>{Array.from(bioDraft).length}/160</span><button type="submit" className="community-button community-button--primary" disabled={saving}>{saving ? "保存中…" : "保存公开资料"}</button></div>
      </form>
      <PersonalProfileSettings user={currentUser} groups={groupResolution?.groups.map((group) => group.name) ?? []} onSaved={refreshAccountProfile} />
    </section> : null}
    {tab === "management" && isSuperAdmin ? <section className="community-member-section community-member-admin" aria-labelledby="community-member-admin-title">
      <header><h2 id="community-member-admin-title">成员管理</h2></header>
      <CoBuilderBadgeAdminPanel userId={member.id} onUpdated={() => void refreshManagedMember()} />
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
