import type { CommunityExperienceEntry, CommunityGrowthProfile } from "~/lib/community-client";

const growthSnapshotPrefix = "community-growth-snapshot:";
const growthSnapshots = new Map<number, { day: string; profile: CommunityGrowthProfile }>();
const beijingOffsetMs = 8 * 60 * 60 * 1_000;
const dayMs = 24 * 60 * 60 * 1_000;

export function communityBeijingDay(now = Date.now()) {
  return new Date(now + beijingOffsetMs).toISOString().slice(0, 10);
}

export function millisecondsUntilCommunityDayChange(now = Date.now()) {
  return dayMs - ((now + beijingOffsetMs) % dayMs);
}

export function communityGrowthSnapshotStorageKey(userID: number) {
  return `${growthSnapshotPrefix}${userID}`;
}

function validGrowthProfile(value: unknown): value is CommunityGrowthProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  return ["level", "totalXp", "levelStartXp", "nextLevelXp", "xpToNextLevel", "progress",
    "streakDays", "dailyPostsUsed", "dailyRepliesUsed", "dailyContributionXp"]
    .every((key) => typeof profile[key] === "number" && Number.isFinite(profile[key])) &&
    typeof profile.checkedInToday === "boolean" &&
    Array.isArray(profile.upcomingCheckIns) && Array.isArray(profile.recentEvents);
}

export function getCommunityGrowthSnapshot(userID: number): CommunityGrowthProfile | null {
  if (typeof window === "undefined" || !Number.isSafeInteger(userID) || userID <= 0) return null;
  let snapshot = growthSnapshots.get(userID);
  if (!snapshot) {
    try {
      const serialized = window.localStorage.getItem(communityGrowthSnapshotStorageKey(userID));
      if (serialized) {
        const stored: unknown = JSON.parse(serialized);
        if (stored && typeof stored === "object" && "day" in stored && "profile" in stored &&
          typeof stored.day === "string" && validGrowthProfile(stored.profile)) {
          snapshot = { day: stored.day, profile: stored.profile };
          growthSnapshots.set(userID, snapshot);
        }
      }
    } catch {
      // Storage is optional; the in-memory snapshot remains usable.
    }
  }
  if (!snapshot) return null;
  const today = communityBeijingDay();
  if (snapshot.day !== today) {
    const yesterday = communityBeijingDay(Date.now() - dayMs);
    snapshot.profile = {
      ...snapshot.profile,
      checkedInToday: false,
      streakDays: snapshot.profile.lastCheckInDay === yesterday ? snapshot.profile.streakDays : 0,
      dailyPostsUsed: 0,
      dailyRepliesUsed: 0,
      dailyContributionXp: 0,
      upcomingCheckIns: [],
    };
    snapshot.day = today;
  }
  return snapshot.profile;
}

export function invalidateCommunityGrowthDay(userID: number) {
  const previous = growthSnapshots.get(userID)?.profile;
  const current = getCommunityGrowthSnapshot(userID);
  if (current && current !== previous) notifyCommunityGrowthProfile(userID);
}

export function clearCommunityGrowthSnapshot(userID: number) {
  growthSnapshots.delete(userID);
  try { window.localStorage.removeItem(communityGrowthSnapshotStorageKey(userID)); } catch { /* No storage permission. */ }
  notifyCommunityGrowthProfile(userID);
}

export function clearAllCommunityGrowthSnapshots() {
  growthSnapshots.clear();
  try {
    const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .filter((key): key is string => !!key && key.startsWith(growthSnapshotPrefix));
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch { /* No storage permission. */ }
}

function notifyCommunityGrowthProfile(userID: number) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<number>(profileUpdatedEventName, { detail: userID }));
}

const refreshEventName = "community:experience-refresh";
const serverProfileEventName = "community:experience-server-profile";
const profileUpdatedEventName = "community:experience-profile-updated";
const profileErrorEventName = "community:experience-profile-error";

export function requestCommunityExperienceRefresh() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(refreshEventName));
}

export function reportCommunityGrowthProfile(userID: number, profile: CommunityGrowthProfile) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(serverProfileEventName, { detail: { userID, profile } }));
  }
}

export function publishCommunityGrowthProfile(userID: number, profile: CommunityGrowthProfile) {
  if (typeof window === "undefined") return;
  const day = profile.upcomingCheckIns.find((item) => item.isToday)?.day ?? communityBeijingDay();
  growthSnapshots.set(userID, { day, profile });
  try {
    window.localStorage.setItem(communityGrowthSnapshotStorageKey(userID), JSON.stringify({ day, profile }));
  } catch { /* Keep the in-memory snapshot when storage is unavailable. */ }
  getCommunityGrowthSnapshot(userID);
  notifyCommunityGrowthProfile(userID);
}

export function publishCommunityGrowthError(userID: number, message: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(profileErrorEventName, { detail: { userID, message } }));
}

export function subscribeCommunityGrowthProfile(userID: number, listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const handle = (event: Event) => { if ((event as CustomEvent<number>).detail === userID) listener(); };
  window.addEventListener(profileUpdatedEventName, handle);
  return () => window.removeEventListener(profileUpdatedEventName, handle);
}

export function subscribeCommunityGrowthError(userID: number, listener: (message: string) => void) {
  if (typeof window === "undefined") return () => {};
  const handle = (event: Event) => {
    const detail = (event as CustomEvent<{ userID: number; message: string }>).detail;
    if (detail.userID === userID) listener(detail.message);
  };
  window.addEventListener(profileErrorEventName, handle);
  return () => window.removeEventListener(profileErrorEventName, handle);
}

export function subscribeToCommunityGrowthServerProfile(userID: number, listener: (profile: CommunityGrowthProfile) => void) {
  if (typeof window === "undefined") return () => {};
  const handle = (event: Event) => {
    const detail = (event as CustomEvent<{ userID: number; profile: CommunityGrowthProfile }>).detail;
    if (detail.userID === userID) listener(detail.profile);
  };
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
