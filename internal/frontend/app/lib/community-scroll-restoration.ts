import { useEffect } from "react";

export const communityScrollRestorationStorageKey = "react-router-scroll-positions";

export function getCommunityScrollPosition(locationKey: string): number | null {
  try {
    const positions: unknown = JSON.parse(window.sessionStorage.getItem(communityScrollRestorationStorageKey) ?? "{}");
    if (positions && typeof positions === "object") {
      const saved = (positions as Record<string, unknown>)[locationKey];
      if (typeof saved === "number" && Number.isFinite(saved) && saved >= 0) return saved;
    }
  } catch {
    return null;
  }
  return null;
}

export function saveCommunityScrollPosition(locationKey: string, scrollY: number) {
  if (!locationKey || !Number.isFinite(scrollY) || scrollY < 0) return;
  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(communityScrollRestorationStorageKey) ?? "{}");
    const positions = stored && typeof stored === "object" && !Array.isArray(stored)
      ? stored as Record<string, unknown>
      : {};
    positions[locationKey] = scrollY;
    window.sessionStorage.setItem(communityScrollRestorationStorageKey, JSON.stringify(positions));
  } catch {
    // Browser storage can be unavailable in private or restricted contexts.
  }
}

export function useDeferredCommunityScrollRestoration(
  locationKey: string,
  navigationType: string,
  ready: boolean,
  hash: string,
) {
  useEffect(() => {
    if (!ready || navigationType !== "POP" || hash) return;
    const scrollY = getCommunityScrollPosition(locationKey);
    if (scrollY === null) return;
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => window.scrollTo({ top: scrollY!, left: 0, behavior: "auto" }));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [hash, locationKey, navigationType, ready]);

  useEffect(() => {
    if (!ready || !locationKey) return;
    let latestScrollY = window.scrollY;
    let lastPersistedAt = 0;
    const persist = () => {
      saveCommunityScrollPosition(locationKey, latestScrollY);
      lastPersistedAt = performance.now();
    };
    const handleScroll = () => {
      latestScrollY = window.scrollY;
      if (performance.now() - lastPersistedAt >= 100) persist();
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    persist();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      saveCommunityScrollPosition(locationKey, latestScrollY);
    };
  }, [locationKey, ready]);
}
