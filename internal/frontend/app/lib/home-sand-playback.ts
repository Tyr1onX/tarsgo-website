export const HOME_SAND_PLAYED_KEY = "tarsgo:home-sand-reveal-played";

export function hasHomeSandPlayed(storage: Pick<Storage, "getItem">): boolean {
  return storage.getItem(HOME_SAND_PLAYED_KEY) === "1";
}

export function claimHomeSandPlayback(storage: Pick<Storage, "getItem" | "setItem">): boolean {
  if (hasHomeSandPlayed(storage)) return false;
  storage.setItem(HOME_SAND_PLAYED_KEY, "1");
  return true;
}
