import alertTriangle from "@iconify-icons/lucide/alert-triangle";
import arrowRight from "@iconify-icons/lucide/arrow-right";
import clock from "@iconify-icons/lucide/clock";
import crown from "@iconify-icons/lucide/crown";
import editIcon from "@iconify-icons/lucide/edit-3";
import eyeIcon from "@iconify-icons/lucide/eye";
import eyeOff from "@iconify-icons/lucide/eye-off";
import folderPlus from "@iconify-icons/lucide/folder-plus";
import layers from "@iconify-icons/lucide/layers";
import mailIcon from "@iconify-icons/lucide/mail";
import moreHorizontal from "@iconify-icons/lucide/more-horizontal";
import phoneIcon from "@iconify-icons/lucide/phone";
import power from "@iconify-icons/lucide/power";
import powerOff from "@iconify-icons/lucide/power-off";
import rotateCcw from "@iconify-icons/lucide/rotate-ccw";
import searchIcon from "@iconify-icons/lucide/search";
import shieldIcon from "@iconify-icons/lucide/shield";
import starIcon from "@iconify-icons/lucide/star";
import starOff from "@iconify-icons/lucide/star-off";
import tagIcon from "@iconify-icons/lucide/tag";
import trash2 from "@iconify-icons/lucide/trash-2";
import userCheck from "@iconify-icons/lucide/user-check";
import userMinus from "@iconify-icons/lucide/user-minus";
import userPlus from "@iconify-icons/lucide/user-plus";
import usersIcon from "@iconify-icons/lucide/users";
import x from "@iconify-icons/lucide/x";
import zap from "@iconify-icons/lucide/zap";
import { Icon, type IconifyIcon } from "@iconify/react";
import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useOutletContext } from "react-router";
import { AnimatedSelect } from "~/components/animated-select";
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
  { value: 1, label: "组长" },
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
    return { label: "启用", icon: power, dot: "bg-emerald-400", className: "text-emerald-300 bg-emerald-500/10 border-emerald-400/20" };
  }
  return { label: "停用", icon: powerOff, dot: "bg-gray-500", className: "text-gray-300 bg-gray-500/10 border-gray-400/20" };
}

function getGroupShowMeta(show: number) {
  if (show === 1) {
    return { label: "展示", icon: eyeIcon, className: "text-sky-300 bg-sky-500/10 border-sky-400/20" };
  }
  return { label: "隐藏", icon: eyeOff, className: "text-gray-300 bg-gray-500/10 border-gray-400/20" };
}

function getSystemRoleMeta(roleName: string) {
  if (roleName === "super_admin") {
    return "text-amber-300 bg-amber-500/10 border border-amber-400/20";
  }
  if (roleName === "admin") {
    return "text-sky-300 bg-sky-500/10 border border-sky-400/20";
  }
  return "text-gray-300 bg-gray-500/10 border border-gray-400/20";
}

