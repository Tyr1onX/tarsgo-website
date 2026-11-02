import type { CommunityExperienceEntry, CommunityGrowthProfile } from "~/lib/community-client";

const refreshEventName = "community:experience-refresh";
const serverProfileEventName = "community:experience-server-profile";
const profileUpdatedEventName = "community:experience-profile-updated";
const profileErrorEventName = "community:experience-profile-error";

export function requestCommunityExperienceRefresh() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(refreshEventName));
}

export function reportCommunityGrowthProfile(profile: CommunityGrowthProfile) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<CommunityGrowthProfile>(serverProfileEventName, { detail: profile }));
  }
}

export function publishCommunityGrowthProfile(profile: CommunityGrowthProfile) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<CommunityGrowthProfile>(profileUpdatedEventName, { detail: profile }));
  }
}

export function publishCommunityGrowthError(message: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<string>(profileErrorEventName, { detail: message }));
}

export function subscribeCommunityGrowthProfile(listener: (profile: CommunityGrowthProfile) => void) {
  if (typeof window === "undefined") return () => {};
  const handle = (event: Event) => listener((event as CustomEvent<CommunityGrowthProfile>).detail);
  window.addEventListener(profileUpdatedEventName, handle);
  return () => window.removeEventListener(profileUpdatedEventName, handle);
}

export function subscribeCommunityGrowthError(listener: (message: string) => void) {
  if (typeof window === "undefined") return () => {};
  const handle = (event: Event) => listener((event as CustomEvent<string>).detail);
  window.addEventListener(profileErrorEventName, handle);
  return () => window.removeEventListener(profileErrorEventName, handle);
}

export function subscribeToCommunityGrowthServerProfile(listener: (profile: CommunityGrowthProfile) => void) {
  if (typeof window === "undefined") return () => {};
  const handle = (event: Event) => listener((event as CustomEvent<CommunityGrowthProfile>).detail);
  window.addEventListener(serverProfileEventName, handle);
  return () => window.removeEventListener(serverProfileEventName, handle);
}

export function subscribeToCommunityExperienceRefresh(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(refreshEventName, listener);
  return () => window.removeEventListener(refreshEventName, listener);
}

export function newCommunityExperienceEvents(profile: CommunityGrowthProfile, afterID: number): CommunityExperienceEntry[] {
  return profile.recentEvents
    .filter((event) => {
      const id = normalizeCommunityExperienceEventID(event.id);
      return id !== null && id > afterID && event.points > 0 && !event.revoked;
    })
    .sort((left, right) => (normalizeCommunityExperienceEventID(left.id) ?? 0) - (normalizeCommunityExperienceEventID(right.id) ?? 0));
}

export function normalizeCommunityExperienceEventID(value: unknown): number | null {
  const id = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function communityExperienceToastLabel(event: CommunityExperienceEntry) {
  switch (event.type) {
    case "check_in": return "每日签到";
    case "post": return "发布帖子成功";
    case "comment": return "发表评论成功";
    case "avatar": return "首次设置头像";
    case "post_like": return "帖子获得点赞";
    case "comment_like": return "回复获得点赞";
    case "reply": return "帖子收到回复";
    case "accepted_solution": return "回答被采纳";
    default: return event.label;
  }
}

export function communityExperienceStorageKey(userID: number) {
  return `community-experience-last-event:${userID}`;
}

export interface PendingCommunityExperienceToast {
  id: number;
  label: string;
  points: number;
  levelUp?: number;
  expiresAt: number;
}

export function communityExperiencePendingStorageKey(userID: number) {
  return `community-experience-pending-toasts:${userID}`;
}

export function communityExperienceDismissedStorageKey(userID: number) {
  return `community-experience-dismissed-toasts:${userID}`;
}

const maximumRememberedDismissedEvents = 200;

export function readDismissedCommunityExperienceToasts(userID: number): number[] {
  try {
    const serialized = window.sessionStorage.getItem(communityExperienceDismissedStorageKey(userID));
    if (!serialized) return [];
    const dismissed: unknown = JSON.parse(serialized);
    if (!Array.isArray(dismissed)) return [];
    return [...new Set(dismissed.map(normalizeCommunityExperienceEventID).filter((id): id is number => id !== null))].slice(-maximumRememberedDismissedEvents);
  } catch {
    return [];
  }
}

export function writeDismissedCommunityExperienceToasts(userID: number, ids: Iterable<number>) {
  try {
    const dismissed = [...new Set([...ids].map(normalizeCommunityExperienceEventID).filter((id): id is number => id !== null))]
      .slice(-maximumRememberedDismissedEvents);
    const key = communityExperienceDismissedStorageKey(userID);
    if (dismissed.length) window.sessionStorage.setItem(key, JSON.stringify(dismissed));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Keep the in-memory dismissal even when session storage is unavailable.
  }
}

export function readPendingCommunityExperienceToasts(userID: number, now = Date.now()): PendingCommunityExperienceToast[] {
  try {
    const serialized = window.sessionStorage.getItem(communityExperiencePendingStorageKey(userID));
    if (!serialized) return [];
    const pending: unknown = JSON.parse(serialized);
    if (!Array.isArray(pending)) return [];
    return pending.flatMap((item): PendingCommunityExperienceToast[] => {
      if (item === null || typeof item !== "object") return [];
      const candidate = item as Record<string, unknown>;
      const id = normalizeCommunityExperienceEventID(candidate.id);
      if (!id || typeof candidate.label !== "string" || typeof candidate.points !== "number" || !Number.isFinite(candidate.points) || candidate.points <= 0 ||
        typeof candidate.expiresAt !== "number" || candidate.expiresAt <= now ||
        (candidate.levelUp !== undefined && (!Number.isSafeInteger(candidate.levelUp) || Number(candidate.levelUp) <= 0))) return [];
      const toast: PendingCommunityExperienceToast = { id, label: candidate.label, points: candidate.points, expiresAt: candidate.expiresAt };
      if (typeof candidate.levelUp === "number") toast.levelUp = candidate.levelUp;
      return [toast];
    });
  } catch {
    return [];
  }
}

export function writePendingCommunityExperienceToasts(userID: number, pending: PendingCommunityExperienceToast[]) {
  try {
    const key = communityExperiencePendingStorageKey(userID);
    if (pending.length) window.sessionStorage.setItem(key, JSON.stringify(pending));
    else window.sessionStorage.removeItem(key);
  } catch {
    // The visible toast still works when storage is unavailable.
  }
}
