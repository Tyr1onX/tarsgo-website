import alertTriangle from "@iconify-icons/lucide/alert-triangle";
import clock from "@iconify-icons/lucide/clock";
import crown from "@iconify-icons/lucide/crown";
import editIcon from "@iconify-icons/lucide/edit-3";
import eyeIcon from "@iconify-icons/lucide/eye";
import eyeOff from "@iconify-icons/lucide/eye-off";
import folderPlus from "@iconify-icons/lucide/folder-plus";
import layers from "@iconify-icons/lucide/layers";
import mailIcon from "@iconify-icons/lucide/mail";
import moreHorizontal from "@iconify-icons/lucide/more-horizontal";
import power from "@iconify-icons/lucide/power";
import powerOff from "@iconify-icons/lucide/power-off";
import rotateCcw from "@iconify-icons/lucide/rotate-ccw";
import searchIcon from "@iconify-icons/lucide/search";
import starIcon from "@iconify-icons/lucide/star";
import starOff from "@iconify-icons/lucide/star-off";
import tagIcon from "@iconify-icons/lucide/tag";
import trash2 from "@iconify-icons/lucide/trash-2";
import userCheck from "@iconify-icons/lucide/user-check";
import userMinus from "@iconify-icons/lucide/user-minus";
import userPlus from "@iconify-icons/lucide/user-plus";
import usersIcon from "@iconify-icons/lucide/users";
import x from "@iconify-icons/lucide/x";
import { Icon } from "@iconify/react";
import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useOutletContext } from "react-router";
import { ModalShell } from "~/components/modal-shell";
import { Notify } from "~/components/notify";
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
import { ApiError, buildApiUrl } from "~/lib/api-client";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";

export function meta() {
  return [
    { title: "招新组别 | TARS-GO" },
    { name: "description", content: "维护候选人意向组别和招新处理范围" },
  ];
}

type FlashState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

type GroupFormState = {
  name: string;
  description: string;
  logoUrl: string | null;
  logoFile: File | null;
  removeLogo: boolean;
  tags: string[];
  isDefault: boolean;
  show: string;
  status: string;
};

const defaultQuery: ListAdminUserGroupsInput = {
  status: "",
};

const defaultGroupFormState: GroupFormState = {
  name: "",
  description: "",
  logoUrl: null,
  logoFile: null,
  removeLogo: false,
  tags: [],
  isDefault: false,
  show: "1",
  status: "1",
};

const statusOptions = [
  { value: "", label: "全部状态" },
  { value: "1", label: "启用" },
  { value: "0", label: "停用" },
];

const memberRoleOptions = [
  { value: 0, label: "普通成员" },
  { value: 1, label: "组内管理" },
  { value: 2, label: "组长" },
];

const DRAWER_ANIMATION_MS = 220;

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
    .map((t) => t.trim())
    .filter(Boolean);
}

function toGroupFormState(group?: Pick<AdminUserGroupListItem, "name" | "description" | "logoUrl" | "tags" | "isDefault" | "show" | "status"> | null): GroupFormState {
  if (!group) {
    return defaultGroupFormState;
  }

  return {
    name: group.name,
    description: group.description ?? "",
    logoUrl: group.logoUrl ?? null,
    logoFile: null,
    removeLogo: false,
    tags: group.tags ?? [],
    isDefault: group.isDefault,
    show: String(group.show),
    status: String(group.status),
  };
}

function buildGroupPayload(form: GroupFormState) {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    tags: form.tags,
    isDefault: form.isDefault,
    show: Number(form.show),
    status: Number(form.status),
  };
}

