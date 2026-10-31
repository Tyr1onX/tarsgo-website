import { useEffect, useState } from "react";

import { CoBuilderBadgeMark } from "~/components/co-builder-badge-mark";
import {
  acknowledgeMyCoBuilderBadgeUnlock,
  claimMyCoBuilderBadgeUnlock,
  type CoBuilderBadgeUnlockNotice,
} from "~/lib/co-builder-badge-client";

export function CoBuilderBadgeUnlockToast({ onOpenProfile }: { onOpenProfile: () => void }) {
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

  if (!notice) return null;
  const romanLevel = notice.levelLabel.split(" ").at(-1) ?? "";

  return (
    <div className="co-builder-unlock" role="status" aria-live="polite">
      <button
        type="button"
        className="co-builder-unlock__button"
        onClick={onOpenProfile}
        aria-label={`吉甲共建者 ${notice.levelLabel}勋章，点击查看个人资料中的勋章和贡献记录`}
      >
        <span className="co-builder-unlock__emblem">
          <CoBuilderBadgeMark level={notice.levelCode} size={78} className="co-builder-unlock__mark" />
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