function getMemberRoleMeta(role: number) {
  if (role === 1) {
    return { label: "组长", className: "text-primary-300 bg-primary-500/10 border border-primary-400/20" };
  }
  return { label: "成员", className: "text-gray-300 bg-gray-500/10 border border-gray-400/20" };
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

  const averageMembers = useMemo(() => {
    if (summary.total === 0) {
      return "0";
    }
    return (summary.totalMembers / summary.total).toFixed(1);
  }, [summary.total, summary.totalMembers]);

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
          candidate.phone,
        ])),
    [candidates, normalizedMemberSearchKeyword],
  );

  const filteredMembers = useMemo(
    () =>
      (selectedGroup?.members ?? []).filter((member) =>
        matchesMemberSearch(normalizedMemberSearchKeyword, [
          member.user.name,
          member.user.email,
          member.user.phone,
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
      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-6">
        <h1 className="text-xl font-semibold text-white">用户分组</h1>
        <p className="mt-2 text-sm leading-6 text-amber-100/80">
          当前账号没有管理员权限，无法访问此页面。
        </p>
      </div>
    );
  }

  /* ─── Render ─── */

  return (
    <div className="space-y-6">
      {/* Notification */}
      <Notify
        tone={flash?.type ?? "success"}
        title={flash?.type === "success" ? "操作成功" : "操作失败"}
        message={flash?.message ?? ""}
        open={flash !== null}
        onClose={() => setFlash(null)}
      />

      {/* Header */}
      <div className="motion-fade-up flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl chip-gradient-soft text-primary-200">
            <Icon icon={layers} className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">用户分组</h1>
            <p className="text-sm text-gray-500">管理用户分组与成员分配</p>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-2 btn-gradient rounded-xl px-5 py-2.5 text-sm font-medium text-white cursor-pointer"
        >
          <Icon icon={folderPlus} className="h-4 w-4" />
          新建分组
        </button>
      </div>

      {/* Stats */}
      <div className="motion-fade-up grid grid-cols-2 xl:grid-cols-4 gap-4" style={{ animationDelay: "80ms" }}>
        <StatCard icon={layers} label="分组总数" value={summary.total} color="primary" />
        <StatCard
          icon={power}
          label="启用分组"
          value={summary.active}
          color="emerald"
          extra={summary.disabled > 0 ? `停用 ${summary.disabled}` : undefined}
        />
        <StatCard icon={starIcon} label="默认分组" value={summary.defaultCount} color="amber" />
        <StatCard
          icon={usersIcon}
          label="总成员数"
          value={summary.totalMembers}
          color="sky"
          extra={`均 ${averageMembers}/组`}
        />
      </div>

      {/* Filter bar */}
      <div className="motion-fade-up flex flex-col gap-3 glass-panel rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between" style={{ animationDelay: "140ms" }}>
        <div>
          <div className="text-sm font-medium text-white">筛选分组</div>
          <div className="mt-0.5 text-xs text-gray-500">按状态快速筛选，所有分组在当前页展示。</div>
        </div>
        <div className="flex items-center gap-2">
          <AnimatedSelect
            ariaLabel="筛选状态"
            value={String(statusFilter ?? "")}
            onChange={(value) => setStatusFilter(value === "" ? "" : Number(value))}
            options={statusOptions.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            fitContent
          />
          <button
            type="button"
            onClick={() => {
              setFlash(null);
              setStatusFilter(defaultQuery.status);
            }}
            className="inline-flex items-center gap-1.5 btn-glass rounded-xl px-3.5 py-2 text-sm text-gray-400 transition-colors cursor-pointer"
          >
            <Icon icon={rotateCcw} className="h-3.5 w-3.5" />
            重置
          </button>
        </div>
      </div>

      {/* Group cards */}
      <div className="motion-fade-up grid gap-4 md:grid-cols-2 xl:grid-cols-3" style={{ animationDelay: "200ms" }}>
        {loadingList ? (
          <div className="col-span-full flex items-center justify-center glass-panel rounded-2xl px-6 py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-primary-500" />
              <span className="text-sm text-gray-500">正在加载...</span>
            </div>
          </div>
        ) : groups.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.06] bg-black/20 px-6 py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.03]">
              <Icon icon={layers} className="h-6 w-6 text-gray-600" />
            </div>
            <span className="text-sm text-gray-500">
              {statusFilter === "" ? "暂无用户组" : "当前筛选下暂无用户组"}
            </span>
          </div>
        ) : (
          groups.map((group) => (
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
          ))
        )}
      </div>

      {/* Create / Edit modal */}
      <ModalShell
        open={groupModalOpen}
        title={editingGroupId === null ? "新建用户组" : "编辑用户组"}
        headerAccent={
          <div className="flex h-9 w-9 items-center justify-center rounded-xl chip-gradient-soft">
            <Icon
              icon={editingGroupId === null ? folderPlus : editIcon}
              className="h-4 w-4 text-primary-200"
            />
          </div>
        }
        onClose={closeGroupModal}
        widthClass="max-w-2xl"
        zIndexClass="z-[70]"
        panelClassName="glass-panel glass-panel-strong rounded-2xl shadow-2xl shadow-black/40"
        bodyClassName="max-h-[calc(100vh-10rem)] overflow-y-auto px-6 py-5"
        backdropClassName="bg-black/70 backdrop-blur-sm"
      >
            <form onSubmit={handleSubmitGroup} className="space-y-6">
              {/* ── Section: 基本信息 ── */}
              <section className="rounded-2xl border border-white/[0.06] bg-white/[0.03] overflow-hidden">
                <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-5 py-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md chip-gradient-soft">
                    <Icon icon={layers} className="h-3.5 w-3.5 text-primary-200" />
                  </div>
                  <span className="text-sm font-medium text-gray-200">基本信息</span>
                </div>
                <div className="px-5 py-4 space-y-4">
                  <div>
                    <FieldLabel htmlFor="group-name" label="分组名称" />
                    <input
                      id="group-name"
                      type="text"
                      value={groupForm.name}
                      onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))}
                      className={inputClassName()}
                      placeholder="输入分组名称"
                      required
                    />
                  </div>
                  <div>
                    <FieldLabel label="分组 Logo" />
                    <div className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-black/30 p-4 sm:flex-row sm:items-center">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30">
                        {groupLogoPreviewSrc ? (
                          <img
                            src={groupLogoPreviewSrc}
                            alt={groupForm.name.trim() || "分组 Logo"}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Icon icon={layers} className="h-8 w-8 text-gray-600" />
                        )}
                      </div>
                      <div className="flex flex-1 items-center gap-2">
                        <input
                          ref={groupLogoInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                          onChange={handleGroupLogoSelect}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => groupLogoInputRef.current?.click()}
                          className="inline-flex items-center gap-2 btn-glass rounded-xl px-4 py-2 text-sm text-gray-200 transition-colors cursor-pointer"
                        >
                          选择图片
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveGroupLogo}
                          disabled={!groupLogoPreviewSrc}
                          className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                        >
                          移除
                        </button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <FieldLabel label="分组描述" />
                    <textarea
                      value={groupForm.description}
                      onChange={(e) => setGroupForm((p) => ({ ...p, description: e.target.value }))}
                      className={`${inputClassName()} min-h-24 resize-y`}
                      placeholder="描述分组用途（选填）"
                    />
                  </div>
                </div>
              </section>

              {/* ── Section: 展示与状态 ── */}
              <section className="rounded-2xl border border-white/[0.06] bg-white/[0.03] overflow-hidden">
                <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-5 py-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-500/10">
                    <Icon icon={zap} className="h-3.5 w-3.5 text-sky-400" />
                  </div>
                  <span className="text-sm font-medium text-gray-200">展示与状态</span>
                </div>
                <div className="px-5 py-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <FieldLabel htmlFor="group-status" label="状态" />
                      <AnimatedSelect
                        id="group-status"
                        ariaLabel="状态"
                        value={groupForm.status}
                        onChange={(value) =>
                          setGroupForm((p) => ({
                            ...p,
                            status: value,
                            isDefault: value === "1" ? p.isDefault : false,
                          }))
                        }
                        options={statusOptions
                          .filter((o) => o.value !== "")
                          .map((o) => ({
                            value: o.value,
                            label: o.label,
                          }))}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="group-show" label="前台展示" />
                      <AnimatedSelect
                        id="group-show"
                        ariaLabel="前台展示"
                        value={groupForm.show}
                        onChange={(value) => setGroupForm((p) => ({ ...p, show: value }))}
                        options={[
                          { value: "1", label: "展示" },
                          { value: "0", label: "隐藏" },
                        ]}
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Section: 标签 ── */}
              <section className="rounded-2xl border border-white/[0.06] bg-white/[0.03] overflow-hidden">
                <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-5 py-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/10">
                    <Icon icon={tagIcon} className="h-3.5 w-3.5 text-amber-400" />
                  </div>
                  <span className="text-sm font-medium text-gray-200">标签</span>
                  <span className="text-xs text-gray-600">输入后按回车添加</span>
                </div>
                <div className="px-5 py-4">
                  <TagInput
                    tags={groupForm.tags}
                    onChange={(tags) => setGroupForm((p) => ({ ...p, tags }))}
                  />
                </div>
              </section>

              {/* ── Default group toggle ── */}
              <label className={`group/toggle flex items-center gap-4 rounded-xl border px-5 py-4 transition-all cursor-pointer ${groupForm.isDefault ? "border-amber-400/30 bg-gradient-to-r from-amber-500/[0.08] to-transparent shadow-sm shadow-amber-500/5" : "border-white/[0.06] bg-white/[0.03] hover:border-white/[0.1] hover:bg-white/[0.05]"} ${groupForm.status !== "1" ? "opacity-50 cursor-not-allowed" : ""}`}>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${groupForm.isDefault ? "bg-amber-500/15" : "bg-white/[0.04] group-hover/toggle:bg-white/[0.06]"}`}>
                  <Icon icon={groupForm.isDefault ? starIcon : starOff} className={`h-5 w-5 transition-colors ${groupForm.isDefault ? "text-amber-400" : "text-gray-500 group-hover/toggle:text-gray-400"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white">设为默认分组</div>
                  <p className="mt-0.5 text-xs text-gray-500">新注册用户将自动加入默认分组，同一时间仅保留一个默认分组</p>
                </div>
                <div className="shrink-0">
                  <input
                    type="checkbox"
                    checked={groupForm.isDefault}
                    onChange={(e) => setGroupForm((p) => ({ ...p, isDefault: e.target.checked }))}
                    disabled={groupForm.status !== "1"}
                    className="sr-only peer"
                  />
                  <div className={`relative h-6 w-11 rounded-full transition-colors ${groupForm.isDefault ? "bg-amber-500" : "bg-white/[0.1]"}`}>
                    <div className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${groupForm.isDefault ? "translate-x-5" : "translate-x-0"}`} />
                  </div>
                </div>
              </label>

              {/* ── Footer ── */}
              <div className="relative pt-5">
                <div className="absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-gray-700/60 to-transparent" />
                <div className="flex items-center justify-end">
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={savingGroup}
                      className="inline-flex items-center gap-2 btn-gradient rounded-xl px-5 py-2.5 text-sm font-medium text-white cursor-pointer"
                    >
                      {savingGroup ? (
                        <>
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          保存中...
                        </>
                      ) : (
                        <>
                          <Icon icon={editingGroupId === null ? folderPlus : userCheck} className="h-3.5 w-3.5" />
                          {editingGroupId === null ? "创建分组" : "保存修改"}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </form>
      </ModalShell>

      {/* Delete confirm modal */}
      <ModalShell
        open={deleteTarget !== null}
        title="确认删除"
        headerAccent={
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 shadow-sm shadow-rose-500/5">
            <Icon icon={alertTriangle} className="h-4 w-4 text-rose-400" />
          </div>
        }
        onClose={() => setDeleteTarget(null)}
        widthClass="max-w-md"
        zIndexClass="z-[60]"
        panelClassName="glass-panel glass-panel-strong rounded-2xl shadow-2xl shadow-black/40"
        backdropClassName="bg-black/70 backdrop-blur-sm"
      >
        {deleteTarget ? (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-xl border border-rose-400/20 bg-rose-500/10 p-4">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-500/10">
                <Icon icon={alertTriangle} className="h-4 w-4 text-rose-400" />
              </div>
              <div className="text-sm leading-6 text-red-100/80">
                即将删除 <span className="font-semibold text-white">{deleteTarget.name}</span>
                {"memberCount" in deleteTarget && deleteTarget.memberCount > 0 ? (
                  <span className="text-rose-300">（当前 {deleteTarget.memberCount} 人，需先清空成员）</span>
                ) : null}
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingGroup}
                className="btn-glass rounded-xl px-4 py-2.5 text-sm text-gray-300 transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteGroup()}
                disabled={deletingGroup}
                className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-2.5 text-sm font-medium text-rose-300 transition-all hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
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
          <div className="fixed inset-0 z-[60]">
            <div
              ref={drawerOverlayRef}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => closeDrawer()}
            />
            <aside
              ref={drawerPanelRef}
              className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto glass-panel glass-panel-strong border-l shadow-2xl"
            >
              {/* Drawer header */}
              <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-black/30 px-6 py-4 backdrop-blur">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl chip-gradient-soft">
                      <Icon icon={usersIcon} className="h-4.5 w-4.5 text-primary-200" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-white truncate">
                          {selectedGroup?.name ?? "成员管理"}
                        </h2>
                        {selectedGroup ? (
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${getGroupStatusMeta(selectedGroup.status).className}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${getGroupStatusMeta(selectedGroup.status).dot}`} />
                            {getGroupStatusMeta(selectedGroup.status).label}
                          </span>
                        ) : null}
                        {selectedGroup?.isDefault ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
                            <Icon icon={starIcon} className="h-3 w-3" />
                            默认
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <label className="relative block w-full sm:w-80">
                      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <Icon icon={searchIcon} className="h-4 w-4 text-gray-500" />
                      </span>
                      <input
                        type="text"
                        value={memberSearchKeyword}
                        onChange={(event) => setMemberSearchKeyword(event.target.value)}
                        placeholder="搜索用户名、邮箱、手机号"
                        className="w-full rounded-xl border border-white/[0.08] bg-black/30 py-2 pl-9 pr-3 text-sm text-gray-100 outline-none transition-colors placeholder:text-gray-500 focus:border-primary-400/60"
                      />
                    </label>
                    <div className="flex items-center gap-2 shrink-0">
                    {selectedGroup ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditModal(selectedGroup)}
                          className="inline-flex items-center gap-1.5 btn-glass rounded-xl px-3 py-1.5 text-xs text-gray-300 transition-colors cursor-pointer"
                        >
                          <Icon icon={editIcon} className="h-3.5 w-3.5" />
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(selectedGroup)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 transition-colors hover:bg-rose-500/20 cursor-pointer"
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
                      className="rounded-xl p-1.5 text-gray-400 transition-colors hover:text-white hover:bg-white/5 cursor-pointer"
                    >
                      <Icon icon={x} className="h-5 w-5" />
                    </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-5 px-6 py-5">
                {detailLoading || !selectedGroup ? (
                  <div className="flex items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03] px-6 py-16">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-primary-500" />
                      <span className="text-sm text-gray-500">正在加载...</span>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Group info stats */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <DrawerStatBlock label="成员" value={selectedGroup.memberCount} />
                      <DrawerStatBlock
                        label="组长"
                        value={selectedGroup.members.filter((m) => m.role === 1).length}
                      />
                      <DrawerStatBlock label="创建" value={formatDateTime(selectedGroup.createdAt)} small />
                      <DrawerStatBlock label="更新" value={formatDateTime(selectedGroup.updatedAt)} small />
                    </div>

                    {/* Tags */}
                    {selectedGroup.tags?.length ? (
                      <section className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                        <div className="mb-2.5 flex items-center gap-2 text-xs font-medium text-gray-400">
                          <Icon icon={tagIcon} className="h-3.5 w-3.5" />
                          标签
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedGroup.tags.map((t) => (
                            <span
                              key={t}
                              className="inline-flex rounded-full border border-primary-400/20 bg-primary-500/10 px-2.5 py-0.5 text-xs text-primary-200"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {/* Add member */}
                    <section className="order-2 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                      <div className="mb-4 flex items-center gap-2">
                        <Icon icon={userPlus} className="h-4 w-4 text-primary-400" />
                        <div>
                          <h3 className="text-sm font-semibold text-white">添加成员</h3>
                          <p className="mt-0.5 text-xs text-gray-500">列出当前未加入本组的可选账号</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {loadingCandidates ? (
                          <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-8 text-center text-sm text-gray-500">
                            加载中...
                          </div>
                        ) : filteredCandidates.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-8 text-center text-sm text-gray-500">
                            {memberSearchKeyword.trim() ? "没有匹配的候选账号" : "暂无可加入的候选账号"}
                          </div>
                        ) : (
                          filteredCandidates.map((candidate) => (
                            <div
                              key={candidate.id}
                              className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.05]"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-sm font-medium text-white">{candidate.name}</span>
                                    <RoleBadge roleName={candidate.role.name} displayName={candidate.role.displayName} />
                                    <UserStatusBadge status={candidate.status} />
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                                    <span className="flex min-w-0 items-center gap-1.5">
                                      <Icon icon={mailIcon} className="h-3 w-3 shrink-0 text-gray-600" />
                                      <span className="truncate">{candidate.email}</span>
                                    </span>
                                    {candidate.phone ? (
                                      <span className="flex items-center gap-1.5">
                                        <Icon icon={phoneIcon} className="h-3 w-3 shrink-0 text-gray-600" />
                                        <span>{candidate.phone}</span>
                                      </span>
                                    ) : null}
                                  </div>
                                  {candidate.groups?.length ? (
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                      {candidate.groups.map((g) => (
                                        <span
                                          key={`${candidate.id}-${g.id}`}
                                          className="inline-flex rounded-full bg-white/[0.05] px-2 py-0.5 text-xs text-gray-400"
                                        >
                                          {g.name}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <AnimatedSelect
                                    ariaLabel="入组角色"
                                    value={candidateRoleMap[candidate.id] ?? 0}
                                    onChange={(value) =>
                                      setCandidateRoleMap((prev) => ({
                                        ...prev,
                                        [candidate.id]: Number(value),
                                      }))
                                    }
                                    options={memberRoleOptions.map((o) => ({
                                      value: o.value,
                                      label: o.label,
                                    }))}
                                    size="compact"
                                    fitContent
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void handleAddMember(candidate)}
                                    disabled={mutatingMemberId === candidate.id}
                                    className="inline-flex items-center gap-1 btn-gradient rounded-xl px-3 py-1.5 text-xs font-medium text-white cursor-pointer"
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
                    <section className="order-1 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <Icon icon={usersIcon} className="h-4 w-4 text-emerald-400" />
                          <h3 className="text-sm font-semibold text-white">当前成员</h3>
                        </div>
                        <span className="rounded-full bg-white/[0.05] px-2.5 py-0.5 text-xs text-gray-400">
                          {memberSearchKeyword.trim()
                            ? `${filteredMembers.length} / ${selectedGroup.members.length} 人`
                            : `${selectedGroup.members.length} 人`}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {filteredMembers.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-8 text-center text-sm text-gray-500">
                            {memberSearchKeyword.trim() ? "没有匹配的成员" : "暂无成员"}
                          </div>
                        ) : (
                          filteredMembers.map((member) => (
                            <div
                              key={member.id}
                              className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.05]"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-sm font-medium text-white">{member.user.name}</span>
                                    <RoleBadge roleName={member.user.role.name} displayName={member.user.role.displayName} />
                                    <RoleBadge
                                      roleName={member.role === 1 ? "leader" : "member"}
                                      displayName={getMemberRoleMeta(member.role).label}
                                      className={getMemberRoleMeta(member.role).className}
                                    />
                                    <UserStatusBadge status={member.user.status} />
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                                    <span className="flex min-w-0 items-center gap-1.5">
                                      <Icon icon={mailIcon} className="h-3 w-3 shrink-0 text-gray-600" />
                                      <span className="truncate">{member.user.email}</span>
                                    </span>
                                    {member.user.phone ? (
                                      <span className="flex items-center gap-1.5">
                                        <Icon icon={phoneIcon} className="h-3 w-3 shrink-0 text-gray-600" />
                                        <span>{member.user.phone}</span>
                                      </span>
                                    ) : null}
                                    <span className="text-gray-600 shrink-0">{formatDateTime(member.joinedAt)}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => void handleToggleMemberRole(member)}
                                    disabled={mutatingMemberId === member.id}
                                    className="inline-flex items-center gap-1 rounded-xl border border-primary-400/30 px-3 py-1.5 text-xs text-primary-200 transition-colors hover:bg-primary-500/10 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                                  >
                                    <Icon icon={member.role === 1 ? userCheck : crown} className="h-3 w-3" />
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
                                    className="inline-flex items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
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

const statColorMap = {
  primary: {
    icon: "bg-primary-500/10 text-primary-400",
    value: "text-gradient-brand",
    glow: "bg-primary-500/5",
  },
  emerald: {
    icon: "bg-emerald-500/10 text-emerald-400",
    value: "text-gradient-brand",
    glow: "bg-emerald-500/5",
  },
  amber: {
    icon: "bg-amber-500/10 text-amber-400",
    value: "text-gradient-brand",
    glow: "bg-amber-500/5",
  },
  sky: {
    icon: "bg-sky-500/10 text-sky-400",
    value: "text-gradient-brand",
    glow: "bg-sky-500/5",
  },
} as const;

function StatCard({
  icon,
  label,
  value,
  color,
  extra,
}: {
  icon: IconifyIcon;
  label: string;
  value: ReactNode;
  color: keyof typeof statColorMap;
  extra?: string;
}) {
  const c = statColorMap[color];

  return (
    <div className="group relative overflow-hidden glass-panel glass-card rounded-2xl p-4">
      <div className={`absolute -right-4 -top-4 h-20 w-20 rounded-full ${c.glow} blur-2xl`} />
      <div className="relative flex items-start justify-between">
        <div>
          <div className={`text-2xl font-bold tabular-nums ${c.value}`}>{value}</div>
          <div className="mt-1 text-sm text-gray-500">{label}</div>
          {extra ? <div className="mt-0.5 text-xs text-gray-600">{extra}</div> : null}
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${c.icon}`}>
          <Icon icon={icon} className="h-4.5 w-4.5" />
        </div>
      </div>
    </div>
  );
}

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
  const isActive = group.status === 1;
  const leaders = group.leaders ?? [];
  const logoSrc = group.logoUrl ? buildApiUrl(group.logoUrl) : null;
  const tags = group.tags ?? [];

  useEffect(() => {
    if (!actionsOpen) return;
    function handleClick(e: MouseEvent) {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [actionsOpen]);

  return (
    <article className="group/card relative flex flex-col glass-panel glass-card rounded-2xl">
      {/* ── Decorative header zone ── */}
      <div className={`relative rounded-t-2xl ${isActive ? "bg-gradient-to-br from-primary-500/[0.08] via-primary-400/[0.04] to-transparent" : "bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent"}`}>
        {/* Geometric pattern */}
        <div className="absolute inset-0 overflow-hidden rounded-t-2xl">
          <div className="absolute inset-0 bg-dot-pattern opacity-[0.03]" />
          {/* Glow orb */}
          {isActive ? (
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary-500/10 blur-3xl" />
          ) : null}
        </div>

        {/* Top row: status pill + actions */}
        <div className="relative flex items-start justify-between px-5 pt-4 pb-4">
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase ${isActive ? "bg-emerald-500/15 text-emerald-300 shadow-sm shadow-emerald-500/10" : "bg-white/[0.05] text-gray-500"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-400 shadow-sm shadow-emerald-400/50" : "bg-gray-600"}`} />
              {isActive ? "启用" : "停用"}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${group.show === 1 ? "bg-sky-500/10 text-sky-400" : "bg-white/[0.04] text-gray-500"}`}>
              <Icon icon={group.show === 1 ? eyeIcon : eyeOff} className="h-3 w-3" />
              {group.show === 1 ? "展示" : "隐藏"}
            </span>
          </div>
          {/* Actions menu trigger */}
          <div ref={actionsRef} className="relative">
            <button
              type="button"
              onClick={() => setActionsOpen((p) => !p)}
              className="flex h-7 w-7 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-white/10 hover:text-gray-300 cursor-pointer"
              aria-label="操作菜单"
            >
              <Icon icon={moreHorizontal} className="h-4 w-4" />
            </button>
            {actionsOpen ? (
              <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden glass-panel glass-panel-strong rounded-xl shadow-xl shadow-black/40">
                <button type="button" onClick={() => { setActionsOpen(false); onEdit(); }} disabled={isBusy} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-300 transition-colors hover:bg-white/5 disabled:opacity-40 cursor-pointer">
                  <Icon icon={editIcon} className="h-3.5 w-3.5 text-gray-500" />
                  编辑分组
                </button>
                <button type="button" onClick={() => { setActionsOpen(false); onToggleDefault(); }} disabled={isBusy || !isActive} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-300 transition-colors hover:bg-white/5 disabled:opacity-40 cursor-pointer">
                  <Icon icon={group.isDefault ? starOff : starIcon} className="h-3.5 w-3.5 text-amber-500/70" />
                  {group.isDefault ? "取消默认" : "设为默认"}
                </button>
                <button type="button" onClick={() => { setActionsOpen(false); onToggleStatus(); }} disabled={isBusy} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-gray-300 transition-colors hover:bg-white/5 disabled:opacity-40 cursor-pointer">
                  <Icon icon={isActive ? powerOff : power} className="h-3.5 w-3.5 text-gray-500" />
                  {isActive ? "停用" : "启用"}
                </button>
                <div className="mx-2 border-t border-white/[0.06]" />
                <button type="button" onClick={() => { setActionsOpen(false); onDelete(); }} disabled={isBusy} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-rose-300 transition-colors hover:bg-rose-500/10 disabled:opacity-40 cursor-pointer">
                  <Icon icon={trash2} className="h-3.5 w-3.5" />
                  删除分组
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Card body ── */}
      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        {/* Icon + Title row */}
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl ${logoSrc ? "bg-transparent shadow-none" : isActive ? "chip-gradient" : "bg-gradient-to-br from-gray-600 to-gray-700 shadow-lg shadow-gray-900/40"}`}>
            {logoSrc ? (
              <img src={logoSrc} alt={group.name} className="h-full w-full object-cover" />
            ) : group.isDefault ? (
              <Icon icon={shieldIcon} className="h-5 w-5 text-white" />
            ) : (
              <Icon icon={layers} className="h-5 w-5 text-white/90" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-semibold text-white truncate">{group.name}</h2>
              {group.isDefault ? (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  <Icon icon={starIcon} className="h-2.5 w-2.5" />
                  默认
                </span>
              ) : null}
            </div>
            {group.description?.trim() ? (
              <p className="mt-0.5 text-[13px] leading-snug text-gray-500 line-clamp-1">{group.description}</p>
            ) : (
              <p className="mt-0.5 text-[13px] italic text-gray-700">暂无描述</p>
            )}
          </div>
        </div>

        {/* Tags */}
        {tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded-md bg-primary-500/[0.07] px-2 py-0.5 text-[11px] font-medium text-primary-300/70"
              >
                #{t}
              </span>
            ))}
          </div>
        ) : null}

        {/* ── Stats strip ── */}
        <div className="mt-auto pt-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.06] px-4 py-3">
            {/* Member count */}
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${isActive ? "chip-gradient-soft" : "bg-white/[0.04]"}`}>
                <Icon icon={usersIcon} className={`h-4 w-4 ${isActive ? "text-primary-200" : "text-gray-600"}`} />
              </div>
              <div>
                <div className="text-sm font-bold text-white leading-none">{group.memberCount}</div>
                <div className="text-[10px] text-gray-600 mt-0.5">成员</div>
              </div>
            </div>

            {/* Divider */}
            <div className="h-8 w-px bg-white/[0.06]" />

            {/* Leaders */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-[10px] text-gray-600 mb-0.5">
                <Icon icon={crown} className="h-3 w-3 text-amber-500/50" />
                组长
              </div>
              {leaders.length > 0 ? (
                <div className="flex items-center gap-1">
                  {leaders.slice(0, 2).map((name) => (
                    <span key={name} className="inline-flex items-center gap-1 max-w-24 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[11px] font-medium text-gray-300">
                      <Icon icon={userCheck} className="h-3 w-3 shrink-0 text-amber-500/60" />
                      <span className="truncate">{name}</span>
                    </span>
                  ))}
                  {leaders.length > 2 ? (
                    <span className="text-[11px] text-gray-600">+{leaders.length - 2}</span>
                  ) : null}
                </div>
              ) : (
                <span className="text-[11px] text-gray-700">未指定</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer: view members + timestamp ── */}
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onMembers}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-primary-400 transition-all hover:bg-primary-500/10 cursor-pointer"
          >
            管理成员
            <Icon icon={arrowRight} className="h-3.5 w-3.5 transition-transform group-hover/card:translate-x-0.5" />
          </button>
          <div className="flex items-center gap-1 text-[11px] text-gray-600">
            <Icon icon={clock} className="h-3 w-3" />
            {formatDateTime(group.updatedAt)}
          </div>
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
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline gap-2 text-sm font-medium text-gray-200">
      {label}
      {hint ? <span className="text-xs font-normal text-gray-500">{hint}</span> : null}
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
      className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 transition-all focus-within:border-primary-400/60 focus-within:ring-1 focus-within:ring-primary-400/30 cursor-text min-h-[42px]"
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag, i) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md border border-primary-400/20 bg-primary-500/10 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-primary-200 transition-colors hover:bg-primary-500/15"
        >
          #{tag}
          <button
            type="button"
            aria-label={`移除标签 ${tag}`}
            onClick={(e) => { e.stopPropagation(); removeTag(i); }}
            className="flex h-4 w-4 items-center justify-center rounded text-primary-300/60 transition-colors hover:bg-primary-500/20 hover:text-primary-200 cursor-pointer"
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
        className="min-w-[80px] flex-1 border-none bg-transparent py-0.5 text-sm text-white placeholder:text-gray-600 outline-none"
        placeholder={tags.length === 0 ? "输入标签，按回车添加" : "继续添加..."}
      />
    </div>
  );
}

function inputClassName(disabled = false) {
  return `w-full rounded-xl border border-white/[0.08] bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-gray-600 backdrop-blur transition-all focus:border-primary-400/60 focus:ring-1 focus:ring-primary-400/30 focus:outline-none ${disabled ? "cursor-not-allowed opacity-60" : ""}`;
}


function DrawerStatBlock({ label, value, small }: { label: string; value: ReactNode; small?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 font-medium text-white ${small ? "text-xs" : "text-sm"}`}>{value}</div>
    </div>
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
    ? "border border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
    : "border border-gray-400/20 bg-gray-500/10 text-gray-300";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === 1 ? "bg-emerald-400" : "bg-gray-500"}`} />
      {status === 1 ? "启用" : "停用"}
    </span>
  );
}
