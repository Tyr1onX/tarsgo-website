import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { CommunityFeaturedMark } from "~/components/community-featured-mark";
import { communityCategoryLabel, communityClient, communityPostHref, formatCommunityDate, type CommunityTopicRecommendations, type CommunityTopicSummary } from "~/lib/community-client";

export function CommunityRelatedTopics({ postId, returnTo }: { postId: number; returnTo: string }) {
  const sectionRef = useRef<HTMLElement>(null);
  const [load, setLoad] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [topics, setTopics] = useState<CommunityTopicRecommendations | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (!("IntersectionObserver" in window)) {
      setLoad(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: "480px 0px" });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!load || topics) return;
    let active = true;
    setLoading(true);
    setError("");
    void communityClient.related(postId).then((result) => {
      if (active) setTopics(result);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "推荐话题暂时无法读取。");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [load, postId, topics, attempt]);

  function renderRows(items: CommunityTopicSummary[]) {
    return items.map((item) => {
      const lastActivity = item.lastReplyAt ?? item.createdAt;
      return <article key={item.id} className="community-related-topic">
        <h3><Link to={communityPostHref(item.id)} state={{ communityReturnTo: returnTo }}>{item.title}</Link></h3>
        <span className="community-related-topic__labels"><CommunityFeaturedMark featured={item.isFeatured} /><span className="community-post__category">{communityCategoryLabel(item.category)}</span></span>
        <span aria-label={`${item.commentCount} 条回复`}>{item.commentCount} 回复</span>
        <span aria-label={`${item.viewCount} 次浏览`}>{item.viewCount} 浏览</span>
        <time dateTime={lastActivity} title={`最近活动 ${formatCommunityDate(lastActivity)}`}>{formatCommunityDate(lastActivity)}</time>
      </article>;
    });
  }

  return <section ref={sectionRef} className="community-related" aria-labelledby="community-related-title">
    <header className="community-related__heading"><h2 id="community-related-title">继续阅读</h2></header>
    {loading ? <p className="community-related__state" role="status">正在加载话题…</p> : null}
    {error ? <p className="community-related__state community-related__state--error" role="alert">{error}<button type="button" onClick={() => setAttempt((value) => value + 1)}>重试</button></p> : null}
    {topics ? <>
      {topics.related.length ? <section className="community-related__group" aria-labelledby="community-related-topics-title"><h3 id="community-related-topics-title">相关话题</h3><div>{renderRows(topics.related)}</div></section> : null}
      {topics.recommended.length ? <section className="community-related__group" aria-labelledby="community-recommended-topics-title"><h3 id="community-recommended-topics-title">推荐话题</h3><div>{renderRows(topics.recommended)}</div></section> : null}
      {!topics.related.length && !topics.recommended.length ? <p className="community-related__state">暂时没有可继续阅读的话题。</p> : null}
    </> : null}
  </section>;
}