function buildGroupRequestBody(form: GroupFormState) {
  const payload = buildGroupPayload(form);
  if (!form.logoFile && !form.removeLogo) {
    return payload;
  }

  const body = new FormData();
  body.set("name", payload.name);
  body.set("description", payload.description);
  body.set("isDefault", String(payload.isDefault));
  body.set("show", String(payload.show));
  body.set("status", String(payload.status));
  if (form.removeLogo) {
    body.set("removeLogo", "true");
  }
  for (const tag of payload.tags) {
    body.append("tags", tag);
  }
  if (form.logoFile) {
    body.set("logo", form.logoFile);
  }
  return body;
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

/* ─── Badge helpers ─── */

function getGroupStatusMeta(status: number) {
  if (status === 1) {
    return { label: "启用", icon: power, dot: "admin-groups__status-dot--active", className: "admin-status--group-enabled" };
  }
  return { label: "停用", icon: powerOff, dot: "admin-groups__status-dot--disabled", className: "admin-status--group-disabled" };
}

function getGroupShowMeta(show: number) {
  if (show === 1) {
    return { label: "展示", icon: eyeIcon, className: "admin-groups__visibility--visible" };
  }
  return { label: "隐藏", icon: eyeOff, className: "admin-groups__visibility--hidden" };
}

function getSystemRoleMeta(roleName: string) {
  return roleName === "super_admin" || roleName === "admin" ? "admin-role--elevated" : "";
}

function getMemberRoleMeta(role: number) {
  if (role === 2) {
    return { label: "组长", className: "admin-groups__member-role--leader" };
  }
  if (role === 1) {
    return { label: "组内管理", className: "admin-groups__member-role--manager" };
  }
  return { label: "成员", className: "admin-groups__member-role--member" };
}

function normalizeMemberSearchKeyword(value: string) {
  return value.trim().toLowerCase();
}

function matchesMemberSearch(keyword: string, values: Array<string | null | undefined>) {
  if (!keyword) {
    return true;
  }

  return values.some((value) => value?.toLowerCase().includes(keyword));
}

/* ─── Main component ─── */

export default function UserGroups() {
  const navigate = useNavigate();
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();

  const noAdminPermission = currentUser.role.name === "user";

  const [statusFilter, setStatusFilter] = useState<ListAdminUserGroupsInput["status"]>(defaultQuery.status);
  const [groups, setGroups] = useState<AdminUserGroupListItem[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    active: 0,
    disabled: 0,
    defaultCount: 0,
    totalMembers: 0,
  });
  const [loadingList, setLoadingList] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);

  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [groupForm, setGroupForm] = useState<GroupFormState>(defaultGroupFormState);
  const [groupLogoPreviewUrl, setGroupLogoPreviewUrl] = useState<string | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);
  const groupLogoInputRef = useRef<HTMLInputElement | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<AdminUserGroupDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const drawerOverlayRef = useRef<HTMLDivElement | null>(null);
  const drawerPanelRef = useRef<HTMLElement | null>(null);
  const drawerCloseTimerRef = useRef<number | null>(null);

  const [candidateRoleMap, setCandidateRoleMap] = useState<Record<number, number>>({});
  const [candidates, setCandidates] = useState<AdminUserGroupCandidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [memberSearchKeyword, setMemberSearchKeyword] = useState("");
  const [mutatingMemberId, setMutatingMemberId] = useState<number | null>(null);

  const [cardActionGroupId, setCardActionGroupId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserGroupListItem | AdminUserGroupDetail | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);

  const normalizedMemberSearchKeyword = useMemo(
    () => normalizeMemberSearchKeyword(memberSearchKeyword),
    [memberSearchKeyword],
  );

  const filteredCandidates = useMemo(
    () =>
      candidates.filter((candidate) =>
        matchesMemberSearch(normalizedMemberSearchKeyword, [
          candidate.name,
          candidate.email,
        ])),
    [candidates, normalizedMemberSearchKeyword],
  );

  const filteredMembers = useMemo(
    () =>
      (selectedGroup?.members ?? []).filter((member) =>
        matchesMemberSearch(normalizedMemberSearchKeyword, [
          member.user.name,
          member.user.email,
        ])),
    [normalizedMemberSearchKeyword, selectedGroup],
  );

  const groupLogoPreviewSrc = groupLogoPreviewUrl
    ?? (!groupForm.removeLogo && groupForm.logoUrl ? buildApiUrl(groupForm.logoUrl) : null);

  /* ─── Effects ─── */

  useEffect(() => {
    if (noAdminPermission) {
      return;
    }

    let cancelled = false;

    async function loadGroups() {
      try {
        setLoadingList(true);
        const response = await listAdminUserGroups({ status: statusFilter });
        if (!cancelled) {
          setGroups(response.items);
          setSummary(response.summary);
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
  }, [navigate, noAdminPermission, statusFilter]);

  useEffect(() => {
    if (!drawerOpen || drawerClosing || selectedGroupId === null) {
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
          closeDrawer(true);
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
  }, [drawerClosing, drawerOpen, navigate, selectedGroupId]);

  useEffect(() => {
    if (!drawerOpen || drawerClosing || selectedGroupId === null) {
      return;
    }

    let cancelled = false;

    async function loadCandidates() {
      try {
        setLoadingCandidates(true);
        const items = await listAdminUserGroupMemberCandidates(selectedGroupId!);
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
  }, [drawerClosing, drawerOpen, navigate, selectedGroupId]);

  useEffect(() => {
    return () => {
      if (drawerCloseTimerRef.current !== null) {
        window.clearTimeout(drawerCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!groupForm.logoFile) {
      setGroupLogoPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(groupForm.logoFile);
    setGroupLogoPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [groupForm.logoFile]);

  useEffect(() => {
    if (!drawerOpen || drawerClosing) {
      return;
    }

    drawerOverlayRef.current?.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 180, easing: "ease-out", fill: "forwards" },
    );
    drawerPanelRef.current?.animate(
      [
        { opacity: 0, transform: "translateX(32px)" },
        { opacity: 1, transform: "translateX(0)" },
      ],
      {
        duration: DRAWER_ANIMATION_MS,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "forwards",
      },
    );
  }, [drawerClosing, drawerOpen, selectedGroupId]);

  /* ─── Data helpers ─── */

  async function refreshList() {
    const response = await listAdminUserGroups({ status: statusFilter });
    setGroups(response.items);
    setSummary(response.summary);
  }

  async function refreshSelectedGroup(groupId: number) {
    const detail = await getAdminUserGroup(groupId);
    setSelectedGroup(detail);
  }

  /* ─── Drawer controls ─── */

  function clearDrawerCloseTimer() {
    if (drawerCloseTimerRef.current !== null) {
      window.clearTimeout(drawerCloseTimerRef.current);
      drawerCloseTimerRef.current = null;
    }
  }

  function finishCloseDrawer() {
    clearDrawerCloseTimer();
    setDrawerClosing(false);
    setDrawerOpen(false);
    setSelectedGroupId(null);
    setSelectedGroup(null);
    setCandidates([]);
    setCandidateRoleMap({});
    setMemberSearchKeyword("");
  }

  function closeDrawer(immediate = false) {
    if (immediate) {
      finishCloseDrawer();
      return;
    }

    if (!drawerOpen || drawerClosing) {
      return;
    }

    clearDrawerCloseTimer();
    setDrawerClosing(true);
    drawerOverlayRef.current?.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 160, easing: "ease-in", fill: "forwards" },
    );
    drawerPanelRef.current?.animate(
      [
        { opacity: 1, transform: "translateX(0)" },
        { opacity: 0, transform: "translateX(32px)" },
      ],
      {
        duration: DRAWER_ANIMATION_MS,
        easing: "ease-in",
        fill: "forwards",
      },
    );
    drawerCloseTimerRef.current = window.setTimeout(() => {
      finishCloseDrawer();
    }, DRAWER_ANIMATION_MS);
  }

  function openCreateModal() {
    setEditingGroupId(null);
    setGroupForm(defaultGroupFormState);
    if (groupLogoInputRef.current) {
      groupLogoInputRef.current.value = "";
    }
    setGroupModalOpen(true);
  }

  function openEditModal(group: AdminUserGroupListItem | AdminUserGroupDetail) {
    setEditingGroupId(group.id);
    setGroupForm(toGroupFormState(group));
    if (groupLogoInputRef.current) {
      groupLogoInputRef.current.value = "";
    }
    setGroupModalOpen(true);
  }

  function openDrawer(groupId: number) {
    clearDrawerCloseTimer();
    setDrawerClosing(false);
    setSelectedGroupId(groupId);
    setSelectedGroup(null);
    setMemberSearchKeyword("");
    setDrawerOpen(true);
  }

  /* ─── Handlers ─── */

  async function handleSubmitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFlash(null);

    try {
      setSavingGroup(true);
      const body = buildGroupRequestBody(groupForm);
      const detail = editingGroupId === null
        ? await createAdminUserGroup(body)
        : await updateAdminUserGroup(editingGroupId, body);

      closeGroupModal();
      setFlash({
        type: "success",
        message: editingGroupId === null ? `已创建招新组别：${detail.name}` : `已更新招新组别：${detail.name}`,
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

  function closeGroupModal() {
    setGroupModalOpen(false);
    if (groupLogoInputRef.current) {
      groupLogoInputRef.current.value = "";
    }
  }

  function handleGroupLogoSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setGroupForm((previous) => ({
      ...previous,
      logoFile: file,
      removeLogo: file ? false : previous.removeLogo,
    }));
  }

  function handleRemoveGroupLogo() {
    setGroupForm((previous) => ({
      ...previous,
      logoFile: null,
      logoUrl: null,
      removeLogo: previous.logoFile !== null || previous.logoUrl !== null,
    }));
    if (groupLogoInputRef.current) {
      groupLogoInputRef.current.value = "";
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
        show: group.show,
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
        show: group.show,
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
      setFlash({ type: "success", message: `已删除招新组别：${deleteTarget.name}` });
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
          const items = await listAdminUserGroupMemberCandidates(selectedGroupId);
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
      const nextRole = member.role === 2 ? 1 : member.role === 1 ? 0 : 1;
      await updateAdminUserGroupMember(selectedGroupId, member.id, { role: nextRole });
      setFlash({
        type: "success",
        message: member.role === 2 ? `已将 ${member.user.name} 降为组内管理员` : nextRole === 1 ? `已将 ${member.user.name} 设为组内管理员` : `已将 ${member.user.name} 调整为普通成员`,
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
          const items = await listAdminUserGroupMemberCandidates(selectedGroupId);
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

  /* ─── No permission ─── */

  if (noAdminPermission) {
    return (
      <div className="admin-design admin-groups">
        <div className="admin-notice admin-notice--warning">
          <h1 className="admin-page-title">招新组别</h1>
          <p className="mt-2 leading-6">当前账号没有管理员权限，无法访问此页面。</p>
        </div>
      </div>
    );
  }

  /* ─── Render ─── */

  return (
    <div className="admin-design admin-groups space-y-4">
      {/* Notification */}
      <Notify
        tone={flash?.type ?? "success"}
        title={flash?.type === "success" ? "操作成功" : "操作失败"}
        message={flash?.message ?? ""}
        open={flash !== null}
        onClose={() => setFlash(null)}
      />

      {/* Header */}
      <header className="admin-page-header flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="admin-eyebrow">吉甲 · 招新设置</div>
          <h1 className="admin-page-title">招新组别</h1>
          <p className="admin-page-description">这些组别用于报名意向、默认组报名资格和分组候选人处理范围。</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="admin-button admin-button--primary shrink-0"
        >
          <Icon icon={folderPlus} className="h-4 w-4" />
          新建招新组别
        </button>
      </header>

      {/* Stats */}
      <div className="admin-groups__summary" aria-label="招新组别概况">
        <span>分组<strong>{summary.total}</strong></span>
        <span>启用<strong>{summary.active}</strong></span>
        <span>停用<strong>{summary.disabled}</strong></span>
        <span>默认<strong>{summary.defaultCount}</strong></span>
        <span>成员<strong>{summary.totalMembers}</strong></span>
      </div>

      {/* Filter bar */}
      <div className="admin-filter-panel admin-groups__filter">
        <div>
          <div className="text-sm font-semibold text-[var(--admin-text)]">组别列表</div>
          <div className="mt-0.5 text-xs text-[var(--admin-dim)]">按状态筛选当前组别。</div>
        </div>
        <div className="admin-groups__filter-controls">
          <label className="admin-groups__status-filter">
            <span className="admin-field-label">分组状态</span>
            <select
              aria-label="筛选分组状态"
              value={String(statusFilter ?? "")}
              onChange={(event) => setStatusFilter(event.target.value === "" ? "" : Number(event.target.value))}
              className="admin-field"
            >
              {statusOptions.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setFlash(null);
              setStatusFilter(defaultQuery.status);
            }}
            className="admin-button admin-button--secondary"
          >
            <Icon icon={rotateCcw} className="h-3.5 w-3.5" />
            重置
          </button>
        </div>
      </div>

      {/* Group list */}
      <section className="admin-panel overflow-hidden" aria-label="招新组别列表">
        <div className="admin-groups__list-heading">
          <span>分组信息</span>
          <span>共 {groups.length} 个</span>
        </div>
        {loadingList ? (
          <div className="admin-table-empty">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--admin-border)] border-t-[var(--admin-accent)]" />
              <span className="text-sm">正在加载...</span>
            </div>
          </div>
        ) : groups.length === 0 ? (
          <div className="admin-groups__empty">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--admin-border)] text-[var(--admin-accent-soft)]">
              <Icon icon={layers} className="h-5 w-5" />
            </div>
            <span className="text-sm text-[var(--admin-muted)]">
              {statusFilter === "" ? "暂无招新组别" : "当前筛选下暂无招新组别"}
            </span>
          </div>
        ) : (
          <div className="admin-groups__list">
            {groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                isBusy={cardActionGroupId === group.id}
                onEdit={() => openEditModal(group)}
                onToggleDefault={() => void handleToggleDefault(group)}
                onToggleStatus={() => void handleToggleStatus(group)}
                onDelete={() => setDeleteTarget(group)}
                onMembers={() => openDrawer(group.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Create / Edit modal */}
      <ModalShell
        open={groupModalOpen}
        title={editingGroupId === null ? "新建招新组别" : "编辑招新组别"}
        headerAccent={
          <div className="admin-groups__modal-icon">
            <Icon
              icon={editingGroupId === null ? folderPlus : editIcon}
              className="h-4 w-4"
            />
          </div>
        }
        onClose={closeGroupModal}
        widthClass="max-w-2xl"
        zIndexClass="z-[70]"
        panelClassName="admin-design admin-groups admin-groups__modal"
        bodyClassName="max-h-[calc(100vh-10rem)] overflow-y-auto px-6 py-5"
        backdropClassName="admin-groups__modal-backdrop"
      >
        <form onSubmit={handleSubmitGroup} className="space-y-3">
          <section className="admin-detail-section">
            <div className="admin-groups__section-heading"><Icon icon={layers} className="h-4 w-4" /><h3>基本信息</h3></div>
            <div className="space-y-4 pt-3">
              <div>
                <FieldLabel htmlFor="group-name" label="分组名称" />
                <input
                  id="group-name"
                  type="text"
                  value={groupForm.name}
                  onChange={(event) => setGroupForm((previous) => ({ ...previous, name: event.target.value }))}
                  className={inputClassName()}
                  placeholder="输入分组名称"
                  required
                />
              </div>
              <div>
                <FieldLabel label="分组 Logo" />
                <div className="admin-groups__logo-picker">
                  <div className="admin-groups__logo-preview">
                    {groupLogoPreviewSrc ? (
                      <img src={groupLogoPreviewSrc} alt={groupForm.name.trim() || "分组 Logo"} className="h-full w-full object-cover" />
                    ) : <Icon icon={layers} className="h-7 w-7" />}
                  </div>
                  <input
                    ref={groupLogoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    onChange={handleGroupLogoSelect}
                    className="hidden"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => groupLogoInputRef.current?.click()} className="admin-button admin-button--secondary admin-button--small">
                      选择图片
                    </button>
                    <button type="button" onClick={handleRemoveGroupLogo} disabled={!groupLogoPreviewSrc} className="admin-button admin-button--quiet admin-button--small">
                      移除
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <FieldLabel label="分组描述" />
                <textarea
                  value={groupForm.description}
                  onChange={(event) => setGroupForm((previous) => ({ ...previous, description: event.target.value }))}
                  className={`${inputClassName()} min-h-24 resize-y`}
                  placeholder="描述分组用途（选填）"
                />
              </div>
            </div>
          </section>

          <section className="admin-detail-section">
            <div className="admin-groups__section-heading"><Icon icon={eyeIcon} className="h-4 w-4" /><h3>展示与状态</h3></div>
            <div className="grid gap-3 pt-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="group-status" label="状态" />
                <select
                  id="group-status"
                  value={groupForm.status}
                  onChange={(event) => setGroupForm((previous) => ({
                    ...previous,
                    status: event.target.value,
                    isDefault: event.target.value === "1" ? previous.isDefault : false,
                  }))}
                  className="admin-field"
                >
                  {statusOptions.filter((option) => option.value !== "").map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div>
                <FieldLabel htmlFor="group-show" label="前台展示" />
                <select
                  id="group-show"
                  value={groupForm.show}
                  onChange={(event) => setGroupForm((previous) => ({ ...previous, show: event.target.value }))}
                  className="admin-field"
                >
                  <option value="1">展示</option>
                  <option value="0">隐藏</option>
                </select>
              </div>
            </div>
          </section>

          <section className="admin-detail-section">
            <div className="admin-groups__section-heading"><Icon icon={tagIcon} className="h-4 w-4" /><h3>标签</h3><span>按回车添加</span></div>
            <div className="pt-3">
              <TagInput tags={groupForm.tags} onChange={(tags) => setGroupForm((previous) => ({ ...previous, tags }))} />
            </div>
          </section>

          <div className={`admin-groups__default-toggle${groupForm.status !== "1" ? " admin-groups__default-toggle--disabled" : ""}`}>
            <div>
              <div className="text-sm font-medium text-[var(--admin-text)]">设为默认分组</div>
              <p className="mt-0.5 text-xs text-[var(--admin-dim)]">新注册用户将自动加入默认分组，同一时间仅保留一个默认分组。</p>
            </div>
            <label className="admin-groups__checkbox-label">
              <input
                type="checkbox"
                checked={groupForm.isDefault}
                onChange={(event) => setGroupForm((previous) => ({ ...previous, isDefault: event.target.checked }))}
                disabled={groupForm.status !== "1"}
                className="admin-checkbox"
              />
              默认
            </label>
          </div>

          <div className="flex flex-col-reverse justify-end gap-2 border-t border-[var(--admin-border-subtle)] pt-4 sm:flex-row">
            <button type="button" onClick={closeGroupModal} disabled={savingGroup} className="admin-button admin-button--secondary">
              取消
            </button>
            <button type="submit" disabled={savingGroup} className="admin-button admin-button--primary">
              {savingGroup ? "保存中..." : editingGroupId === null ? "创建分组" : "保存修改"}
            </button>
          </div>
        </form>
      </ModalShell>

      {/* Delete confirm modal */}
      <ModalShell
        open={deleteTarget !== null}
        title="确认删除"
        headerAccent={
          <div className="admin-groups__modal-icon admin-groups__modal-icon--danger">
            <Icon icon={alertTriangle} className="h-4 w-4" />
          </div>
        }
        onClose={() => setDeleteTarget(null)}
        widthClass="max-w-md"
        zIndexClass="z-[60]"
        panelClassName="admin-design admin-groups admin-groups__modal"
        backdropClassName="admin-groups__modal-backdrop"
      >
        {deleteTarget ? (
          <div className="space-y-5">
            <div className="admin-groups__confirm-notice">
              <Icon icon={alertTriangle} className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="text-sm leading-6">
                即将删除 <span className="font-semibold text-[var(--admin-text)]">{deleteTarget.name}</span>
                {"memberCount" in deleteTarget && deleteTarget.memberCount > 0 ? (
                  <span>（当前 {deleteTarget.memberCount} 人，需先清空成员）</span>
                ) : null}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingGroup}
                className="admin-button admin-button--secondary"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteGroup()}
                disabled={deletingGroup}
                className="admin-button admin-button--danger"
              >
                {deletingGroup ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        ) : null}
      </ModalShell>

      {/* Member management drawer */}
      {drawerOpen ? (
        <OverlayPortal>
          <div className="admin-design admin-groups fixed inset-0 z-[60]">
            <div
              ref={drawerOverlayRef}
              className="admin-drawer-backdrop absolute inset-0"
              onClick={() => closeDrawer()}
            />
            <aside
              ref={drawerPanelRef}
              className="admin-drawer admin-groups__drawer absolute right-0 top-0 h-full w-full max-w-3xl overflow-y-auto"
            >
              {/* Drawer header */}
              <div className="admin-groups__drawer-header sticky top-0 z-10 border-b px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="admin-groups__drawer-icon">
                      <Icon icon={usersIcon} className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-[var(--admin-text)] truncate">
                          {selectedGroup?.name ?? "成员管理"}
                        </h2>
                        {selectedGroup ? (
                          <span className={`admin-status ${getGroupStatusMeta(selectedGroup.status).className}`}>
                            <span className={`admin-groups__status-dot ${getGroupStatusMeta(selectedGroup.status).dot}`} />
                            {getGroupStatusMeta(selectedGroup.status).label}
                          </span>
                        ) : null}
                        {selectedGroup?.isDefault ? (
                          <span className="admin-groups__default-badge">
                            <Icon icon={starIcon} className="h-3 w-3" />
                            默认
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="admin-groups__drawer-tools">
                    <label className="admin-groups__member-search">
                      <span className="admin-groups__search-icon"><Icon icon={searchIcon} className="h-4 w-4" /></span>
                      <input
                        type="text"
                        aria-label="搜索成员和候选账号"
                        value={memberSearchKeyword}
                        onChange={(event) => setMemberSearchKeyword(event.target.value)}
                        placeholder="搜索用户名、邮箱、手机号"
                        className="admin-field pl-9"
                      />
                    </label>
                    <div className="admin-groups__drawer-actions">
                    {selectedGroup ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditModal(selectedGroup)}
                          className="admin-button admin-button--secondary admin-button--small"
                        >
                          <Icon icon={editIcon} className="h-3.5 w-3.5" />
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(selectedGroup)}
                          className="admin-button admin-button--quiet admin-button--small"
                        >
                          <Icon icon={trash2} className="h-3.5 w-3.5" />
                          删除
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      aria-label="关闭"
                      onClick={() => closeDrawer()}
                      className="admin-button admin-button--quiet admin-button--small"
                    >
                      <Icon icon={x} className="h-5 w-5" />
                    </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5">
                {detailLoading || !selectedGroup ? (
                  <div className="admin-table-empty">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--admin-border)] border-t-[var(--admin-accent)]" />
                      <span className="text-sm text-[var(--admin-dim)]">正在加载...</span>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Group info stats */}
                    <div className="admin-groups__drawer-summary">
                      <span>成员<strong>{selectedGroup.memberCount}</strong></span>
                      <span>组长<strong>{selectedGroup.members.filter((member) => member.role === 2).length}</strong></span>
                      <span>创建<strong>{formatDateTime(selectedGroup.createdAt)}</strong></span>
                      <span>更新<strong>{formatDateTime(selectedGroup.updatedAt)}</strong></span>
                    </div>

                    {/* Tags */}
                    {selectedGroup.tags?.length ? (
                      <section className="admin-detail-section">
                        <div className="admin-groups__section-heading"><Icon icon={tagIcon} className="h-4 w-4" /><h3>标签</h3></div>
                        <div className="flex flex-wrap gap-1.5 pt-3">
                          {selectedGroup.tags.map((t) => (
                            <span
                              key={t}
                              className="admin-groups__tag"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {/* Add member */}
                    <section className="admin-detail-section order-2">
                      <div className="admin-groups__section-heading mb-3"><Icon icon={userPlus} className="h-4 w-4" />
                        <div>
                          <h3>添加成员</h3>
                          <p className="mt-0.5 text-xs text-[var(--admin-dim)]">列出当前未加入本组的可选账号</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {loadingCandidates ? (
                          <div className="admin-groups__empty-row">
                            加载中...
                          </div>
                        ) : filteredCandidates.length === 0 ? (
                          <div className="admin-groups__empty-row">
                            {memberSearchKeyword.trim() ? "没有匹配的候选账号" : "暂无可加入的候选账号"}
                          </div>
                        ) : (
                          filteredCandidates.map((candidate) => (
                            <div
                              key={candidate.id}
                              className="admin-groups__member-row"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-sm font-medium text-[var(--admin-text)]">{candidate.name}</span>
                                    <RoleBadge roleName={candidate.role.name} displayName={candidate.role.displayName} />
                                    <UserStatusBadge status={candidate.status} />
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--admin-muted)]">
                                    <span className="flex min-w-0 items-center gap-1.5">
                                      <Icon icon={mailIcon} className="h-3 w-3 shrink-0 text-[var(--admin-dim)]" />
                                      <span className="truncate">{candidate.email}</span>
                                    </span>
                                  </div>
                                  {candidate.groups?.length ? (
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                      {candidate.groups.map((g) => (
                                        <span
                                          key={`${candidate.id}-${g.id}`}
                                          className="admin-groups__existing-group"
                                        >
                                          {g.name}
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
                                      setCandidateRoleMap((prev) => ({
                                        ...prev,
                                        [candidate.id]: Number(event.target.value),
                                      }))
                                    }
                                    className="admin-field admin-groups__role-select"
                                  >
                                    {memberRoleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => void handleAddMember(candidate)}
                                    disabled={mutatingMemberId === candidate.id}
                                    className="admin-button admin-button--primary admin-button--small"
                                  >
                                    <Icon icon={userPlus} className="h-3 w-3" />
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
                    <section className="admin-detail-section order-1">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Icon icon={usersIcon} className="h-4 w-4 text-[var(--admin-accent-soft)]" />
                          <h3 className="text-sm font-semibold text-[var(--admin-text)]">当前成员</h3>
                        </div>
                        <span className="text-xs text-[var(--admin-dim)]">
                          {memberSearchKeyword.trim()
                            ? `${filteredMembers.length} / ${selectedGroup.members.length} 人`
                            : `${selectedGroup.members.length} 人`}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {filteredMembers.length === 0 ? (
                          <div className="admin-groups__empty-row">
                            {memberSearchKeyword.trim() ? "没有匹配的成员" : "暂无成员"}
                          </div>
                        ) : (
                          filteredMembers.map((member) => (
                            <div
                              key={member.id}
                              className="admin-groups__member-row"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-sm font-medium text-[var(--admin-text)]">{member.user.name}</span>
                                    <RoleBadge roleName={member.user.role.name} displayName={member.user.role.displayName} />
                                    <RoleBadge
                                      roleName={member.role === 2 ? "leader" : member.role === 1 ? "group_admin" : "member"}
                                      displayName={getMemberRoleMeta(member.role).label}
                                      className={getMemberRoleMeta(member.role).className}
                                    />
                                    <UserStatusBadge status={member.user.status} />
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--admin-muted)]">
                                    <span className="flex min-w-0 items-center gap-1.5">
                                      <Icon icon={mailIcon} className="h-3 w-3 shrink-0 text-[var(--admin-dim)]" />
                                      <span className="truncate">{member.user.email}</span>
                                    </span>
                                    <span className="text-[var(--admin-dim)] shrink-0">{formatDateTime(member.joinedAt)}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => void handleToggleMemberRole(member)}
                                    disabled={mutatingMemberId === member.id}
                                    className="admin-button admin-button--secondary admin-button--small"
                                  >
                                    <Icon icon={member.role > 0 ? userCheck : crown} className="h-3 w-3" />
                                    {mutatingMemberId === member.id
                                      ? "处理中..."
                                      : member.role === 2
                                        ? "降为组内管理员"
                                        : member.role === 1
                                          ? "改为成员"
                                          : "设为组内管理员"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleRemoveMember(member)}
                                    disabled={mutatingMemberId === member.id}
                                    className="admin-button admin-button--quiet admin-button--small"
                                  >
                                    <Icon icon={userMinus} className="h-3 w-3" />
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
        </OverlayPortal>
      ) : null}
    </div>
  );
}

/* ─── Sub-components ─── */

function GroupCard({
  group,
  isBusy,
  onEdit,
  onToggleDefault,
  onToggleStatus,
  onDelete,
  onMembers,
}: {
  group: AdminUserGroupListItem;
  isBusy: boolean;
  onEdit: () => void;
  onToggleDefault: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onMembers: () => void;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const status = getGroupStatusMeta(group.status);
  const visibility = getGroupShowMeta(group.show);
  const leaders = group.leaders ?? [];
  const logoSrc = group.logoUrl ? buildApiUrl(group.logoUrl) : null;
  const tags = group.tags ?? [];

  useEffect(() => {
    if (!actionsOpen) return;
    function handleClick(event: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
        setActionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [actionsOpen]);

  return (
    <article className="admin-groups__item">
      <div className="admin-groups__identity">
        <div className="admin-groups__logo">
          {logoSrc ? <img src={logoSrc} alt="" className="h-full w-full object-cover" /> : <Icon icon={layers} className="h-5 w-5" />}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-[var(--admin-text)]">{group.name}</h2>
            {group.isDefault ? <span className="admin-groups__default-badge"><Icon icon={starIcon} className="h-3 w-3" />默认</span> : null}
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs text-[var(--admin-dim)]">{group.description?.trim() || "暂无描述"}</p>
          {tags.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {tags.slice(0, 3).map((tag) => <span key={tag} className="admin-groups__tag">{tag}</span>)}
              {tags.length > 3 ? <span className="text-[11px] text-[var(--admin-dim)]">+{tags.length - 3}</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="admin-groups__facts">
        <div className="admin-groups__fact">
          <span className="admin-groups__fact-label">状态</span>
          <span className={`admin-status ${status.className}`}><span className={`admin-groups__status-dot ${status.dot}`} />{status.label}</span>
        </div>
        <div className="admin-groups__fact">
          <span className="admin-groups__fact-label">前台展示</span>
          <span className={`admin-groups__visibility ${visibility.className}`}><Icon icon={visibility.icon} className="h-3 w-3" />{visibility.label}</span>
        </div>
        <div className="admin-groups__fact">
          <span className="admin-groups__fact-label">成员</span>
          <span className="admin-groups__member-count">{group.memberCount}</span>
        </div>
        <div className="admin-groups__fact admin-groups__leaders-fact">
          <span className="admin-groups__fact-label">负责人</span>
          {leaders.length ? (
            <span className="admin-groups__leaders" title={leaders.join("、")}>
              {leaders.slice(0, 2).join("、")}{leaders.length > 2 ? ` +${leaders.length - 2}` : ""}
            </span>
          ) : <span className="admin-groups__unassigned">未指定</span>}
        </div>
        <div className="admin-groups__fact admin-groups__updated-fact">
          <span className="admin-groups__fact-label">更新</span>
          <span className="admin-groups__updated"><Icon icon={clock} className="h-3 w-3" />{formatDateTime(group.updatedAt)}</span>
        </div>
      </div>

      <div className="admin-groups__item-actions">
        <button type="button" onClick={onMembers} disabled={isBusy} className="admin-button admin-button--primary admin-button--small">
          成员管理
        </button>
        <button type="button" onClick={onEdit} disabled={isBusy} className="admin-button admin-button--secondary admin-button--small">
          编辑
        </button>
        <div ref={actionsRef} className="relative">
          <button
            type="button"
            onClick={() => setActionsOpen((open) => !open)}
            disabled={isBusy}
            aria-label={`${group.name} 更多操作`}
            aria-expanded={actionsOpen}
            className="admin-button admin-button--quiet admin-button--small"
          >
            <Icon icon={moreHorizontal} className="h-4 w-4" />
          </button>
          {actionsOpen ? (
            <div className="admin-groups__action-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setActionsOpen(false); onToggleDefault(); }} disabled={isBusy || group.status !== 1}>
                <Icon icon={group.isDefault ? starOff : starIcon} className="h-3.5 w-3.5" />
                {group.isDefault ? "取消默认" : "设为默认"}
              </button>
              <button type="button" role="menuitem" onClick={() => { setActionsOpen(false); onToggleStatus(); }} disabled={isBusy}>
                <Icon icon={group.status === 1 ? powerOff : power} className="h-3.5 w-3.5" />
                {group.status === 1 ? "停用分组" : "启用分组"}
              </button>
              <div className="admin-groups__action-divider" />
              <button type="button" role="menuitem" onClick={() => { setActionsOpen(false); onDelete(); }} disabled={isBusy} className="admin-groups__action-danger">
                <Icon icon={trash2} className="h-3.5 w-3.5" />
                删除分组
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function OverlayPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(children, document.body);
}

function FieldLabel({ label, hint, htmlFor }: { label: string; hint?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="admin-field-label">
      {label}
      {hint ? <span className="ml-2 text-xs font-normal text-[var(--admin-dim)]">{hint}</span> : null}
    </label>
  );
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const value = raw.trim();
    if (value && !tags.includes(value)) {
      onChange([...tags, value]);
    }
    setInput("");
  }

  function removeTag(index: number) {
    onChange(tags.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === "，") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }

  return (
    <div
      className="admin-groups__tag-input"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag, i) => (
        <span
          key={tag}
          className="admin-groups__tag"
        >
          #{tag}
          <button
            type="button"
            aria-label={`移除标签 ${tag}`}
            onClick={(e) => { e.stopPropagation(); removeTag(i); }}
            className="admin-groups__tag-remove"
          >
            <Icon icon={x} className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) addTag(input); }}
        className="min-w-[80px] flex-1 border-none bg-transparent py-0.5 text-sm text-[var(--admin-text)] placeholder:text-[var(--admin-dim)] outline-none"
        placeholder={tags.length === 0 ? "输入标签，按回车添加" : "继续添加..."}
      />
    </div>
  );
}

function inputClassName(disabled = false) {
  return `admin-field${disabled ? " admin-field--disabled" : ""}`;
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
    <span className={`admin-role ${resolvedClassName}`}>
      {displayName}
    </span>
  );
}

function UserStatusBadge({ status }: { status: number }) {
  const className = status === 1 ? "admin-groups__user-status--enabled" : "admin-groups__user-status--disabled";

  return (
    <span className={`admin-status ${className}`}>
      <span className={`admin-groups__status-dot ${status === 1 ? "admin-groups__status-dot--active" : "admin-groups__status-dot--disabled"}`} />
      {status === 1 ? "启用" : "停用"}
    </span>
  );
}
