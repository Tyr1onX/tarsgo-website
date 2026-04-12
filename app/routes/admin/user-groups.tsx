import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";

import {
  addAdminUserGroupMember,
  createAdminUserGroup,
  deleteAdminUserGroup,
  deleteAdminUserGroupMember,
  getAdminUserGroup,
  listAdminUserGroupMemberCandidates,
  listAdminUserGroups,
  updateAdminUserGroup,
  updateAdminUserGroupMember,
  type AdminUserGroupCandidate,
  type AdminUserGroupDetail,
  type AdminUserGroupListItem,
  type AdminUserGroupMember,
  type ListAdminUserGroupsInput,
} from "~/lib/admin-user-groups-client";
import { ApiError } from "~/lib/api-client";
import type { AdminLayoutOutletContext } from "~/routes/admin/layout";

export function meta() {
  return [
    { title: "用户分组 | TARS-GO 管理后台" },
    { name: "description", content: "TARS-GO 用户分组管理" },
  ];
}

type FlashState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

type GroupFormState = {
  name: string;
  description: string;
  tagsText: string;
  isDefault: boolean;
  status: string;
};

const defaultQuery: ListAdminUserGroupsInput = {
  page: 1,
  pageSize: 9,
  keyword: "",
  status: "",
};

const defaultGroupFormState: GroupFormState = {
  name: "",
  description: "",
  tagsText: "",
  isDefault: false,
  status: "1",
};

const statusOptions = [
  { value: "", label: "全部状态" },
  { value: "1", label: "启用" },
  { value: "0", label: "停用" },
];

const memberRoleOptions = [
  { value: 0, label: "普通成员" },
  { value: 1, label: "组长" },
];

function formatDateTime(value?: string | null) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function parseTagsInput(value: string) {
  return value
    .split(/[\n,，]/g)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function toGroupFormState(group?: Pick<AdminUserGroupListItem, "name" | "description" | "tags" | "isDefault" | "status"> | null): GroupFormState {
  if (!group) {
    return defaultGroupFormState;
  }

  return {
    name: group.name,
    description: group.description ?? "",
    tagsText: (group.tags ?? []).join(", "),
    isDefault: group.isDefault,
    status: String(group.status),
  };
}

function buildGroupPayload(form: GroupFormState) {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    tags: parseTagsInput(form.tagsText),
    isDefault: form.isDefault,
    status: Number(form.status),
  };
}

function getGroupStatusMeta(status: number) {
  if (status === 1) {
    return {
      label: "启用",
      className: "text-emerald-200 bg-emerald-500/10 border border-emerald-500/20",
    };
  }

  return {
    label: "停用",
    className: "text-gray-300 bg-gray-700/50 border border-gray-700",
  };
}

function getSystemRoleMeta(roleName: string) {
  if (roleName === "super_admin") {
    return "text-amber-200 bg-amber-500/10 border border-amber-500/20";
  }
  if (roleName === "admin") {
    return "text-sky-200 bg-sky-500/10 border border-sky-500/20";
  }
  return "text-gray-200 bg-gray-700/50 border border-gray-700";
}

function getMemberRoleMeta(role: number) {
  if (role === 1) {
    return {
      label: "组长",
      className: "text-primary-200 bg-primary-500/10 border border-primary-500/20",
    };
  }
  return {
    label: "成员",
    className: "text-gray-200 bg-gray-700/50 border border-gray-700",
  };
}

