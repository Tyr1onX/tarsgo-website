import { useEffect, useMemo, useState } from "react";

import { listAdminUserGroupOptions } from "~/lib/admin-user-groups-client";
import { isTechnicalGroupName } from "~/lib/dashboard-navigation";

export interface AssignmentGroupOption {
  groupId: number;
  name: string;
}

export function useAssignmentGroups(
  userId: number,
  roleName: string,
  memberGroups: readonly AssignmentGroupOption[] | null | undefined,
) {
  const [superAdminGroups, setSuperAdminGroups] = useState<AssignmentGroupOption[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (roleName !== "super_admin") {
      setSuperAdminGroups([]);
      setError("");
      setLoading(false);
      return;
    }

    let active = true;
    setSuperAdminGroups([]);
    setError("");
    setLoading(true);
    void listAdminUserGroupOptions()
      .then((groups) => {
        if (!active) return;
        setSuperAdminGroups(groups
          .filter((group) => group.status === 1 && isTechnicalGroupName(group.name))
          .map((group) => ({ groupId: group.id, name: group.name })));
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "技术组列表加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [userId, roleName]);

  const technicalGroups = useMemo(() => {
    if (roleName === "super_admin") return superAdminGroups;
    return (memberGroups ?? []).filter((group) => isTechnicalGroupName(group.name));
  }, [memberGroups, roleName, superAdminGroups]);

  return { technicalGroups, error, loading: roleName === "super_admin" && loading };
}
