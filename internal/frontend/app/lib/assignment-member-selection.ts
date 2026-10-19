export interface SelectableAssignmentMember {
  userId: number;
  name: string;
}

export function filterAssignmentMembers(members: readonly SelectableAssignmentMember[], query: string) {
  const keyword = query.trim().toLocaleLowerCase("zh-CN");
  if (!keyword) return [...members];
  return members.filter((member) => member.name.toLocaleLowerCase("zh-CN").includes(keyword));
}

export function toggleAssignmentMemberSelection(selectedUserIDs: readonly number[], userID: number) {
  return selectedUserIDs.includes(userID)
    ? selectedUserIDs.filter((selectedID) => selectedID !== userID)
    : [...selectedUserIDs, userID];
}
