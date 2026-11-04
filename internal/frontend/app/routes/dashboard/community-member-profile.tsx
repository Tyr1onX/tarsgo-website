import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from "react";
import { Link, useLocation, useNavigate, useNavigationType, useOutletContext, useParams, useSearchParams } from "react-router";

import { CommunityBadgeInfo } from "~/components/community-badge-mark";
import { CommunityFeaturedMark } from "~/components/community-featured-mark";
import { TeamIdentityBadge } from "~/components/community-team-identity";
import { CommunityIcon } from "~/components/community-icons";
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
import { updateProfile } from "~/lib/auth-client";
import { stripCommunityMarkdown } from "~/lib/community-markdown";
import "./community.css";

const tabs = [
  { id: "overview", label: "概览" },
  { id: "posts", label: "帖子" },
  { id: "replies", label: "回复" },
  { id: "badges", label: "徽章" },
] as const;

type ProfileTab = (typeof tabs)[number]["id"] | "settings";

function profileTab(value: string | null): ProfileTab {
  if (value === "settings") return value;
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
  const { currentUser, refreshAccountProfile, requestBadgeReplay } = useOutletContext<DashboardLayoutOutletContext>();
  const tab = profileTab(searchParams.get("tab"));
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const [result, setResult] = useState<CommunityMemberProfileResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [bioError, setBioError] = useState("");
  const [bioSaving, setBioSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [editingFeaturedBadge, setEditingFeaturedBadge] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState("");
  const [badgeError, setBadgeError] = useState("");
  const [badgeSaving, setBadgeSaving] = useState(false);
  const [featureAction, setFeatureAction] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const skipNameBlurRef = useRef(false);
  const nameSaveLockRef = useRef(false);
  const bioSaveLockRef = useRef(false);
  const skipBioBlurRef = useRef(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
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
    const apiTab = tab === "settings" ? "card" : tab;
    communityMemberProfileClient.get(memberID, apiTab, tab === "settings" ? 1 : page).then((next) => {
      if (!active) return;
      setResult(next);
      setNameDraft(next.member.displayName);
      setBioDraft(next.member.bio);
      setSelectedBadge(next.member.featuredBadgeKey ?? "");
      setEditingName(false);
      setEditingBio(false);
      setEditingFeaturedBadge(false);
      setNameError("");
      setBioError("");
      setBadgeError("");
      if (tab === "settings" && (next.member.id !== currentUser.id || !next.member.isSelf)) {
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
  }, [memberID, tab, page, currentUser.id]);

  function changeTab(next: ProfileTab, nextPage = 1) {
    const params = new URLSearchParams(location.search);
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    if (nextPage > 1) params.set("page", String(nextPage));
    else params.delete("page");
    const query = params.toString();
    navigate(`${location.pathname}${query ? `?${query}` : ""}`, { state: location.state, preventScrollReset: true });
  }

  async function saveBio() {
    if (!result || !result.member.isSelf || result.member.id !== currentUser.id || result.member.id !== memberID || bioSaveLockRef.current) return;
    const nextBio = bioDraft.trim();
    if (nextBio === member.bio) {
      setBioError("");
      setEditingBio(false);
      return;
    }
    bioSaveLockRef.current = true;
    setBioSaving(true);
    setBioError("");
    try {
      const updated = await communityMemberProfileClient.updateMine({ bio: nextBio });
      setResult((current) => current?.member.id === updated.member.id ? { ...current, member: { ...current.member, bio: updated.member.bio } } : current);
      setBioDraft(updated.member.bio);
      setEditingBio(false);
      clearCommunityLists();
    } catch (cause) {
      setBioError(cause instanceof Error ? cause.message : "个人介绍保存失败，请稍后重试。");
    } finally {
      bioSaveLockRef.current = false;
      setBioSaving(false);
    }
  }

  function cancelBioEdit() {
    skipBioBlurRef.current = true;
    setBioDraft(member.bio);
    setBioError("");
    setEditingBio(false);
  }

  function handleBioKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || bioSaving) return;
    if (event.key === "Escape") {
      event.preventDefault();
      cancelBioEdit();
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      skipBioBlurRef.current = true;
      void saveBio();
    }
  }

  function handleBioBlur() {
    if (!skipBioBlurRef.current) void saveBio();
    skipBioBlurRef.current = false;
  }

  async function saveName() {
    if (!result || !result.member.isSelf || result.member.id !== currentUser.id || result.member.id !== memberID || nameSaveLockRef.current) return;
    const nextName = nameDraft.trim();
    if (!isChineseRealName(nextName)) {
      setNameError("姓名需为 1 至 100 个汉字。");
      return;
    }
    if (nextName === member.displayName) {
      setNameError("");
      setEditingName(false);
      return;
    }

    nameSaveLockRef.current = true;
    setNameSaving(true);
    setNameError("");
    try {
      const updatedUser = await updateProfile({ realName: nextName, avatar: null });
      const savedName = updatedUser.realName?.trim() ?? nextName;
      setResult((current) => current?.member.id === updatedUser.id ? { ...current, member: { ...current.member, displayName: savedName } } : current);
      setNameDraft(savedName);
      setEditingName(false);
      clearCommunityLists();
      refreshAccountProfile();
    } catch (cause) {
      setNameError(cause instanceof Error ? cause.message : "姓名保存失败，请稍后重试。");
    } finally {
      nameSaveLockRef.current = false;
      setNameSaving(false);
    }
  }

  function cancelNameEdit() {
    skipNameBlurRef.current = true;
    setNameDraft(member.displayName);
    setNameError("");
    setEditingName(false);
  }

  function handleNameBlur() {
    if (!skipNameBlurRef.current) void saveName();
    skipNameBlurRef.current = false;
  }

  function handleNameKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || nameSaving) return;
    if (event.key === "Enter") {
      event.preventDefault();
      skipNameBlurRef.current = true;
      void saveName();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelNameEdit();
    }
  }

  async function uploadAvatar(file: File) {
    setAvatarUploading(true);
    setAvatarError("");
    try {
      const updatedUser = await updateProfile({ realName: member.displayName.trim(), avatar: file });
      const avatarUrl = updatedUser.avatarUrl?.trim() || undefined;
      setResult((current) => current?.member.id === updatedUser.id ? { ...current, member: { ...current.member, displayName: updatedUser.realName?.trim() ?? current.member.displayName, avatarUrl } } : current);
      clearCommunityLists();
      refreshAccountProfile();
    } catch (cause) {
      setAvatarError(cause instanceof Error ? cause.message : "头像上传失败，请稍后重试。");
    } finally {
      setAvatarUploading(false);
    }
  }

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError("头像不能超过 2 MB。");
      return;
    }
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setAvatarError("头像仅支持 JPG 或 PNG。");
      return;
    }
    void uploadAvatar(file);
  }

  async function saveFeaturedBadge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result || badgeSaving) return;
    setBadgeSaving(true);
    setBadgeError("");
    try {
      const updated = await communityMemberProfileClient.updateMine({ featuredBadgeKey: selectedBadge });
      setResult((current) => current?.member.id === updated.member.id ? { ...current, member: { ...current.member, featuredBadge: updated.member.featuredBadge, featuredBadgeKey: updated.member.featuredBadgeKey } } : current);
      setSelectedBadge(updated.member.featuredBadgeKey ?? "");
      setEditingFeaturedBadge(false);
      clearCommunityLists();
    } catch (cause) {
      setBadgeError(cause instanceof Error ? cause.message : "代表徽章保存失败，请稍后重试。");
    } finally {
      setBadgeSaving(false);
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

  if (loading && !result) return <section className="admin-design community-page"><p className="community-state" role="status">正在读取成员主页…</p></section>;
  if (!result) return <section className="admin-design community-page"><p className="community-state community-state--error" role="alert">{error || "成员主页不存在。"}</p><Link className="community-thread__back" to={returnTo} onClick={returnToSource}><CommunityIcon name="arrowLeft" />返回</Link></section>;

  const { member } = result;
  const isSelf = member.isSelf && member.id === currentUser.id && member.id === memberID;
  const visibleBadges = (result.badges ?? []).filter((badge) => badge.isEarned);
  const postHrefState = { communityReturnTo: currentPath };

  return <section className="admin-design community-page community-member-page" aria-labelledby="community-member-title">
    <Link className="community-thread__back" to={returnTo} onClick={returnToSource}><CommunityIcon name="arrowLeft" />返回</Link>
    {error ? <p className="community-state community-state--error" role="alert">{error}</p> : null}

    <header className="community-member-hero">
      <div className="community-member-hero__avatar-wrap">
        {isSelf ? <>
          <button type="button" className="community-member-hero__avatar-button" aria-label="更换头像" aria-controls="community-member-avatar-file" disabled={avatarUploading} onClick={() => avatarInputRef.current?.click()}>
            <CommunityAvatar name={member.displayName} src={member.avatarUrl} />
            <span className="community-member-hero__avatar-overlay" aria-hidden="true">{avatarUploading ? "上传中…" : "更换"}</span>
          </button>
          <input ref={avatarInputRef} id="community-member-avatar-file" className="sr-only" type="file" accept="image/png,image/jpeg" tabIndex={-1} disabled={avatarUploading} onChange={handleAvatarChange} />
          {avatarUploading ? <span className="community-member-hero__avatar-status" role="status">正在更新头像…</span> : null}
        </> : <CommunityAvatar name={member.displayName} src={member.avatarUrl} />}
      </div>
      <div className="community-member-hero__identity">
        <div className="community-member-hero__name">
          <h1 id="community-member-title">
            {editingName && isSelf ? <span className="community-member-name-editor">
              <span aria-hidden="true">{nameDraft || " "}</span>
              <input type="text" autoComplete="name" autoFocus required maxLength={100} aria-label="姓名" aria-invalid={Boolean(nameError)} aria-describedby={nameError ? "community-member-name-error" : undefined} value={nameDraft} readOnly={nameSaving} onFocus={() => { skipNameBlurRef.current = false; }} onBlur={handleNameBlur} onChange={(event) => { skipNameBlurRef.current = false; setNameDraft(event.target.value); }} onKeyDown={handleNameKeyDown} />
            </span> : isSelf ? <button type="button" className="community-member-name-trigger" aria-label="编辑姓名" onClick={() => { skipNameBlurRef.current = false; setNameDraft(member.displayName); setNameError(""); setEditingName(true); }}>{member.displayName}</button> : member.displayName}
          </h1>
          <TeamIdentityBadge status={member.teamIdentityStatus} />
        </div>
        {nameError ? <p id="community-member-name-error" className="community-member-inline-error" role="alert">{nameError}</p> : null}
        <div className="community-member-hero__bio-row">
          {editingBio && isSelf ? <div className="community-member-bio-editor">
            <span aria-hidden="true">{bioDraft || "添加一段个人介绍"}{"\u200b"}</span>
            <textarea aria-label="个人介绍" aria-invalid={Boolean(bioError)} aria-describedby={bioError ? "community-member-bio-error" : undefined} placeholder="添加一段个人介绍" autoFocus maxLength={160} rows={1} value={bioDraft} readOnly={bioSaving} onFocus={() => { skipBioBlurRef.current = false; }} onBlur={handleBioBlur} onChange={(event) => { skipBioBlurRef.current = false; setBioDraft(event.target.value); }} onKeyDown={handleBioKeyDown} />
          </div> : isSelf ? <button type="button" className={`community-member-bio-trigger${member.bio ? "" : " is-empty"}`} aria-label="编辑个人介绍" onClick={() => { skipBioBlurRef.current = false; setBioDraft(member.bio); setBioError(""); setEditingBio(true); }}>{member.bio || "添加一段个人介绍"}</button> : member.bio ? <p>{member.bio}</p> : null}
          {bioError ? <p id="community-member-bio-error" className="community-member-inline-error" role="alert">{bioError}</p> : null}
        </div>
        <div className="community-member-level" aria-label={`社区等级 Lv.${member.level.level}，总经验 ${member.level.totalXp} XP，距离下一级还差 ${Math.max(0, member.level.xpToNextLevel)} XP`}>
          <div className="community-member-level__label"><span>社区等级 Lv.{member.level.level}</span><span>{member.level.totalXp.toLocaleString("zh-CN")} XP</span></div>
          <div className="community-member-level__track" role="progressbar" aria-label="升级进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(member.level.progress * 100)}><span style={{ width: `${Math.round(member.level.progress * 100)}%` }} /></div>
          <span className="community-member-level__next">距离 Lv.{member.level.level + 1} 还差 {Math.max(0, member.level.xpToNextLevel).toLocaleString("zh-CN")} XP</span>
        </div>
      </div>
      {avatarError ? <p className="community-member-avatar-error" role="alert">{avatarError}</p> : null}
    </header>

    {tab !== "settings" ? <nav className="community-member-tabs" aria-label="成员主页栏目">
      {tabs.map((item) => <button key={item.id} type="button" aria-current={tab === item.id ? "page" : undefined} onClick={() => changeTab(item.id)}>{item.label}</button>)}
    </nav> : null}
    {loading ? <p className="community-member-loading" role="status">正在更新内容…</p> : null}
    {notice ? <p className="community-state" role="status">{notice}</p> : null}

    {tab === "overview" ? <div className="community-member-overview">
      <dl className="community-member-details">
        {member.groups.length ? <div><dt>所属组别</dt><dd>{member.groups.map((group) => <span key={group.name}>{group.name}{group.role === "组长" ? " · 组长" : ""}</span>)}</dd></div> : null}
        {member.positions.length ? <div><dt>当前岗位</dt><dd>{member.positions.map((position) => <span key={position.id}>{position.title}</span>)}</dd></div> : null}
        {member.teamJoinedAt && formatLongDate(member.teamJoinedAt) ? <div><dt>加入战队</dt><dd><time dateTime={member.teamJoinedAt}>{formatLongDate(member.teamJoinedAt)}</time></dd></div> : null}
      </dl>
      <dl className="community-member-stats" aria-label="社区参与统计">
        <div><dt>帖子</dt><dd>{result.stats.postCount.toLocaleString("zh-CN")}</dd></div>
        <div><dt>回复</dt><dd>{result.stats.replyCount.toLocaleString("zh-CN")}</dd></div>
        <div><dt>获赞</dt><dd>{result.stats.likeCount.toLocaleString("zh-CN")}</dd></div>
      </dl>
      {member.featuredBadge ? <div className="community-member-representative" aria-label="代表徽章"><CommunityBadgeInfo badge={member.featuredBadge} size={48} /><div><strong>{member.featuredBadge.name}</strong><span>{member.featuredBadge.levelLabel}</span></div></div> : null}
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
      {isSelf && visibleBadges.length > 0 ? editingFeaturedBadge ? <form className="community-member-badges__selection" onSubmit={(event) => void saveFeaturedBadge(event)}>
        <label htmlFor="community-featured-badge">代表徽章</label>
        <select id="community-featured-badge" value={selectedBadge} disabled={badgeSaving} onChange={(event) => setSelectedBadge(event.target.value)}>
          <option value="">自动选择最高等级</option>{visibleBadges.map((badge) => <option key={badge.key} value={badge.key}>{badge.name} · {badge.levelLabel}</option>)}
        </select>
        <button type="submit" className="community-button community-button--primary" disabled={badgeSaving}>{badgeSaving ? "保存中…" : "保存"}</button>
        <button type="button" className="community-button community-button--quiet" disabled={badgeSaving} onClick={() => { setSelectedBadge(member.featuredBadgeKey ?? ""); setBadgeError(""); setEditingFeaturedBadge(false); }}>取消</button>
        {badgeError ? <p className="community-member-inline-error" role="alert">{badgeError}</p> : null}
      </form> : <button type="button" className="community-inline-link community-member-badges__edit" onClick={() => { setSelectedBadge(member.featuredBadgeKey ?? ""); setBadgeError(""); setEditingFeaturedBadge(true); }}>设置代表徽章</button> : null}
      {visibleBadges.length ? <div className="community-member-badge-grid">{visibleBadges.map((badge) => <BadgeCard key={badge.key} badge={badge} onReplay={isSelf ? requestBadgeReplay : undefined} />)}</div> : <EmptyState>{loading ? "" : "还没有获得徽章"}</EmptyState>}
    </section> : null}
    {tab === "settings" && isSelf ? <section className="community-member-section community-member-settings" aria-labelledby="community-member-settings-title">
      <header><h2 id="community-member-settings-title">其他设置</h2></header>
      <PersonalProfileSettings user={currentUser} />
    </section> : null}
  </section>;
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

function BadgeCard({ badge, onReplay }: { badge: CommunityPublicBadge; onReplay?: (level: CoBuilderBadgeLevel) => void }) {
  return <article className="community-member-badge-card">
    <CommunityBadgeInfo badge={badge} size={56} onReplay={badge.key === "co_builder" && badge.levelCode !== "none" && onReplay ? () => onReplay(badge.levelCode as CoBuilderBadgeLevel) : undefined} />
    <h2>{badge.name}</h2><span>{badge.levelLabel}</span>
  </article>;
}

function formatLongDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric" }).format(date);
}

function isChineseRealName(value: string) {
  const characters = [...value];
  return characters.length >= 1 && characters.length <= 100 && characters.every((character) => /\p{Script=Han}/u.test(character));
}
