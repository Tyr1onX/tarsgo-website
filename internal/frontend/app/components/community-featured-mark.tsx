import { CommunityIcon } from "~/components/community-icons";

export function CommunityFeaturedMark({ featured = true }: { featured?: boolean }) {
  if (!featured) return null;
  return <span className="community-featured-mark" aria-label="精华" title="精华">
    <CommunityIcon name="star" />精华
  </span>;
}
