import type { UserGroupConfirmationState } from "./user-group-client";

export interface GroupIdentity {
  name: string;
  mark: string;
}

const groupMarks: Record<string, GroupIdentity> = {
  "机械组": { name: "机械组", mark: "mechanical" },
  "电控组": { name: "电控组", mark: "electrical-control" },
  "视觉组": { name: "视觉组", mark: "vision" },
  "AI组": { name: "AI组", mark: "ai" },
  "运营组": { name: "运营组", mark: "operations" },
};

/** Only show an official team mark when the current account has one clear, recognized group. */
export function resolveGroupIdentity(state: UserGroupConfirmationState): GroupIdentity | null {
  if (state.state !== "assigned" || state.groups.length !== 1) return null;
  return groupMarks[state.groups[0].name] ?? null;
}