export default function UserGroups() {
  const navigate = useNavigate();
  const { currentUser } = useOutletContext<AdminLayoutOutletContext>();

  const noAdminPermission = currentUser.role.name === "user";

  const [query, setQuery] = useState<ListAdminUserGroupsInput>(defaultQuery);
  const [filters, setFilters] = useState<ListAdminUserGroupsInput>(defaultQuery);
  const [groups, setGroups] = useState<AdminUserGroupListItem[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    disabled: 0,
    defaultCount: 0,
    totalMembers: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 9,
    total: 0,
    totalPages: 0,
  });
  const [loadingList, setLoadingList] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);

  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [groupForm, setGroupForm] = useState<GroupFormState>(defaultGroupFormState);
  const [savingGroup, setSavingGroup] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<AdminUserGroupDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [candidateKeyword, setCandidateKeyword] = useState("");
  const [candidateRoleMap, setCandidateRoleMap] = useState<Record<number, number>>({});
  const [candidates, setCandidates] = useState<AdminUserGroupCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [mutatingMemberId, setMutatingMemberId] = useState<number | null>(null);

  const [cardActionGroupId, setCardActionGroupId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserGroupListItem | AdminUserGroupDetail | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);

  const averageMembers = useMemo(() => {
    if (summary.total === 0) {
      return "0";
    }
    return (summary.totalMembers / summary.total).toFixed(1);
  }, [summary.total, summary.totalMembers]);

  useEffect(() => {
    if (noAdminPermission) {
      return;
    }

    let cancelled = false;

    async function loadGroups() {
      try {
        setLoadingList(true);
        const response = await listAdminUserGroups(query);
        if (!cancelled) {
          setGroups(response.items);
          setSummary(response.summary);
          setPagination(response.pagination);
        }
      } catch (error) {
        if (!cancelled) {
          if (shouldRedirectToLogin(error)) {
            navigate("/login", { replace: true });
            return;
          }
          setFlash({ type: "error", message: getErrorMessage(error) });
        }
      } finally {
        if (!cancelled) {
          setLoadingList(false);
        }
      }
    }

    void loadGroups();

    return () => {
      cancelled = true;
    };
  }, [navigate, noAdminPermission, query]);

  useEffect(() => {
    if (!drawerOpen || selectedGroupId === null) {
      return;
    }

    let cancelled = false;

    async function loadGroupDetail() {
      try {
        setDetailLoading(true);
        const detail = await getAdminUserGroup(selectedGroupId!);
        if (!cancelled) {
          setSelectedGroup(detail);
        }
      } catch (error) {
        if (!cancelled) {
          if (shouldRedirectToLogin(error)) {
            navigate("/login", { replace: true });
            return;
          }
          setFlash({ type: "error", message: getErrorMessage(error) });
          closeDrawer();
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void loadGroupDetail();

    return () => {
      cancelled = true;
    };
  }, [drawerOpen, navigate, selectedGroupId]);

  useEffect(() => {
    if (!drawerOpen || selectedGroupId === null) {
      return;
    }

    let cancelled = false;

    async function loadCandidates() {
      try {
        setLoadingCandidates(true);
        const items = await listAdminUserGroupMemberCandidates(selectedGroupId!, candidateKeyword);
        if (!cancelled) {
          setCandidates(items);
          setCandidateRoleMap((previous) => {
            const next: Record<number, number> = {};
            for (const item of items) {
              next[item.id] = previous[item.id] ?? 0;
            }
            return next;
          });
        }
      } catch (error) {
        if (!cancelled) {
          if (shouldRedirectToLogin(error)) {
            navigate("/login", { replace: true });
            return;
          }
          setFlash({ type: "error", message: getErrorMessage(error) });
        }
      } finally {
        if (!cancelled) {
          setLoadingCandidates(false);
        }
      }
    }

    void loadCandidates();

    return () => {
      cancelled = true;
    };
  }, [candidateKeyword, drawerOpen, navigate, selectedGroupId]);

  async function refreshList() {
    const response = await listAdminUserGroups(query);
    setGroups(response.items);
    setSummary(response.summary);
    setPagination(response.pagination);
  }

  async function refreshSelectedGroup(groupId: number) {
    const detail = await getAdminUserGroup(groupId);
    setSelectedGroup(detail);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedGroupId(null);
    setSelectedGroup(null);
    setCandidateKeyword("");
    setCandidates([]);
    setCandidateRoleMap({});
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFlash(null);
    setQuery({
      ...filters,
      page: 1,
      pageSize: query.pageSize ?? 9,
    });
  }

  function handleResetFilters() {
    setFlash(null);
    setFilters(defaultQuery);
    setQuery(defaultQuery);
  }

  function openCreateModal() {
    setEditingGroupId(null);
    setGroupForm(defaultGroupFormState);
    setGroupModalOpen(true);
  }

  function openEditModal(group: AdminUserGroupListItem | AdminUserGroupDetail) {
    setEditingGroupId(group.id);
    setGroupForm(toGroupFormState(group));
    setGroupModalOpen(true);
  }

  function openDrawer(groupId: number) {
    setSelectedGroupId(groupId);
    setSelectedGroup(null);
    setDrawerOpen(true);
  }

  async function handleSubmitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFlash(null);

    try {
      setSavingGroup(true);
      const payload = buildGroupPayload(groupForm);
      const detail = editingGroupId === null
        ? await createAdminUserGroup(payload)
        : await updateAdminUserGroup(editingGroupId, payload);

      setGroupModalOpen(false);
      setFlash({
        type: "success",
        message: editingGroupId === null ? `已创建用户组：${detail.name}` : `已更新用户组：${detail.name}`,
      });
      await refreshList();

      if (selectedGroupId === detail.id) {
        setSelectedGroup(detail);
      }
    } catch (error) {
      if (shouldRedirectToLogin(error)) {
        navigate("/login", { replace: true });
        return;
      }
      setFlash({ type: "error", message: getErrorMessage(error) });
    } finally {
      setSavingGroup(false);
    }
  }

  async function handleToggleDefault(group: AdminUserGroupListItem) {
    try {
      setCardActionGroupId(group.id);
      const updated = await updateAdminUserGroup(group.id, {
        name: group.name,
        description: group.description ?? "",
        tags: group.tags ?? [],
        isDefault: !group.isDefault,
        status: group.status,
      });
      setFlash({
        type: "success",
        message: updated.isDefault ? `已将 ${updated.name} 设为默认分组` : `已取消 ${updated.name} 的默认分组`,
      });
      await refreshList();
      if (selectedGroupId === updated.id) {
        setSelectedGroup(updated);
      }
    } catch (error) {
      if (shouldRedirectToLogin(error)) {
        navigate("/login", { replace: true });
        return;
      }
      setFlash({ type: "error", message: getErrorMessage(error) });
    } finally {
      setCardActionGroupId(null);
    }
  }

  async function handleToggleStatus(group: AdminUserGroupListItem) {
    try {
      setCardActionGroupId(group.id);
      const updated = await updateAdminUserGroup(group.id, {
        name: group.name,
        description: group.description ?? "",
        tags: group.tags ?? [],
        isDefault: group.isDefault,
        status: group.status === 1 ? 0 : 1,
      });
      setFlash({
        type: "success",
        message: updated.status === 1 ? `已启用 ${updated.name}` : `已停用 ${updated.name}`,
      });
      await refreshList();
      if (selectedGroupId === updated.id) {
        setSelectedGroup(updated);
      }
    } catch (error) {
      if (shouldRedirectToLogin(error)) {
        navigate("/login", { replace: true });
        return;
      }
      setFlash({ type: "error", message: getErrorMessage(error) });
    } finally {
      setCardActionGroupId(null);
    }
  }

  async function handleDeleteGroup() {
    if (!deleteTarget) {
      return;
    }

    try {
      setDeletingGroup(true);
      await deleteAdminUserGroup(deleteTarget.id);
      setFlash({ type: "success", message: `已删除用户组：${deleteTarget.name}` });
      setDeleteTarget(null);
      await refreshList();
      if (selectedGroupId === deleteTarget.id) {
        closeDrawer();
      }
    } catch (error) {
      if (shouldRedirectToLogin(error)) {
        navigate("/login", { replace: true });
        return;
      }
      setFlash({ type: "error", message: getErrorMessage(error) });
    } finally {
      setDeletingGroup(false);
    }
  }

  async function handleAddMember(candidate: AdminUserGroupCandidate) {
    if (selectedGroupId === null) {
      return;
    }

    try {
      setMutatingMemberId(candidate.id);
      await addAdminUserGroupMember(selectedGroupId, {
        userId: candidate.id,
        role: candidateRoleMap[candidate.id] ?? 0,
      });
      setFlash({ type: "success", message: `已将 ${candidate.name} 加入当前分组` });
      await Promise.all([
        refreshSelectedGroup(selectedGroupId),
        (async () => {
          const items = await listAdminUserGroupMemberCandidates(selectedGroupId, candidateKeyword);
          setCandidates(items);
        })(),
        refreshList(),
      ]);
    } catch (error) {
      if (shouldRedirectToLogin(error)) {
        navigate("/login", { replace: true });
        return;
      }
      setFlash({ type: "error", message: getErrorMessage(error) });
    } finally {
      setMutatingMemberId(null);
    }
  }

  async function handleToggleMemberRole(member: AdminUserGroupMember) {
    if (selectedGroupId === null) {
      return;
    }

    try {
      setMutatingMemberId(member.id);
      const nextRole = member.role === 1 ? 0 : 1;
      await updateAdminUserGroupMember(selectedGroupId, member.id, { role: nextRole });
      setFlash({
        type: "success",
        message: nextRole === 1 ? `已将 ${member.user.name} 设为组长` : `已将 ${member.user.name} 调整为普通成员`,
      });
      await Promise.all([refreshSelectedGroup(selectedGroupId), refreshList()]);
    } catch (error) {
      if (shouldRedirectToLogin(error)) {
        navigate("/login", { replace: true });
        return;
      }
      setFlash({ type: "error", message: getErrorMessage(error) });
    } finally {
      setMutatingMemberId(null);
    }
  }

  async function handleRemoveMember(member: AdminUserGroupMember) {
    if (selectedGroupId === null) {
      return;
    }

    try {
      setMutatingMemberId(member.id);
      await deleteAdminUserGroupMember(selectedGroupId, member.id);
      setFlash({ type: "success", message: `已将 ${member.user.name} 移出当前分组` });
      await Promise.all([
        refreshSelectedGroup(selectedGroupId),
        (async () => {
          const items = await listAdminUserGroupMemberCandidates(selectedGroupId, candidateKeyword);
          setCandidates(items);
        })(),
        refreshList(),
      ]);
    } catch (error) {
      if (shouldRedirectToLogin(error)) {
        navigate("/login", { replace: true });
        return;
      }
      setFlash({ type: "error", message: getErrorMessage(error) });
    } finally {
      setMutatingMemberId(null);
    }
  }

  if (noAdminPermission) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-6">
        <h1 className="text-xl font-semibold text-white">用户分组</h1>
        <p className="mt-2 text-sm leading-6 text-amber-100/80">
          当前账号没有管理员权限，无法访问此页面。
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">用户分组</h1>
          <p className="text-sm text-gray-400 mt-1">管理用户分组与成员分配</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          新建分组
        </button>
      </div>

      {/* Flash message */}
      {flash ? (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
            flash.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
              : "border-red-500/20 bg-red-500/10 text-red-100"
          }`}
        >
          {flash.message}
        </div>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-xl bg-gray-900 border border-gray-800">
          <div className="text-2xl font-bold text-primary-400">{summary.total}</div>
          <div className="text-sm text-gray-400 mt-1">分组总数</div>
        </div>
        <div className="p-4 rounded-xl bg-gray-900 border border-gray-800">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400">{summary.active}</span>
            {summary.disabled > 0 && (
              <span className="text-xs text-gray-500">停用 {summary.disabled}</span>
            )}
          </div>
          <div className="text-sm text-gray-400 mt-1">启用分组</div>
        </div>
        <div className="p-4 rounded-xl bg-gray-900 border border-gray-800">
          <div className="text-2xl font-bold text-amber-400">{summary.defaultCount}</div>
          <div className="text-sm text-gray-400 mt-1">默认分组</div>
        </div>
        <div className="p-4 rounded-xl bg-gray-900 border border-gray-800">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-sky-400">{summary.totalMembers}</span>
            <span className="text-xs text-gray-500">均 {averageMembers}/组</span>
          </div>
          <div className="text-sm text-gray-400 mt-1">总成员数</div>
        </div>
      </div>

      {/* Search & Filter */}
      <form
        onSubmit={handleSearchSubmit}
        className="rounded-xl bg-gray-900 border border-gray-800 p-4 mb-6"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <input
              type="text"
              value={filters.keyword ?? ""}
              onChange={(event) => setFilters((previous) => ({ ...previous, keyword: event.target.value }))}
              placeholder="搜索分组名称或描述"
              className={inputClassName()}
            />
          </div>
          <div className="w-full lg:w-40">
            <select
              aria-label="筛选状态"
              value={String(filters.status ?? "")}
              onChange={(event) =>
                setFilters((previous) => ({
                  ...previous,
                  status: event.target.value === "" ? "" : Number(event.target.value),
                }))
              }
              className={inputClassName()}
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600"
            >
              搜索
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm text-gray-300 transition-colors hover:bg-white/5"
            >
              重置
            </button>
          </div>
        </div>
      </form>

      {/* Group cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mb-6">
        {loadingList ? (
          <div className="col-span-full rounded-xl bg-gray-900 border border-gray-800 px-6 py-12 text-center text-sm text-gray-400">
            正在加载...
          </div>
        ) : groups.length === 0 ? (
          <div className="col-span-full rounded-xl bg-gray-900 border border-gray-800 px-6 py-12 text-center text-sm text-gray-400">
            暂无匹配的用户组
          </div>
        ) : (
          groups.map((group) => {
            const statusMeta = getGroupStatusMeta(group.status);
            const isBusy = cardActionGroupId === group.id;
            return (
              <article
                key={group.id}
                className="rounded-xl bg-gray-900 border border-gray-800 p-5 flex flex-col"
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-white truncate">{group.name}</h2>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                      {group.isDefault ? (
                        <span className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-200">
                          默认
                        </span>
                      ) : null}
                    </div>
                    {group.description?.trim() ? (
                      <p className="mt-1.5 text-sm text-gray-400 line-clamp-2">{group.description}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => openDrawer(group.id)}
                    className="shrink-0 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/5 cursor-pointer"
                  >
                    成员
                  </button>
                </div>

                {/* Tags */}
                {(group.tags ?? []).length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(group.tags ?? []).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex rounded-full border border-primary-500/20 bg-primary-500/10 px-2 py-0.5 text-xs text-primary-200"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* Stats row */}
                <div className="mt-4 flex items-center gap-4 rounded-lg bg-gray-800/50 px-4 py-3">
                  <div className="flex-1">
                    <div className="text-xs text-gray-500">成员</div>
                    <div className="text-sm font-semibold text-white mt-0.5">{group.memberCount}</div>
                  </div>
                  <div className="w-px h-8 bg-gray-700" />
                  <div className="flex-1">
                    <div className="text-xs text-gray-500">组长</div>
                    <div className="text-sm text-gray-200 mt-0.5 truncate">
                      {(group.leaders ?? []).length > 0 ? (group.leaders ?? []).join("、") : "-"}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-gray-800">
                  <button
                    type="button"
                    onClick={() => openEditModal(group)}
                    disabled={isBusy}
                    className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/5 disabled:opacity-50 cursor-pointer"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleDefault(group)}
                    disabled={isBusy || group.status !== 1}
                    className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs text-amber-200 transition-colors hover:bg-amber-500/10 disabled:opacity-50 cursor-pointer"
                  >
                    {group.isDefault ? "取消默认" : "设为默认"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleStatus(group)}
                    disabled={isBusy}
                    className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/5 disabled:opacity-50 cursor-pointer"
                  >
                    {group.status === 1 ? "停用" : "启用"}
                  </button>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(group)}
                    disabled={isBusy}
                    className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50 cursor-pointer"
                  >
                    删除
                  </button>
                </div>

                <div className="mt-3 text-xs text-gray-600">
                  更新于 {formatDateTime(group.updatedAt)}
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Pagination */}
      <div className="flex flex-col gap-3 rounded-xl bg-gray-900 border border-gray-800 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-gray-400">
          {pagination.page} / {Math.max(pagination.totalPages, 1)} 页，共 {pagination.total} 条
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="每页条数"
            value={pagination.pageSize}
            onChange={(event) =>
              setQuery((previous) => ({
                ...previous,
                page: 1,
                pageSize: Number(event.target.value),
              }))
            }
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200"
          >
            {[6, 9, 12, 18].map((size) => (
              <option key={size} value={size}>
                {size} 条/页
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => setQuery((previous) => ({ ...previous, page: Math.max((previous.page ?? 1) - 1, 1) }))}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            上一页
          </button>
          <button
            type="button"
            disabled={pagination.page >= Math.max(pagination.totalPages, 1)}
            onClick={() =>
              setQuery((previous) => ({
                ...previous,
                page: Math.min((previous.page ?? 1) + 1, Math.max(pagination.totalPages, 1)),
              }))
            }
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      </div>

      {/* Create / Edit modal */}
      {groupModalOpen ? (
        <ModalShell
          title={editingGroupId === null ? "新建用户组" : "编辑用户组"}
          onClose={() => setGroupModalOpen(false)}
          widthClass="max-w-2xl"
        >
          <form onSubmit={handleSubmitGroup} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel htmlFor="group-name" label="分组名称" />
                <input
                  id="group-name"
                  type="text"
                  value={groupForm.name}
                  onChange={(event) => setGroupForm((previous) => ({ ...previous, name: event.target.value }))}
                  className={inputClassName()}
                  required
                />
              </div>
              <div>
                <FieldLabel htmlFor="group-status" label="状态" />
                <select
                  id="group-status"
                  value={groupForm.status}
                  onChange={(event) =>
                    setGroupForm((previous) => ({
                      ...previous,
                      status: event.target.value,
                      isDefault: event.target.value === "1" ? previous.isDefault : false,
                    }))
                  }
                  className={inputClassName()}
                >
                  {statusOptions
                    .filter((option) => option.value !== "")
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div>
              <FieldLabel label="分组描述" />
              <textarea
                value={groupForm.description}
                onChange={(event) => setGroupForm((previous) => ({ ...previous, description: event.target.value }))}
                className={`${inputClassName()} min-h-24 resize-y`}
              />
            </div>

            <div>
              <FieldLabel label="标签" hint="多个标签用逗号或换行分隔" />
              <textarea
                value={groupForm.tagsText}
                onChange={(event) => setGroupForm((previous) => ({ ...previous, tagsText: event.target.value }))}
                className={`${inputClassName()} min-h-20 resize-y`}
                placeholder="新注册, 试用用户, 企业客户"
              />
            </div>

            <label className="flex items-center gap-3 rounded-lg bg-gray-800/50 px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={groupForm.isDefault}
                onChange={(event) => setGroupForm((previous) => ({ ...previous, isDefault: event.target.checked }))}
                disabled={groupForm.status !== "1"}
                className="h-4 w-4 rounded border-gray-600 bg-gray-900 text-primary-500 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <div>
                <div className="text-sm font-medium text-white">设为默认分组</div>
                <p className="text-xs text-gray-400">仅启用状态可设为默认，同一时间只有一个默认分组</p>
              </div>
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setGroupModalOpen(false)}
                disabled={savingGroup}
                className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm text-gray-300 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={savingGroup}
                className="rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingGroup ? "保存中..." : editingGroupId === null ? "创建" : "保存"}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {/* Delete confirm modal */}
      {deleteTarget ? (
        <ModalShell
          title="确认删除"
          onClose={() => setDeleteTarget(null)}
          widthClass="max-w-md"
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
              即将删除 <span className="font-medium">{deleteTarget.name}</span>
              {"memberCount" in deleteTarget && deleteTarget.memberCount > 0 ? (
                <span>（当前 {deleteTarget.memberCount} 人，需先清空成员）</span>
              ) : null}
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingGroup}
                className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm text-gray-300 transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteGroup()}
                disabled={deletingGroup}
                className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingGroup ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {/* Member management drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/60">
          <button
            type="button"
            aria-label="关闭"
            onClick={closeDrawer}
            className="flex-1 cursor-default"
          />
          <aside className="relative h-full w-full max-w-2xl overflow-y-auto border-l border-gray-800 bg-gray-950 shadow-2xl">
            {/* Drawer header */}
            <div className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/95 px-6 py-4 backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <h2 className="text-lg font-semibold text-white truncate">
                    {selectedGroup?.name ?? "成员管理"}
                  </h2>
                  {selectedGroup ? <GroupStatusBadge status={selectedGroup.status} /> : null}
                  {selectedGroup?.isDefault ? (
                    <span className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-200">
                      默认
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {selectedGroup ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openEditModal(selectedGroup)}
                        className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/5 cursor-pointer"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(selectedGroup)}
                        className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-500/10 cursor-pointer"
                      >
                        删除
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    aria-label="关闭"
                    onClick={closeDrawer}
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:text-white hover:bg-white/5 cursor-pointer"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-5 px-6 py-5">
              {detailLoading || !selectedGroup ? (
                <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-12 text-center text-sm text-gray-400">
                  正在加载...
                </div>
              ) : (
                <>
                  {/* Group info stats */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatBlock label="成员" value={selectedGroup.memberCount} />
                    <StatBlock
                      label="组长"
                      value={selectedGroup.members.filter((member) => member.role === 1).length}
                    />
                    <StatBlock label="创建" value={formatDateTime(selectedGroup.createdAt)} />
                    <StatBlock label="更新" value={formatDateTime(selectedGroup.updatedAt)} />
                  </div>

                  {/* Tags */}
                  {selectedGroup.tags?.length ? (
                    <section className="rounded-xl bg-gray-900 border border-gray-800 p-4">
                      <div className="text-xs font-medium text-gray-400 mb-2">标签</div>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedGroup.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex rounded-full border border-primary-500/20 bg-primary-500/10 px-2.5 py-0.5 text-xs text-primary-200"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </section>
                  ) : null}

                  {/* Add member */}
                  <section className="rounded-xl bg-gray-900 border border-gray-800 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                      <h3 className="text-sm font-semibold text-white">添加成员</h3>
                      <div className="w-full sm:w-64">
                        <input
                          type="text"
                          value={candidateKeyword}
                          onChange={(event) => setCandidateKeyword(event.target.value)}
                          placeholder="搜索用户名或邮箱"
                          className={inputClassName()}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      {loadingCandidates ? (
                        <div className="rounded-lg border border-dashed border-gray-700 px-4 py-6 text-center text-sm text-gray-500">
                          加载中...
                        </div>
                      ) : candidates.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-gray-700 px-4 py-6 text-center text-sm text-gray-500">
                          无匹配的候选账号
                        </div>
                      ) : (
                        candidates.map((candidate) => (
                          <div
                            key={candidate.id}
                            className="rounded-lg bg-gray-800/50 p-3"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-medium text-white">{candidate.name}</span>
                                  <RoleBadge
                                    roleName={candidate.role.name}
                                    displayName={candidate.role.displayName}
                                  />
                                  <UserStatusBadge status={candidate.status} />
                                </div>
                                <div className="mt-1 text-xs text-gray-400 truncate">{candidate.email}</div>
                                {candidate.groups?.length ? (
                                  <div className="mt-1.5 flex flex-wrap gap-1">
                                    {candidate.groups.map((group) => (
                                      <span
                                        key={`${candidate.id}-${group.id}`}
                                        className="inline-flex rounded-full bg-gray-700/50 px-2 py-0.5 text-xs text-gray-400"
                                      >
                                        {group.name}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <select
                                  aria-label="入组角色"
                                  value={candidateRoleMap[candidate.id] ?? 0}
                                  onChange={(event) =>
                                    setCandidateRoleMap((previous) => ({
                                      ...previous,
                                      [candidate.id]: Number(event.target.value),
                                    }))
                                  }
                                  className="rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs text-gray-200"
                                >
                                  {memberRoleOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => void handleAddMember(candidate)}
                                  disabled={mutatingMemberId === candidate.id}
                                  className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                                >
                                  {mutatingMemberId === candidate.id ? "加入中..." : "加入"}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  {/* Current members */}
                  <section className="rounded-xl bg-gray-900 border border-gray-800 p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-white">当前成员</h3>
                      <span className="text-xs text-gray-500">{selectedGroup.members.length} 人</span>
                    </div>

                    <div className="space-y-2">
                      {selectedGroup.members.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-gray-700 px-4 py-6 text-center text-sm text-gray-500">
                          暂无成员
                        </div>
                      ) : (
                        selectedGroup.members.map((member) => (
                          <div
                            key={member.id}
                            className="rounded-lg bg-gray-800/50 p-3"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-sm font-medium text-white">{member.user.name}</span>
                                  <RoleBadge
                                    roleName={member.user.role.name}
                                    displayName={member.user.role.displayName}
                                  />
                                  <RoleBadge
                                    roleName={member.role === 1 ? "leader" : "member"}
                                    displayName={getMemberRoleMeta(member.role).label}
                                    className={getMemberRoleMeta(member.role).className}
                                  />
                                  <UserStatusBadge status={member.user.status} />
                                </div>
                                <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                                  <span className="truncate">{member.user.email}</span>
                                  <span className="text-gray-600 shrink-0">{formatDateTime(member.joinedAt)}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => void handleToggleMemberRole(member)}
                                  disabled={mutatingMemberId === member.id}
                                  className="rounded-lg border border-primary-500/30 px-3 py-1.5 text-xs text-primary-200 transition-colors hover:bg-primary-500/10 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                                >
                                  {mutatingMemberId === member.id
                                    ? "处理中..."
                                    : member.role === 1
                                      ? "改为成员"
                                      : "设为组长"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleRemoveMember(member)}
                                  disabled={mutatingMemberId === member.id}
                                  className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                                >
                                  {mutatingMemberId === member.id ? "移除中..." : "移出"}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function shouldRedirectToLogin(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.message === "账号已停用");
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "请求失败，请稍后重试。";
}

function FieldLabel({ label, hint, htmlFor }: { label: string; hint?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline gap-2 text-sm font-medium text-gray-200">
      {label}
      {hint ? <span className="text-xs font-normal text-gray-500">{hint}</span> : null}
    </label>
  );
}

function inputClassName(disabled = false) {
  return `w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-primary-400 focus:outline-none ${disabled ? "cursor-not-allowed opacity-60" : ""}`;
}

function ModalShell({
  title,
  onClose,
  children,
  widthClass = "max-w-2xl",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className={`w-full ${widthClass} rounded-xl bg-gray-900 border border-gray-800 shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-gray-800/50 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-white">{value}</div>
    </div>
  );
}

function GroupStatusBadge({ status }: { status: number }) {
  const meta = getGroupStatusMeta(status);

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function RoleBadge({
  roleName,
  displayName,
  className,
}: {
  roleName: string;
  displayName: string;
  className?: string;
}) {
  const resolvedClassName = className ?? getSystemRoleMeta(roleName);

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${resolvedClassName}`}>
      {displayName}
    </span>
  );
}

function UserStatusBadge({ status }: { status: number }) {
  const meta = status === 1
    ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
    : "border border-gray-700 bg-gray-800/80 text-gray-300";

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${meta}`}>
      {status === 1 ? "启用" : "停用"}
    </span>
  );
}
