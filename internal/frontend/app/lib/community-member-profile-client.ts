import { apiRequest } from "~/lib/api-client";

export interface CommunityFeaturedBadge {
  key: string;
  name: string;
  description?: string;
  levelCode: "none" | "bronze" | "silver" | "gold";
  levelLabel: string;
  earnedAt?: string;
}

export interface CommunityMemberPosition {
  id: string;
  title: string;
  categoryId: string;
  categoryTitle: string;
}

export interface CommunityPublicBadge extends CommunityFeaturedBadge {
  isEarned: boolean;
}

export interface CommunityMemberGroup {
  name: string;
  role: string;
  joinedAt: string;
}

export interface CommunityMemberProfile {
  id: number;
  displayName: string;
  avatarUrl?: string;
  teamIdentityStatus: import("~/components/community-team-identity").TeamIdentityStatus;
  bio: string;
  groups: CommunityMemberGroup[];
  positions: CommunityMemberPosition[];
  teamJoinedAt?: string;
  level: {
    level: number;
    totalXp: number;
    levelStartXp: number;
    nextLevelXp: number;
    xpToNextLevel: number;
    progress: number;
  };
  featuredBadgeKey?: string;
  featuredBadge?: CommunityFeaturedBadge;
  isSelf: boolean;
}

export interface CommunityMemberStats {
  postCount: number;
  replyCount: number;
  likeCount: number;
}

export interface CommunityMemberReply {
  id: number;
  postId: number;
  postTitle: string;
  body: string;
  createdAt: string;
  editedAt?: string;
  likeCount: number;
  isFeatured: boolean;
  href: string;
}

export interface CommunityMemberPost {
  id: number;
  category: import("~/lib/community-client").CommunityCategory;
  title: string;
  body: string;
  createdAt: string;
  editedAt?: string;
  commentCount: number;
  likeCount: number;
  isPinned: boolean;
  isFeatured: boolean;
}

export interface CommunityMemberProfileResult {
  member: CommunityMemberProfile;
  stats: CommunityMemberStats;
  badges?: CommunityPublicBadge[];
  posts?: CommunityMemberPost[];
  replies?: CommunityMemberReply[];
  tab: "overview" | "posts" | "replies" | "badges" | "card";
  page: number;
  hasMore: boolean;
}

export const communityMemberProfileClient = {
  get: (memberID: number, tab: CommunityMemberProfileResult["tab"] = "overview", page = 1) =>
    apiRequest<CommunityMemberProfileResult>(`/api/community/members/${memberID}?tab=${encodeURIComponent(tab)}&page=${page}`),
  updateMine: (input: { bio?: string; featuredBadgeKey?: string }) =>
    apiRequest<CommunityMemberProfileResult>("/api/community/me/profile", { method: "PUT", body: input }),
};
