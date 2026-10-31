import { Icon, type IconifyIcon } from "@iconify/react";
import arrowLeft from "@iconify-icons/lucide/arrow-left";
import bookmark from "@iconify-icons/lucide/bookmark";
import chevronLeft from "@iconify-icons/lucide/chevron-left";
import chevronRight from "@iconify-icons/lucide/chevron-right";
import heart from "@iconify-icons/lucide/heart";
import image from "@iconify-icons/lucide/image";
import loader from "@iconify-icons/lucide/loader-2";
import messageCircle from "@iconify-icons/lucide/message-circle";
import plus from "@iconify-icons/lucide/plus";
import search from "@iconify-icons/lucide/search";
import x from "@iconify-icons/lucide/x";

const communityIcons = {
  arrowLeft,
  bookmark,
  chevronLeft,
  chevronRight,
  heart,
  image,
  loader,
  messageCircle,
  plus,
  search,
  x,
} satisfies Record<string, IconifyIcon>;

export type CommunityIconName = keyof typeof communityIcons;

export function CommunityIcon({ name, className }: { name: CommunityIconName; className?: string }) {
  return <Icon icon={communityIcons[name]} className={`community-icon${className ? ` ${className}` : ""}`} aria-hidden="true" />;
}
