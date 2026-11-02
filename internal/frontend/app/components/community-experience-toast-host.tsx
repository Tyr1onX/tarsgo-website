import { useCallback, useEffect, useRef, useState } from "react";

import { communityClient, type CommunityExperienceEntry, type CommunityGrowthProfile } from "~/lib/community-client";
import {
  communityExperienceStorageKey,
  communityExperienceToastLabel,
  newCommunityExperienceEvents,
  readPendingCommunityExperienceToasts,
  publishCommunityGrowthError,
  publishCommunityGrowthProfile,
  subscribeToCommunityExperienceRefresh,
  subscribeToCommunityGrowthServerProfile,
  writePendingCommunityExperienceToasts,
  type PendingCommunityExperienceToast,
} from "~/lib/community-experience-sync";
import "./community-experience-toast.css";

type CommunityExperienceToast = Omit<PendingCommunityExperienceToast, "expiresAt">;

const syncIntervalMs = 15_000;
const recentAvatarRewardWindowMs = 7 * 24 * 60 * 60 * 1_000;
const recentCommunityRewardWindowMs = 45_000;

export function CommunityExperienceToastHost({ userID }: { userID: number }) {
  const [toasts, setToasts] = useState<CommunityExperienceToast[]>([]);
  const profileRef = useRef<CommunityGrowthProfile | null>(null);
  const lastSeenEventIDRef = useRef<number | null>(null);
  const requestRunningRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const timersRef = useRef(new Map<number, number>());
  const pendingToastsRef = useRef(new Map<number, PendingCommunityExperienceToast>());

  const dismissToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timersRef.current.delete(id);
    pendingToastsRef.current.delete(id);
    writePendingCommunityExperienceToasts(userID, [...pendingToastsRef.current.values()]);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, [userID]);

  useEffect(() => {
    let active = true;
    try {
      const stored = Number(window.sessionStorage.getItem(communityExperienceStorageKey(userID)));
      if (Number.isSafeInteger(stored) && stored > 0) lastSeenEventIDRef.current = stored;
    } catch {
      // Session storage is optional; the in-memory cursor still prevents duplicate events.
    }

    function scheduleDismiss(toast: PendingCommunityExperienceToast) {
      const delay = Math.max(0, toast.expiresAt - Date.now());
      timersRef.current.set(toast.id, window.setTimeout(() => dismissToast(toast.id), delay));
    }

    const pending = readPendingCommunityExperienceToasts(userID);
    pendingToastsRef.current = new Map(pending.map((toast) => [toast.id, toast]));
    writePendingCommunityExperienceToasts(userID, pending);
    if (pending.length) {
      setToasts(pending.map(({ expiresAt: _expiresAt, ...toast }) => toast));
      pending.forEach(scheduleDismiss);
    }

    function acceptProfile(profile: CommunityGrowthProfile) {
      if (!active) return;
      const previous = profileRef.current;
      const maximumEventID = profile.recentEvents.reduce((maximum, event) => Math.max(maximum, event.id), 0);
      let newEvents: CommunityExperienceEntry[] = [];
      if (lastSeenEventIDRef.current === null) {
        const now = Date.now();
        newEvents = profile.recentEvents.filter((event) =>
          event.points > 0 && !event.revoked && (now - Date.parse(event.createdAt) <= recentCommunityRewardWindowMs ||
            event.type === "avatar" && now - Date.parse(event.createdAt) <= recentAvatarRewardWindowMs),
        ).sort((left, right) => left.id - right.id);
      } else {
        newEvents = newCommunityExperienceEvents(profile, lastSeenEventIDRef.current);
      }

      const upgradedLevel = previous && profile.level > previous.level ? profile.level : undefined;
      const lastNewEventID = newEvents.at(-1)?.id;
      const additions = newEvents.map((event) => ({
        id: event.id,
        label: communityExperienceToastLabel(event),
        points: event.points,
        levelUp: upgradedLevel && event.id === lastNewEventID ? upgradedLevel : undefined,
        expiresAt: Date.now() + 3_000,
      }));
      if (additions.length) {
        for (const toast of additions) {
          if (!pendingToastsRef.current.has(toast.id)) {
            pendingToastsRef.current.set(toast.id, toast);
            scheduleDismiss(toast);
          }
        }
        writePendingCommunityExperienceToasts(userID, [...pendingToastsRef.current.values()]);
        setToasts((current) => {
          const existing = new Set(current.map((toast) => toast.id));
          return [...current, ...additions.filter((toast) => !existing.has(toast.id)).map(({ expiresAt: _expiresAt, ...toast }) => toast)];
        });
      }

      profileRef.current = profile;
      lastSeenEventIDRef.current = Math.max(lastSeenEventIDRef.current ?? 0, maximumEventID);
      try {
        if (lastSeenEventIDRef.current > 0) {
          window.sessionStorage.setItem(communityExperienceStorageKey(userID), String(lastSeenEventIDRef.current));
        }
      } catch {
        // Keep showing server-confirmed XP even when the browser blocks storage.
      }
      publishCommunityGrowthProfile(profile);
      publishCommunityGrowthError("");
    }

    async function refresh() {
      if (!active) return;
      if (requestRunningRef.current) {
        refreshQueuedRef.current = true;
        return;
      }
      requestRunningRef.current = true;
      try {
        acceptProfile(await communityClient.growth());
      } catch (cause) {
        // XP feedback is best-effort; the next mutation or visible-page sync retries.
        publishCommunityGrowthError(cause instanceof Error ? cause.message : "社区成长信息暂时无法读取。");
      } finally {
        requestRunningRef.current = false;
        if (refreshQueuedRef.current) {
          refreshQueuedRef.current = false;
          void refresh();
        }
      }
    }

    const stopRefresh = subscribeToCommunityExperienceRefresh(() => { void refresh(); });
    const stopServerProfiles = subscribeToCommunityGrowthServerProfile(acceptProfile);
    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", syncWhenVisible);
    window.addEventListener("focus", syncWhenVisible);
    const interval = window.setInterval(syncWhenVisible, syncIntervalMs);
    void refresh();

    return () => {
      active = false;
      stopRefresh();
      stopServerProfiles();
      document.removeEventListener("visibilitychange", syncWhenVisible);
      window.removeEventListener("focus", syncWhenVisible);
      window.clearInterval(interval);
      for (const timer of timersRef.current.values()) window.clearTimeout(timer);
      timersRef.current.clear();
    };
  }, [userID, dismissToast]);

  if (!toasts.length) return null;
  return <ol className="community-xp-toasts" aria-label="经验获得提示">
    {toasts.map((toast) => <li className="community-xp-toast" key={toast.id} role="status" aria-live="polite">
      <span className="community-xp-toast__mark" aria-hidden="true">+{toast.points}</span>
      <span className="community-xp-toast__copy">
        <strong>{toast.label}<span>+{toast.points} XP</span></strong>
        {toast.levelUp ? <small>升级成功 · Lv.{toast.levelUp}</small> : null}
      </span>
      <button type="button" className="community-xp-toast__close" aria-label={`关闭经验提示：${toast.label}`} onClick={() => {
        dismissToast(toast.id);
      }}>×</button>
    </li>)}
  </ol>;
}
