import type { CommunityComment, CommunityPost } from "~/lib/community-client";

export type CommunityReadingEntry = {
  targetId: string;
  kind: "post" | "comment";
  createdAt: string;
  label: string;
  commentId?: number;
  isAcceptedSolution: boolean;
  isFeatured: boolean;
};

export function buildCommunityReadingEntries(post: CommunityPost, comments: CommunityComment[]): CommunityReadingEntry[] {
  return [
    {
      targetId: `community-post-${post.id}`,
      kind: "post",
      createdAt: post.createdAt,
      label: "原帖",
      isAcceptedSolution: false,
      isFeatured: post.isFeatured,
    },
    ...comments.filter((comment) => !comment.isDeleted).map((comment) => ({
      targetId: `community-comment-${comment.id}`,
      kind: "comment" as const,
      createdAt: comment.createdAt,
      label: `回复 ${comment.authorName}`,
      commentId: comment.id,
      isAcceptedSolution: comment.isAcceptedSolution,
      isFeatured: comment.isFeatured,
    })),
  ];
}

export function groupCommunityReplies(comments: CommunityComment[]): Map<number, CommunityComment[]> {
  const repliesByParent = new Map<number, CommunityComment[]>();
  for (const comment of comments) {
    if (comment.isDeleted || comment.parentPostId === undefined) continue;
    const replies = repliesByParent.get(comment.parentPostId) ?? [];
    replies.push(comment);
    repliesByParent.set(comment.parentPostId, replies);
  }
  return repliesByParent;
}

export function findHotCommunityReply(comments: CommunityComment[]): CommunityComment | null {
  let hottest: CommunityComment | null = null;
  for (const comment of comments) {
    if (comment.isDeleted) continue;
    if (!hottest || comment.likeCount > hottest.likeCount) hottest = comment;
  }
  return hottest;
}
