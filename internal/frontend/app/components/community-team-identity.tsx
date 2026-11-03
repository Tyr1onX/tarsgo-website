export type TeamIdentityStatus = "community_member" | "trainee_member" | "reserve_member" | "formal_member" | "former_member";

const labels: Record<TeamIdentityStatus, string> = {
  community_member: "社区成员",
  trainee_member: "梯队成员",
  reserve_member: "预备队员",
  formal_member: "正式队员",
  former_member: "往届队员",
};

export const teamIdentityOptions: Array<{ value: TeamIdentityStatus; label: string }> = Object.entries(labels).map(([value, label]) => ({
  value: value as TeamIdentityStatus,
  label,
}));

function isTeamIdentityStatus(status: string): status is TeamIdentityStatus {
  return Object.prototype.hasOwnProperty.call(labels, status);
}

export function teamIdentityLabel(status?: string) {
  return labels[status && isTeamIdentityStatus(status) ? status : "community_member"];
}

export function TeamIdentityBadge({ status }: { status?: string }) {
  if (!status || status === "community_member") return null;
  const validStatus = isTeamIdentityStatus(status) ? status : "community_member";
  if (validStatus === "community_member") return null;
  return <span className={`community-team-identity community-team-identity--${validStatus}`}>{labels[validStatus]}</span>;
}
