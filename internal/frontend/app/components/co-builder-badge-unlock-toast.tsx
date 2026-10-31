import { useEffect, useState } from "react";

import { CoBuilderBadgeMark } from "~/components/co-builder-badge-mark";
import {
  acknowledgeMyCoBuilderBadgeUnlock,
  claimMyCoBuilderBadgeUnlock,
  type CoBuilderBadgeReplayRequest,
  type CoBuilderBadgeUnlockNotice,
} from "~/lib/co-builder-badge-client";

const replayLevelLabels = {
  bronze: "青铜 I",
  silver: "白银 II",
  gold: "黄金 III",
} as const;

const unlockAnimationDuration = 4400;

export function CoBuilderBadgeUnlockToast({
  onOpenProfile,
  replayRequest,
  onReplayComplete,
}: {
  onOpenProfile: () => void;
  replayRequest: CoBuilderBadgeReplayRequest | null;
  onReplayComplete: (requestId: number) => void;
}) {
  const [notice, setNotice] = useState<CoBuilderBadgeUnlockNotice | null>(null);

  useEffect(() => {
    let active = true;
    void claimMyCoBuilderBadgeUnlock()
      .then((value) => { if (active) setNotice(value); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!notice) return;
    let displayed = false;
    let acknowledged = false;
    const tryAcknowledge = () => {
      if (!displayed || acknowledged || document.visibilityState === "hidden") return;
      acknowledged = true;
      void acknowledgeMyCoBuilderBadgeUnlock(notice.claimToken).catch(() => {});
    };
    const presentationTimer = window.setTimeout(() => {
      displayed = true;
      tryAcknowledge();
    }, 420);
    const dismissalTimer = window.setTimeout(() => setNotice(null), 4400);
    document.addEventListener("visibilitychange", tryAcknowledge);
    return () => {
      window.clearTimeout(presentationTimer);
      window.clearTimeout(dismissalTimer);
      document.removeEventListener("visibilitychange", tryAcknowledge);
    };
  }, [notice]);

  useEffect(() => {
    if (!replayRequest || notice) return;
    const replayTimer = window.setTimeout(() => onReplayComplete(replayRequest.requestId), unlockAnimationDuration);
    return () => window.clearTimeout(replayTimer);
  }, [notice, onReplayComplete, replayRequest]);

  const activeReplay = notice ? null : replayRequest;
  const replaying = Boolean(activeReplay);
  const levelCode = activeReplay?.levelCode ?? notice?.levelCode;
  const levelLabel = activeReplay ? replayLevelLabels[activeReplay.levelCode] : notice?.levelLabel;
  if (!levelCode || !levelLabel) return null;
  const animationKey = activeReplay ? `replay-${activeReplay.requestId}` : `unlock-${notice?.claimToken ?? "pending"}`;
  const romanLevel = levelLabel.split(" ").at(-1) ?? "";

  return (
    <div key={animationKey} className={`co-builder-unlock${replaying ? " co-builder-unlock--replay" : ""}`} role="status" aria-live="polite">
      <button
        type="button"
        className="co-builder-unlock__button"
        onClick={onOpenProfile}
        aria-label={replaying
          ? `正在重播吉甲共建者 ${levelLabel}勋章解锁动画`
          : `吉甲共建者 ${levelLabel}勋章，点击查看个人资料中的勋章和贡献记录`}
      >
        <span className="co-builder-unlock__emblem">
          <CoBuilderBadgeMark level={levelCode} size={78} className="co-builder-unlock__mark" />
          <span className="co-builder-unlock__sheen" aria-hidden="true" />
        </span>
        <span className="co-builder-unlock__copy">
          <span className="co-builder-unlock__eyebrow">ACHIEVEMENT UNLOCKED</span>
          <strong>吉甲共建者 <span aria-hidden="true">·</span> {romanLevel}</strong>
          <span className="co-builder-unlock__caption">你的贡献，让吉甲变得更好。</span>
        </span>
      </button>
    </div>
  );
}
