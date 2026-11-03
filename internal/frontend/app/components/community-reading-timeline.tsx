import { useEffect, useRef, useState } from "react";

import { CommunityIcon } from "~/components/community-icons";
import { formatCommunityDate } from "~/lib/community-client";
import type { CommunityReadingEntry } from "~/lib/community-discussion-model";

export function CommunityReadingTimeline({ entries, hotReplyID }: { entries: CommunityReadingEntry[]; hotReplyID: number | null }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const manualJumpUntilRef = useRef(0);
  const entryKey = entries.map((entry) => entry.targetId).join("|");
  const hotReplyIndex = hotReplyID === null ? -1 : entries.findIndex((entry) => entry.commentId === hotReplyID);
  const lastIndex = Math.max(0, entries.length - 1);
  const progress = entries.length < 2 ? 100 : Math.round((activeIndex / lastIndex) * 100);

  useEffect(() => {
    if (entries.length === 0 || typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;

    const wideScreen = window.matchMedia("(min-width: 1480px)");
    let observer: IntersectionObserver | null = null;
    const observeReadingTargets = () => {
      observer?.disconnect();
      observer = null;
      if (!wideScreen.matches) return;

      const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-community-reading-index]"));
      if (targets.length === 0) return;
      const readingLine = 100;
      const readingBandHeight = 2;
      const bottomInset = Math.max(0, window.innerHeight - readingLine - readingBandHeight);
      observer = new IntersectionObserver((changes) => {
        if (Date.now() < manualJumpUntilRef.current) return;
        const visible = changes.filter((change) => change.isIntersecting);
        if (visible.length === 0) return;
        visible.sort((left, right) => Math.abs(left.boundingClientRect.top - readingLine) - Math.abs(right.boundingClientRect.top - readingLine));
        const nextIndex = Number(visible[0].target instanceof HTMLElement ? visible[0].target.dataset.communityReadingIndex : NaN);
        if (Number.isInteger(nextIndex) && nextIndex >= 0 && nextIndex < entries.length) {
          setActiveIndex((current) => current === nextIndex ? current : nextIndex);
        }
      }, { rootMargin: `-${readingLine}px 0px -${bottomInset}px 0px`, threshold: 0 });
      targets.forEach((target) => observer?.observe(target));
    };

    observeReadingTargets();
    wideScreen.addEventListener("change", observeReadingTargets);
    window.addEventListener("resize", observeReadingTargets, { passive: true });
    return () => {
      wideScreen.removeEventListener("change", observeReadingTargets);
      window.removeEventListener("resize", observeReadingTargets);
      observer?.disconnect();
    };
  }, [entryKey, entries.length]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, entries.length - 1)));
  }, [entryKey, entries.length]);

  function jumpTo(index: number) {
    const entry = entries[index];
    if (!entry) return;
    manualJumpUntilRef.current = Date.now() + 1200;
    setActiveIndex(index);
    document.getElementById(entry.targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return <aside className="community-reading-timeline" aria-label="帖子阅读时间轴">
    <header className="community-reading-timeline__header">
      <span>阅读进度</span>
      <strong aria-live="polite">{entries.length ? activeIndex + 1 : 0} / {entries.length}</strong>
    </header>
    <div className="community-reading-timeline__progress" role="progressbar" aria-label="阅读进度" aria-valuemin={1} aria-valuemax={Math.max(1, entries.length)} aria-valuenow={entries.length ? activeIndex + 1 : 0}>
      <span style={{ width: `${progress}%` }} />
    </div>
    <div className="community-reading-timeline__quick-actions">
      <button type="button" onClick={() => jumpTo(0)}>开头</button>
      <button type="button" disabled={entries.length < 2} onClick={() => jumpTo(lastIndex)}>最新</button>
    </div>
    {hotReplyIndex >= 0 ? <button type="button" className="community-reading-timeline__hot" onClick={() => jumpTo(hotReplyIndex)}>
      <CommunityIcon name="flame" />热门回复
    </button> : null}
    <ol className="community-reading-timeline__items">
      {entries.map((entry, index) => <li key={entry.targetId}>
        <button type="button" className={index === activeIndex ? "is-active" : ""} aria-current={index === activeIndex ? "location" : undefined} aria-label={`${index + 1}，${entry.label}，${formatCommunityDate(entry.createdAt)}`} onClick={() => jumpTo(index)}>
          <span className="community-reading-timeline__dot" aria-hidden="true" />
          <span className="community-reading-timeline__entry-copy">
            <span>{entry.kind === "post" ? "原帖" : `回复 ${index}`}</span>
            <time dateTime={entry.createdAt}>{formatCommunityDate(entry.createdAt)}</time>
          </span>
          {entry.isAcceptedSolution ? <CommunityIcon name="check" className="community-reading-timeline__marker is-solution" /> : null}
          {entry.isFeatured ? <CommunityIcon name="star" className="community-reading-timeline__marker is-featured" /> : null}
        </button>
      </li>)}
    </ol>
  </aside>;
}
