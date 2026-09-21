import calendarDays from "@iconify-icons/lucide/calendar-days";
import clock from "@iconify-icons/lucide/clock";
import eye from "@iconify-icons/lucide/eye";
import github from "@iconify-icons/lucide/github";
import info from "@iconify-icons/lucide/info";
import keyRound from "@iconify-icons/lucide/key-round";
import mail from "@iconify-icons/lucide/mail";
import phone from "@iconify-icons/lucide/phone";
import power from "@iconify-icons/lucide/power";
import powerOff from "@iconify-icons/lucide/power-off";
import searchIcon from "@iconify-icons/lucide/search";
import shieldCheck from "@iconify-icons/lucide/shield-check";
import userIcon from "@iconify-icons/lucide/user";
import userPlus from "@iconify-icons/lucide/user-plus";
import usersIcon from "@iconify-icons/lucide/users";
import x from "@iconify-icons/lucide/x";
import { Icon, type IconifyIcon } from "@iconify/react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useOutletContext } from "react-router";
import { AnimatedSelect } from "~/components/animated-select";
import { ModalShell } from "~/components/modal-shell";
import { Notify } from "~/components/notify";
import {
  type AdminUserGroupListItem,
  listAdminUserGroups,
} from "~/lib/admin-user-groups-client";
import {
  createAdminUser,
  getAdminUser,
  listAdminRoles,
  listAdminUsers,
  resetAdminUserPassword,
  updateAdminUser,
  type AdminUserListResponse,
  type AdminUserDetail,
  type AdminUserGroupRef,
  type AdminUserListItem,
  type AdminUserRoleOption,
  type ListAdminUsersInput,
} from "~/lib/admin-users-client";
import { ApiError } from "~/lib/api-client";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";

export function meta() {
  return [
    { title: "用户数据 | TARS-GO 管理后台" },
    { name: "description", content: "TARS-GO 账号与用户数据管理" },
  ];
}

type FlashState =
  | { type: "success"; message: string }
  | { type: "error"; message: string }
  | null;

type UserFormState = {
  roleId: string;
  name: string;
  email: string;
  nickname: string;
  avatarUrl: string;
  phone: string;
  realName: string;
  gender: string;
  birthday: string;
  status: string;
};

type CreateUserFormState = UserFormState & {
  password: string;
};

const defaultQuery: ListAdminUsersInput = {
  page: 1,
  pageSize: 10,
  keyword: "",
  role: "",
  groupId: "",
};

const defaultUserFormState: UserFormState = {
  roleId: "",
  name: "",
  email: "",
  nickname: "",
  avatarUrl: "",
  phone: "",
  realName: "",
  gender: "0",
  birthday: "",
  status: "1",
};

const genderOptions = [
  { value: "0", label: "未设置" },
  { value: "1", label: "男" },
  { value: "2", label: "女" },
];

const statusOptions = [
  { value: "", label: "全部状态" },
  { value: "1", label: "启用" },
  { value: "0", label: "停用" },
];

const DRAWER_ANIMATION_MS = 220;
const FLASH_DURATION_MS = 3000;
const NOTIFY_ANIMATION_MS = 300;
const TABLE_ACTION_LOADING_MS = 500;
const tableActionButtonClassName =
  "inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.08] text-fg-muted hover:text-fg-primary hover:bg-white/[0.06] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50";

function buildCreateFormState(defaultRoleId: string): CreateUserFormState {
  return {
    ...defaultUserFormState,
    roleId: defaultRoleId,
    password: "",
  };
}

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

function getStatusMeta(status: number) {
  if (status === 1) {
    return {
      label: "启用",
      dotColor: "bg-emerald-400",
      className: "text-emerald-300 bg-emerald-500/10 border border-emerald-400/20",
    };
  }

  return {
    label: "停用",
    dotColor: "bg-gray-400",
    className: "text-gray-300 bg-gray-500/10 border border-gray-400/20",
  };
}

function getRoleMeta(roleName: string) {
  if (roleName === "super_admin") {
    return "text-accent-gold bg-accent-gold/10 border border-accent-gold/20";
  }
  if (roleName === "admin") {
    return "text-violet-200 bg-violet-500/10 border border-violet-500/20";
  }
  return "text-cyan-200 bg-cyan-500/10 border border-cyan-500/20";
}

function getAuthMethodLabel(user: Pick<AdminUserListItem, "authMethods"> | Pick<AdminUserDetail, "authMethods">) {
  const methods: string[] = [];
  if (user.authMethods.hasPassword) {
    methods.push("邮箱密码");
  }
  if (user.authMethods.githubBound) {
    methods.push("GitHub");
  }
  return methods.length > 0 ? methods.join(" / ") : "未设置";
}

function getReadonlyReason(roleName: string, actorRoleName: string) {
  if (roleName === "super_admin") {
    return "超级管理员账号只允许查看，不允许修改。";
  }
  if (actorRoleName === "admin" && roleName !== "user") {
    return "普通管理员只能编辑普通用户账号。";
  }
  return "";
}

function getGroupMemberRoleLabel(role: number) {
  return role === 1 ? "组长" : "成员";
}

function getGroupBadgeClass(status?: number) {
  if (status === 0) {
    return "border border-gray-400/20 bg-gray-500/10 text-gray-300";
  }
  return "border border-accent-primary/20 bg-accent-primary/10 text-accent-primary";
}

function toUserFormState(detail: AdminUserDetail): UserFormState {
  return {
    roleId: String(detail.role.id),
    name: detail.name,
    email: detail.email,
    nickname: detail.nickname ?? "",
    avatarUrl: detail.avatarUrl ?? "",
    phone: detail.phone ?? "",
    realName: detail.realName ?? "",
    gender: String(detail.gender),
    birthday: detail.birthday ?? "",
    status: String(detail.status),
  };
}

function buildUpdatePayload(form: UserFormState) {
  return {
    roleId: Number(form.roleId),
    name: form.name.trim(),
    email: form.email.trim(),
    nickname: form.nickname.trim(),
    avatarUrl: form.avatarUrl.trim(),
    phone: form.phone.trim(),
    realName: form.realName.trim(),
    gender: Number(form.gender),
    birthday: form.birthday.trim(),
    status: Number(form.status),
  };
}

function buildCreatePayload(form: CreateUserFormState) {
  return {
    ...buildUpdatePayload(form),
    password: form.password,
  };
}

export default function Users() {
  const navigate = useNavigate();
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();

  const actorRoleName = currentUser.role.name;
  const noAdminPermission = actorRoleName === "user";

  const [query, setQuery] = useState<ListAdminUsersInput>(defaultQuery);
  const [filters, setFilters] = useState<ListAdminUsersInput>(defaultQuery);
  const [roles, setRoles] = useState<AdminUserRoleOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<AdminUserGroupListItem[]>([]);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    enabled: 0,
    disabled: 0,
    admins: 0,
    githubBound: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });
  const [loadingList, setLoadingList] = useState(false);
  const [tableActionLoading, setTableActionLoading] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);
  const [flashVisible, setFlashVisible] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editForm, setEditForm] = useState<UserFormState>(defaultUserFormState);
  const [savingEdit, setSavingEdit] = useState(false);
  const drawerOverlayRef = useRef<HTMLDivElement | null>(null);
  const drawerPanelRef = useRef<HTMLElement | null>(null);
  const drawerCloseTimerRef = useRef<number | null>(null);
  const tableActionLoadingTimerRef = useRef<number | null>(null);
  const tableActionLoadingDeadlineRef = useRef<number | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserFormState>(buildCreateFormState(""));
  const [creating, setCreating] = useState(false);

  const [passwordModalTarget, setPasswordModalTarget] = useState<AdminUserListItem | AdminUserDetail | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);

  const [statusModalTarget, setStatusModalTarget] = useState<AdminUserListItem | AdminUserDetail | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const editableRoleOptions = useMemo(
    () => roles.filter((item) => item.editableByCurrentActor),
    [roles],
  );
  const defaultCreateRoleId = editableRoleOptions[0] ? String(editableRoleOptions[0].id) : "";
  const selectedRoleOptions = useMemo(() => {
    if (!selectedUser) {
      return editableRoleOptions;
    }

    if (editableRoleOptions.some((item) => item.id === selectedUser.role.id)) {
      return editableRoleOptions;
    }

    return [
      ...editableRoleOptions,
      {
        ...selectedUser.role,
        editableByCurrentActor: false,
      },
    ];
  }, [editableRoleOptions, selectedUser]);

  const selectedReadonlyReason = useMemo(() => {
    if (!selectedUser) {
      return "";
    }
    return getReadonlyReason(selectedUser.role.name, actorRoleName);
  }, [actorRoleName, selectedUser]);
  const selectedCanMutate = selectedReadonlyReason === "";

  useEffect(() => {
    if (noAdminPermission) {
      return;
    }

    let cancelled = false;

    async function loadOptions() {
      try {
        setRolesLoading(true);
        const [roleResponse, groupResponse] = await Promise.all([
          listAdminRoles(),
          listAdminUserGroups({}),
        ]);
        if (!cancelled) {
          const defaultEditableRole = roleResponse.find((item) => item.editableByCurrentActor);
          setRoles(roleResponse);
          setGroupOptions(groupResponse.items);
          setCreateForm((previous) => ({
            ...previous,
            roleId: previous.roleId || (defaultEditableRole ? String(defaultEditableRole.id) : ""),
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setFlash({ type: "error", message: getErrorMessage(error) });
        }
      } finally {
        if (!cancelled) {
          setRolesLoading(false);
        }
      }
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, [noAdminPermission]);

  useEffect(() => {
    if (noAdminPermission) {
      return;
    }

    let cancelled = false;

    async function loadUsers() {
      try {
        setLoadingList(true);
        const response = await listAdminUsers(query);
        if (!cancelled) {
          applyUserListResponse(response);
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
          settleTableActionLoading();
          setLoadingList(false);
        }
      }
    }

    void loadUsers();

    return () => {
      cancelled = true;
    };
  }, [navigate, noAdminPermission, query]);

  useEffect(() => {
    if (!drawerOpen || drawerClosing || selectedUserId === null) {
      return;
    }

    const userId = selectedUserId;
    let cancelled = false;

    async function loadUserDetail() {
      try {
        setDetailLoading(true);
        const detail = await getAdminUser(userId);
        if (!cancelled) {
          setSelectedUser(detail);
          setEditForm(toUserFormState(detail));
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

    void loadUserDetail();

    return () => {
      cancelled = true;
    };
  }, [drawerClosing, drawerOpen, navigate, selectedUserId]);

  useEffect(() => {
    return () => {
      if (drawerCloseTimerRef.current !== null) {
        window.clearTimeout(drawerCloseTimerRef.current);
      }
      clearTableActionLoadingTimer();
    };
  }, []);

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
  }, [drawerClosing, drawerOpen, selectedUserId]);

  useEffect(() => {
    if (!flash) {
      return;
    }

    setFlashVisible(true);
  }, [flash]);

  useEffect(() => {
    if (!flash || !flashVisible) {
      return;
    }

    const timer = window.setTimeout(() => {
      setFlashVisible(false);
    }, FLASH_DURATION_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [flash, flashVisible]);

  useEffect(() => {
    if (!flash || flashVisible) {
      return;
    }

    const timer = window.setTimeout(() => {
      setFlash(null);
    }, NOTIFY_ANIMATION_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [flash, flashVisible]);

  function applyUserListResponse(response: AdminUserListResponse) {
    setUsers(response.items);
    setSummary(response.summary);
    setPagination(response.pagination);
  }

  async function refreshList() {
    const response = await listAdminUsers(query);
    applyUserListResponse(response);
  }

  function clearTableActionLoadingTimer() {
    if (tableActionLoadingTimerRef.current !== null) {
      window.clearTimeout(tableActionLoadingTimerRef.current);
      tableActionLoadingTimerRef.current = null;
    }
  }

  function finishTableActionLoading() {
    clearTableActionLoadingTimer();
    tableActionLoadingDeadlineRef.current = null;
    setTableActionLoading(false);
  }

  function settleTableActionLoading() {
    if (tableActionLoadingDeadlineRef.current === null) {
      return;
    }

    const remaining = tableActionLoadingDeadlineRef.current - Date.now();
    if (remaining <= 0) {
      finishTableActionLoading();
      return;
    }

    clearTableActionLoadingTimer();
    tableActionLoadingTimerRef.current = window.setTimeout(() => {
      finishTableActionLoading();
    }, remaining);
  }

  function startTableActionLoading() {
    clearTableActionLoadingTimer();
    tableActionLoadingDeadlineRef.current = Date.now() + TABLE_ACTION_LOADING_MS;
    setTableActionLoading(true);
  }

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
    setSelectedUserId(null);
    setSelectedUser(null);
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

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFlash(true);
    startTableActionLoading();
    setQuery({
      ...filters,
      page: 1,
      pageSize: query.pageSize ?? 10,
    });
  }

  function handleResetFilters() {
    clearFlash(true);
    startTableActionLoading();
    const resetQuery = { ...defaultQuery };
    setFilters(resetQuery);
    setQuery(resetQuery);
  }

  function clearFlash(immediate = false) {
    if (immediate) {
      setFlashVisible(false);
      setFlash(null);
      return;
    }

    setFlashVisible(false);
  }

  function openCreateModal() {
    setCreateForm(buildCreateFormState(defaultCreateRoleId));
    setCreateModalOpen(true);
  }

  function openDetail(userId: number) {
    clearDrawerCloseTimer();
    setDrawerClosing(false);
    setDrawerOpen(true);
    setSelectedUserId(userId);
    setSelectedUser(null);
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFlash(true);

    try {
      setCreating(true);
      const created = await createAdminUser(buildCreatePayload(createForm));
      setCreateModalOpen(false);
      setFlash({ type: "success", message: `已创建账号：${created.email}` });
      await refreshList();
    } catch (error) {
      if (shouldRedirectToLogin(error)) {
        navigate("/login", { replace: true });
        return;
      }
      setFlash({ type: "error", message: getErrorMessage(error) });
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }

    try {
      setSavingEdit(true);
      const updated = await updateAdminUser(selectedUser.id, buildUpdatePayload(editForm));
      setSelectedUser(updated);
      setEditForm(toUserFormState(updated));
      setFlash({ type: "success", message: `已更新账号：${updated.email}` });
      await refreshList();
      closeDrawer();
    } catch (error) {
      if (shouldRedirectToLogin(error)) {
        navigate("/login", { replace: true });
        return;
      }
      setFlash({ type: "error", message: getErrorMessage(error) });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordModalTarget) {
      return;
    }

    try {
      setResettingPassword(true);
      await resetAdminUserPassword(passwordModalTarget.id, passwordValue);
      setPasswordModalTarget(null);
      setPasswordValue("");
      setFlash({ type: "success", message: `已重置 ${passwordModalTarget.email} 的密码` });
    } catch (error) {
      if (shouldRedirectToLogin(error)) {
        navigate("/login", { replace: true });
        return;
      }
      setFlash({ type: "error", message: getErrorMessage(error) });
    } finally {
      setResettingPassword(false);
    }
  }

  async function handleToggleStatus() {
    if (!statusModalTarget) {
      return;
    }

    try {
      setTogglingStatus(true);
      const detail = "nickname" in statusModalTarget && "realName" in statusModalTarget
        ? statusModalTarget
        : await getAdminUser(statusModalTarget.id);
      const nextStatus = detail.status === 1 ? 0 : 1;

      const updated = await updateAdminUser(detail.id, {
        ...buildUpdatePayload(toUserFormState(detail)),
        status: nextStatus,
      });

      if (selectedUser?.id === updated.id) {
        setSelectedUser(updated);
        setEditForm(toUserFormState(updated));
      }

      setStatusModalTarget(null);
      setFlash({
        type: "success",
        message: nextStatus === 1 ? `已启用 ${updated.email}` : `已停用 ${updated.email}`,
      });
      await refreshList();
    } catch (error) {
      if (shouldRedirectToLogin(error)) {
        navigate("/login", { replace: true });
        return;
      }
      setFlash({ type: "error", message: getErrorMessage(error) });
    } finally {
      setTogglingStatus(false);
    }
  }

  if (noAdminPermission) {
    return (
      <div className="rounded-2xl border border-accent-gold/20 bg-accent-gold/5 p-6">
        <h1 className="text-xl font-semibold text-fg-primary">用户数据</h1>
        <p className="mt-2 text-sm leading-6 text-amber-100/80">
          当前账号没有管理员权限，无法访问用户管理接口。请使用管理员账号登录后再进入该页面。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="motion-fade-up flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg-primary">用户数据</h1>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          disabled={rolesLoading || editableRoleOptions.length === 0}
          className="btn-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Icon icon={userPlus} className="h-4 w-4" />
          新建账号
        </button>
      </div>

      {flash ? (
        <Notify
          tone={flash.type}
          title={flash.type === "success" ? "操作成功" : "操作失败"}
          message={flash.message}
          open={flashVisible}
          onClose={() => clearFlash()}
          placement="bottom-right"
        />
      ) : null}

      <div className="motion-fade-up grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" style={{ animationDelay: "80ms" }}>
        <StatCard label="账号总数" value={summary.total} icon={usersIcon} iconBg="bg-accent-primary/10" iconText="text-accent-primary" barFrom="from-accent-primary/60" />
        <StatCard label="启用账号" value={summary.enabled} icon={power} iconBg="bg-accent-tertiary/10" iconText="text-accent-tertiary" barFrom="from-accent-tertiary/60" />
        <StatCard label="管理员账号" value={summary.admins} icon={shieldCheck} iconBg="bg-accent-gold/10" iconText="text-accent-gold" barFrom="from-accent-gold/60" />
        <StatCard label="GitHub 绑定" value={summary.githubBound} icon={github} iconBg="bg-accent-secondary/10" iconText="text-accent-secondary" barFrom="from-accent-secondary/60" />
      </div>

      <form
        onSubmit={handleSearchSubmit}
        className="motion-fade-up glass-panel rounded-2xl p-5"
        style={{ animationDelay: "140ms" }}
      >
        <div className="mb-4 flex items-center gap-2 border-b border-white/[0.06] pb-4">
          <Icon icon={searchIcon} className="h-4 w-4 text-fg-dim" />
          <span className="text-xs font-medium uppercase tracking-wider text-fg-dim">筛选条件</span>
        </div>
        <div className="grid gap-4 xl:grid-cols-[2fr_1fr_1fr_auto]">
          <div>
            <FieldLabel label="关键词" />
            <input
              type="text"
              value={filters.keyword ?? ""}
              onChange={(event) => setFilters((previous) => ({ ...previous, keyword: event.target.value }))}
              placeholder="搜索姓名、邮箱、手机号、真实姓名或昵称"
              className={InputClassName()}
            />
          </div>
          <div>
            <FieldLabel label="角色" />
            <AnimatedSelect
              value={filters.role ?? ""}
              onChange={(value) => setFilters((previous) => ({ ...previous, role: value }))}
              options={[
                { value: "", label: "全部角色" },
                ...roles.map((role) => ({
                  value: role.name,
                  label: role.displayName,
                })),
              ]}
            />
          </div>
          <div>
            <FieldLabel label="组别" />
            <AnimatedSelect
              value={String(filters.groupId ?? "")}
              onChange={(value) =>
                setFilters((previous) => ({
                  ...previous,
                  groupId: value === "" ? "" : Number(value),
                }))
              }
              options={[
                { value: "", label: "全部组别" },
                ...groupOptions.map((group) => ({
                  value: group.id,
                  label: `${group.name}${group.status === 0 ? "（停用）" : ""}`,
                })),
              ]}
            />
          </div>
          <div className="flex items-end gap-3">
            <button
              type="submit"
              className="btn-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white"
            >
              <Icon icon={searchIcon} className="h-3.5 w-3.5" />
              搜索
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="btn-glass rounded-xl px-4 py-2.5 text-sm text-fg-muted"
            >
              重置
            </button>
          </div>
        </div>
      </form>

      <div
        className="motion-fade-up glass-panel overflow-hidden rounded-2xl shadow-xl shadow-black/20"
        style={{ animationDelay: "200ms" }}
      >
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-xs tracking-wider text-fg-dim">
              <tr className="border-b border-white/[0.06]">
                <th className="px-5 py-4 font-medium">账号</th>
                <th className="px-5 py-4 font-medium">真实姓名</th>
                <th className="px-5 py-4 font-medium">角色</th>
                <th className="px-5 py-4 font-medium">组别</th>
                <th className="px-5 py-4 font-medium">状态</th>
                <th className="px-5 py-4 font-medium">登录方式</th>
                <th className="px-5 py-4 font-medium">最近登录</th>
                <th className="px-5 py-4 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {tableActionLoading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-14 text-center">
                    <div className="flex flex-col items-center gap-3 text-sm text-fg-dim">
                      <span
                        aria-hidden="true"
                        className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-accent-primary/20 border-t-accent-primary"
                      />
                      <span>正在刷新用户列表...</span>
                    </div>
                  </td>
                </tr>
              ) : loadingList ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-fg-dim">
                    正在加载用户列表...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-fg-dim">
                    当前筛选条件下没有匹配的账号。
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const readonlyReason = getReadonlyReason(user.role.name, actorRoleName);
                  const canMutate = readonlyReason === "";
                  const statusActionLabel = user.status === 1 ? "停用账号" : "启用账号";

                  return (
                    <tr key={user.id} className="table-row-glass transition-colors duration-150">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="chip-gradient-soft flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-primary-200">
                            {(user.name || user.email).slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-fg-primary">{user.name}</div>
                            <div className="text-xs text-fg-dim">{user.email}</div>
                            {user.phone ? <div className="text-xs text-fg-dim">{user.phone}</div> : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-fg-muted">
                        {user.realName?.trim() || "未填写"}
                      </td>
                      <td className="px-5 py-4">
                        <RoleBadge roleName={user.role.name} displayName={user.role.displayName} />
                      </td>
                      <td className="px-5 py-4">
                        <GroupTags groups={user.groups} />
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={user.status} />
                      </td>
                      <td className="px-5 py-4 text-fg-muted">{getAuthMethodLabel(user)}</td>
                      <td className="px-5 py-4 text-fg-muted">{formatDateTime(user.lastLoginAt)}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openDetail(user.id)}
                            title="查看详情"
                            aria-label="查看详情"
                            className={tableActionButtonClassName}
                          >
                            <Icon icon={eye} className="h-3.5 w-3.5" />
                            <span className="sr-only">查看详情</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setPasswordModalTarget(user)}
                            disabled={!canMutate}
                            title={readonlyReason || "重置密码"}
                            aria-label="重置密码"
                            className={tableActionButtonClassName}
                          >
                            <Icon icon={keyRound} className="h-3.5 w-3.5" />
                            <span className="sr-only">重置密码</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setStatusModalTarget(user)}
                            disabled={!canMutate}
                            title={readonlyReason || statusActionLabel}
                            aria-label={statusActionLabel}
                            className={`${tableActionButtonClassName} ${
                              user.status === 1
                                ? "border-rose-500/30 text-rose-300 hover:bg-rose-500/20"
                                : "border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10"
                            }`}
                          >
                            <Icon icon={user.status === 1 ? powerOff : power} className="h-3.5 w-3.5" />
                            <span className="sr-only">{statusActionLabel}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="md:hidden">
          {tableActionLoading ? (
            <div className="flex flex-col items-center gap-3 px-5 py-14 text-sm text-fg-dim">
              <span
                aria-hidden="true"
                className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-accent-primary/20 border-t-accent-primary"
              />
              <span>正在刷新用户列表...</span>
            </div>
          ) : loadingList ? (
            <div className="px-5 py-10 text-center text-sm text-fg-dim">正在加载用户列表...</div>
          ) : users.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-fg-dim">
              当前筛选条件下没有匹配的账号。
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {users.map((user) => {
                const readonlyReason = getReadonlyReason(user.role.name, actorRoleName);
                const canMutate = readonlyReason === "";
                const statusActionLabel = user.status === 1 ? "停用账号" : "启用账号";

                return (
                  <li key={user.id} className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <div className="chip-gradient-soft flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-primary-200">
                        {(user.name || user.email).slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-fg-primary">{user.name}</div>
                        <div className="truncate text-xs text-fg-dim">{user.email}</div>
                        {user.phone ? (
                          <div className="truncate text-xs text-fg-dim">{user.phone}</div>
                        ) : null}
                      </div>
                      <div className="shrink-0">
                        <StatusBadge status={user.status} />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <RoleBadge roleName={user.role.name} displayName={user.role.displayName} />
                      <GroupTags groups={user.groups} />
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div className="min-w-0">
                        <dt className="text-fg-dim">真实姓名</dt>
                        <dd className="mt-0.5 truncate text-fg-muted">
                          {user.realName?.trim() || "未填写"}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-fg-dim">登录方式</dt>
                        <dd className="mt-0.5 truncate text-fg-muted">{getAuthMethodLabel(user)}</dd>
                      </div>
                      <div className="col-span-2 min-w-0">
                        <dt className="text-fg-dim">最近登录</dt>
                        <dd className="mt-0.5 truncate text-fg-muted">
                          {formatDateTime(user.lastLoginAt)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-3 flex justify-end gap-2 border-t border-white/[0.06] pt-3">
                      <button
                        type="button"
                        onClick={() => openDetail(user.id)}
                        title="查看详情"
                        aria-label="查看详情"
                        className={tableActionButtonClassName}
                      >
                        <Icon icon={eye} className="h-3.5 w-3.5" />
                        <span className="sr-only">查看详情</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPasswordModalTarget(user)}
                        disabled={!canMutate}
                        title={readonlyReason || "重置密码"}
                        aria-label="重置密码"
                        className={tableActionButtonClassName}
                      >
                        <Icon icon={keyRound} className="h-3.5 w-3.5" />
                        <span className="sr-only">重置密码</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusModalTarget(user)}
                        disabled={!canMutate}
                        title={readonlyReason || statusActionLabel}
                        aria-label={statusActionLabel}
                        className={`${tableActionButtonClassName} ${
                          user.status === 1
                            ? "border-rose-500/30 text-rose-300 hover:bg-rose-500/20"
                            : "border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10"
                        }`}
                      >
                        <Icon icon={user.status === 1 ? powerOff : power} className="h-3.5 w-3.5" />
                        <span className="sr-only">{statusActionLabel}</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-white/[0.06] bg-white/[0.03] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-fg-dim">
            第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页，共 {pagination.total} 条记录
          </div>
          <div className="flex items-center gap-3">
            <AnimatedSelect
              ariaLabel="每页条数"
              value={pagination.pageSize}
              onChange={(value) =>
                setQuery((previous) => ({
                  ...previous,
                  page: 1,
                  pageSize: Number(value),
                }))
              }
              options={[10, 20, 50].map((value) => ({
                value,
                label: `${value} / 页`,
              }))}
              size="compact"
              fitContent
            />
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setQuery((previous) => ({ ...previous, page: Math.max((previous.page ?? 1) - 1, 1) }))}
              className="btn-glass rounded-xl px-3 py-2 text-sm font-medium text-fg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              上一页
            </button>
            <span className="nav-item-active rounded-xl px-2.5 py-1 text-xs font-medium text-white">
              {pagination.page}
            </span>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages || pagination.totalPages === 0}
              onClick={() =>
                setQuery((previous) => ({
                  ...previous,
                  page: Math.min((previous.page ?? 1) + 1, Math.max(pagination.totalPages, 1)),
                }))
              }
              className="btn-glass rounded-xl px-3 py-2 text-sm font-medium text-fg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      <ModalShell
        open={createModalOpen}
        title="新建账号"
        description="后台直接创建邮箱密码账号，默认创建后立即可登录。GitHub 绑定仅支持用户自行登录后生成。"
        onClose={() => setCreateModalOpen(false)}
      >
            <form onSubmit={handleCreateUser} className="space-y-5">
              <div>
                <div className="mb-3 text-xs font-medium uppercase tracking-wider text-fg-dim">必填信息</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <FieldLabel label="角色" />
                    <AnimatedSelect
                      value={createForm.roleId}
                      onChange={(value) => setCreateForm((previous) => ({ ...previous, roleId: value }))}
                      options={editableRoleOptions.map((role) => ({
                        value: role.id,
                        label: role.displayName,
                      }))}
                      placeholder="请选择角色"
                    />
                  </div>
                  <div>
                    <FieldLabel label="姓名" />
                    <input
                      type="text"
                      value={createForm.name}
                      onChange={(event) => setCreateForm((previous) => ({ ...previous, name: event.target.value }))}
                      className={InputClassName()}
                      placeholder="请输入姓名"
                      required
                    />
                  </div>
                  <div>
                    <FieldLabel label="邮箱" />
                    <input
                      type="email"
                      value={createForm.email}
                      onChange={(event) => setCreateForm((previous) => ({ ...previous, email: event.target.value }))}
                      className={InputClassName()}
                      placeholder="name@example.com"
                      required
                    />
                  </div>
                  <div>
                    <FieldLabel label="初始密码" />
                    <input
                      type="password"
                      value={createForm.password}
                      onChange={(event) => setCreateForm((previous) => ({ ...previous, password: event.target.value }))}
                      className={InputClassName()}
                      placeholder="至少 6 位"
                      minLength={6}
                      maxLength={72}
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-3 text-xs font-medium uppercase tracking-wider text-fg-dim">可选信息</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <FieldLabel label="昵称" />
                    <input
                      type="text"
                      value={createForm.nickname}
                      onChange={(event) => setCreateForm((previous) => ({ ...previous, nickname: event.target.value }))}
                      className={InputClassName()}
                      placeholder="可选"
                    />
                  </div>
                  <div>
                    <FieldLabel label="手机号" />
                    <input
                      type="text"
                      value={createForm.phone}
                      onChange={(event) => setCreateForm((previous) => ({ ...previous, phone: event.target.value }))}
                      className={InputClassName()}
                      placeholder="可选"
                    />
                  </div>
                  <div>
                    <FieldLabel label="真实姓名" />
                    <input
                      type="text"
                      value={createForm.realName}
                      onChange={(event) => setCreateForm((previous) => ({ ...previous, realName: event.target.value }))}
                      className={InputClassName()}
                      placeholder="可选"
                    />
                  </div>
                  <div>
                    <FieldLabel label="性别" />
                    <AnimatedSelect
                      value={createForm.gender}
                      onChange={(value) => setCreateForm((previous) => ({ ...previous, gender: value }))}
                      options={genderOptions.map((option) => ({
                        value: option.value,
                        label: option.label,
                      }))}
                    />
                  </div>
                  <div>
                    <FieldLabel label="生日" />
                    <input
                      type="date"
                      value={createForm.birthday}
                      onChange={(event) => setCreateForm((previous) => ({ ...previous, birthday: event.target.value }))}
                      className={InputClassName()}
                    />
                  </div>
                  <div>
                    <FieldLabel label="头像 URL" />
                    <input
                      type="url"
                      value={createForm.avatarUrl}
                      onChange={(event) => setCreateForm((previous) => ({ ...previous, avatarUrl: event.target.value }))}
                      className={InputClassName()}
                      placeholder="https://"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-accent-primary/10 bg-accent-primary/5 px-4 py-3 text-sm text-fg-dim">
                <Icon icon={info} className="mt-0.5 h-4 w-4 shrink-0 text-accent-primary" />
                创建后账号默认启用。若需要临时禁止登录，请创建完成后再执行"停用"操作。
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="btn-glass rounded-xl px-4 py-2.5 text-sm text-fg-muted"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating || editableRoleOptions.length === 0}
                  className="btn-gradient rounded-xl px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? "创建中..." : "确认创建"}
                </button>
              </div>
          </form>
      </ModalShell>

      <ModalShell
        open={passwordModalTarget !== null}
        title="重置密码"
        description={
          passwordModalTarget
            ? `直接为 ${passwordModalTarget.email} 设置新的本地密码。旧密码会立即失效。`
            : undefined
        }
        onClose={() => {
          setPasswordModalTarget(null);
          setPasswordValue("");
        }}
        widthClass="max-w-lg"
      >
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div>
                <FieldLabel label="新密码" />
                <input
                  type="password"
                  value={passwordValue}
                  onChange={(event) => setPasswordValue(event.target.value)}
                  className={InputClassName()}
                  placeholder="请输入新的密码"
                  minLength={6}
                  maxLength={72}
                  required
                />
                <p className="mt-2 text-xs text-fg-dim">
                  若目标账号当前仅绑定 GitHub，本操作会同时补设本地密码登录能力。
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPasswordModalTarget(null);
                    setPasswordValue("");
                  }}
                  className="btn-glass rounded-xl px-4 py-2.5 text-sm text-fg-muted"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={resettingPassword}
                  className="btn-gradient rounded-xl px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resettingPassword ? "提交中..." : "确认重置"}
                </button>
              </div>
            </form>
      </ModalShell>

      <ModalShell
        open={statusModalTarget !== null}
        title={statusModalTarget?.status === 1 ? "停用账号" : "启用账号"}
        description={
          statusModalTarget ? `目标账号：${statusModalTarget.email}` : undefined
        }
        onClose={() => setStatusModalTarget(null)}
        widthClass="max-w-lg"
      >
        {statusModalTarget ? (
          <div className="space-y-5">
            <div className={`rounded-xl border px-4 py-3 text-sm leading-6 ${
              statusModalTarget.status === 1
                ? "border-red-500/20 bg-red-500/10 text-red-100"
                : "border-accent-tertiary/20 bg-accent-tertiary/10 text-emerald-100"
            }`}>
              {statusModalTarget.status === 1
                ? "停用后将立即阻断新登录，并使当前会话在下次 /api/me 校验时失效。系统不会物理删除该账号。"
                : "启用后账号可重新使用邮箱密码、验证码或 GitHub 登录。"}
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setStatusModalTarget(null)}
                className="btn-glass rounded-xl px-4 py-2.5 text-sm text-fg-muted"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleToggleStatus()}
                disabled={togglingStatus}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  statusModalTarget.status === 1
                    ? "border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                    : "bg-accent-tertiary text-white hover:bg-accent-tertiary/90"
                }`}
              >
                {togglingStatus
                  ? "提交中..."
                  : statusModalTarget.status === 1
                    ? "确认停用"
                    : "确认启用"}
              </button>
            </div>
          </div>
        ) : null}
      </ModalShell>

      {drawerOpen ? (
        <OverlayPortal>
          <div className="fixed inset-0 z-40">
            <div
              ref={drawerOverlayRef}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => closeDrawer()}
            />
            <aside
              ref={drawerPanelRef}
              className="glass-panel glass-panel-strong absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col rounded-none shadow-2xl"
            >
            {/* Header */}
            <div className="shrink-0 border-b border-white/[0.06] bg-black/20 backdrop-blur">
              <div className="flex items-center justify-between px-6 py-4">
                <h2 className="text-lg font-semibold text-fg-primary">用户详情</h2>
                <button
                  type="button"
                  onClick={() => closeDrawer()}
                  title="关闭"
                  aria-label="关闭"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-fg-dim transition hover:bg-white/5 hover:text-fg-primary"
                >
                  <Icon icon={x} className="h-4 w-4" />
                </button>
              </div>

              {selectedUser ? (
                <div className="border-t border-white/[0.06] px-6 py-5">
                  <div className="flex items-center gap-4">
                    {selectedUser.avatarUrl ? (
                      <div className="relative shrink-0">
                        <img src={selectedUser.avatarUrl} alt="" className="h-14 w-14 rounded-2xl object-cover ring-1 ring-white/10" />
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface-primary ${selectedUser.status === 1 ? "bg-emerald-400" : "bg-gray-500"}`}
                        />
                      </div>
                    ) : (
                      <div className="chip-gradient-soft relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-primary-200">
                        {(selectedUser.name || selectedUser.email).slice(0, 1).toUpperCase()}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface-primary ${selectedUser.status === 1 ? "bg-emerald-400" : "bg-gray-500"}`}
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-base font-semibold text-fg-primary">
                          {selectedUser.name}
                        </span>
                        <RoleBadge
                          roleName={selectedUser.role.name}
                          displayName={selectedUser.role.displayName}
                        />
                        <StatusBadge status={selectedUser.status} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-fg-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <Icon icon={mail} className="h-3.5 w-3.5 text-fg-dim" />
                          {selectedUser.email}
                        </span>
                        {selectedUser.phone ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Icon icon={phone} className="h-3.5 w-3.5 text-fg-dim" />
                            {selectedUser.phone}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  </div>
                ) : null}
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              <div className="space-y-5 p-6">
                {detailLoading || !selectedUser ? (
                  <div className="flex flex-col items-center gap-3 py-20 text-sm text-fg-dim">
                    <span
                      aria-hidden="true"
                      className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-accent-primary/20 border-t-accent-primary"
                    />
                    <span>正在加载用户详情...</span>
                  </div>
                ) : (
                  <>
                    {/* Authentication & Login Info */}
                    <DrawerSection icon={shieldCheck} title="认证与登录">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-black/20 p-3.5 ring-1 ring-white/[0.03]">
                          <div className="flex items-center gap-2 text-xs text-fg-dim">
                            <Icon icon={keyRound} className="h-3.5 w-3.5" />
                            登录方式
                          </div>
                          <div className="mt-2 text-sm font-medium text-fg-primary">
                            {getAuthMethodLabel(selectedUser)}
                          </div>
                          <div className="mt-1 text-xs text-fg-dim">
                            {selectedUser.authMethods.hasPassword ? "已设置邮箱密码" : "未设置本地密码"}
                          </div>
                        </div>
                        <div className="rounded-xl bg-black/20 p-3.5 ring-1 ring-white/[0.03]">
                          <div className="flex items-center gap-2 text-xs text-fg-dim">
                            <Icon icon={github} className="h-3.5 w-3.5" />
                            GitHub 绑定
                          </div>
                          <div className="mt-2 text-sm font-medium text-fg-primary">
                            {selectedUser.authMethods.githubBound ? (
                              <span className="text-emerald-300">已绑定</span>
                            ) : (
                              <span className="text-fg-muted">未绑定</span>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-fg-dim">
                            {selectedUser.githubUsername
                              ? `@${selectedUser.githubUsername}`
                              : "仅支持用户自行绑定"}
                          </div>
                        </div>
                        <div className="rounded-xl bg-black/20 p-3.5 ring-1 ring-white/[0.03]">
                          <div className="flex items-center gap-2 text-xs text-fg-dim">
                            <Icon icon={clock} className="h-3.5 w-3.5" />
                            最近登录
                          </div>
                          <div className="mt-2 text-sm font-medium text-fg-primary">
                            {formatDateTime(selectedUser.lastLoginAt)}
                          </div>
                          <div className="mt-1 text-xs text-fg-dim">
                            创建于 {formatDateTime(selectedUser.createdAt)}
                          </div>
                        </div>
                      </div>
                    </DrawerSection>

                    {/* Groups */}
                    <DrawerSection icon={usersIcon} title="所属分组">
                      <GroupTags groups={selectedUser.groups} showRole showStatus />
                      <p className="mt-3 text-xs text-fg-dim">
                        分组成员调整统一在"用户分组"页面完成，当前页面仅展示结果。
                      </p>
                    </DrawerSection>

                    {/* Readonly warning */}
                    {selectedReadonlyReason ? (
                      <div className="flex items-start gap-3 rounded-xl border border-accent-gold/20 bg-accent-gold/5 px-4 py-3">
                        <Icon icon={shieldCheck} className="mt-0.5 h-4 w-4 shrink-0 text-accent-gold" />
                        <p className="text-sm leading-6 text-amber-100/90">
                          {selectedReadonlyReason}
                        </p>
                      </div>
                    ) : null}

                    {/* Edit form */}
                    <form onSubmit={handleUpdateUser} className="space-y-5">
                      <DrawerSection icon={userIcon} title="基本信息">
                        <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
                          <div>
                            <FieldLabel label="姓名" />
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(event) => setEditForm((previous) => ({ ...previous, name: event.target.value }))}
                              className={InputClassName(!selectedCanMutate)}
                              disabled={!selectedCanMutate}
                              required
                            />
                          </div>
                          <div>
                            <FieldLabel label="性别" />
                            <AnimatedSelect
                              value={editForm.gender}
                              onChange={(value) => setEditForm((previous) => ({ ...previous, gender: value }))}
                              disabled={!selectedCanMutate}
                              options={genderOptions.map((option) => ({
                                value: option.value,
                                label: option.label,
                              }))}
                            />
                          </div>
                          <div>
                            <FieldLabel label="邮箱" />
                            <input
                              type="email"
                              value={editForm.email}
                              onChange={(event) => setEditForm((previous) => ({ ...previous, email: event.target.value }))}
                              className={InputClassName(!selectedCanMutate)}
                              disabled={!selectedCanMutate}
                              required
                            />
                          </div>
                          <div>
                            <FieldLabel label="生日" />
                            <input
                              type="date"
                              value={editForm.birthday}
                              onChange={(event) => setEditForm((previous) => ({ ...previous, birthday: event.target.value }))}
                              className={InputClassName(!selectedCanMutate)}
                              disabled={!selectedCanMutate}
                            />
                          </div>
                          <div>
                            <FieldLabel label="昵称" />
                            <input
                              type="text"
                              value={editForm.nickname}
                              onChange={(event) => setEditForm((previous) => ({ ...previous, nickname: event.target.value }))}
                              className={InputClassName(!selectedCanMutate)}
                              disabled={!selectedCanMutate}
                            />
                          </div>
                          <div>
                            <FieldLabel label="真实姓名" />
                            <input
                              type="text"
                              value={editForm.realName}
                              onChange={(event) => setEditForm((previous) => ({ ...previous, realName: event.target.value }))}
                              className={InputClassName(!selectedCanMutate)}
                              disabled={!selectedCanMutate}
                            />
                          </div>
                          <div>
                            <FieldLabel label="手机号" />
                            <input
                              type="text"
                              value={editForm.phone}
                              onChange={(event) => setEditForm((previous) => ({ ...previous, phone: event.target.value }))}
                              className={InputClassName(!selectedCanMutate)}
                              disabled={!selectedCanMutate}
                            />
                          </div>
                          <div>
                            <FieldLabel label="头像 URL" />
                            <input
                              type="url"
                              value={editForm.avatarUrl}
                              onChange={(event) => setEditForm((previous) => ({ ...previous, avatarUrl: event.target.value }))}
                              className={InputClassName(!selectedCanMutate)}
                              disabled={!selectedCanMutate}
                              placeholder="https://"
                            />
                          </div>
                        </div>
                      </DrawerSection>

                      <DrawerSection icon={calendarDays} title="账号权限">
                        <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
                          <div>
                            <FieldLabel label="角色" />
                            <AnimatedSelect
                              value={editForm.roleId}
                              onChange={(value) => setEditForm((previous) => ({ ...previous, roleId: value }))}
                              disabled={!selectedCanMutate}
                              options={selectedRoleOptions.map((role) => ({
                                value: role.id,
                                label: role.displayName,
                              }))}
                            />
                          </div>
                          <div>
                            <FieldLabel label="状态" />
                            <AnimatedSelect
                              value={editForm.status}
                              onChange={(value) => setEditForm((previous) => ({ ...previous, status: value }))}
                              disabled={!selectedCanMutate}
                              options={statusOptions
                                .filter((option) => option.value !== "")
                                .map((option) => ({
                                  value: option.value,
                                  label: option.label,
                                }))}
                            />
                          </div>
                        </div>
                      </DrawerSection>

                      {/* Timestamps */}
                      <div className="flex items-center gap-6 rounded-xl bg-black/20 px-4 py-3 text-xs text-fg-dim ring-1 ring-white/[0.02]">
                        <span className="inline-flex items-center gap-1.5">
                          <Icon icon={clock} className="h-3 w-3" />
                          创建于 {formatDateTime(selectedUser.createdAt)}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Icon icon={clock} className="h-3 w-3" />
                          更新于 {formatDateTime(selectedUser.updatedAt)}
                        </span>
                      </div>

                      {/* Footer actions */}
                      <div className="flex items-center justify-end gap-3 pt-1">
                        <button
                          type="submit"
                          disabled={savingEdit || !selectedCanMutate}
                          className="btn-gradient rounded-xl px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingEdit ? "保存中..." : "保存变更"}
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </div>
            </aside>
          </div>
        </OverlayPortal>
      ) : null}
    </div>
  );
}

function shouldRedirectToLogin(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.message === "账号已停用");
}

function OverlayPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(children, document.body);
}

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "请求失败，请稍后重试。";
}


function StatCard({
  label,
  value,
  icon,
  iconBg,
  iconText,
  barFrom,
}: {
  label: string;
  value: number;
  icon: IconifyIcon;
  iconBg: string;
  iconText: string;
  barFrom: string;
}) {
  return (
    <div className="glass-panel glass-card relative overflow-hidden rounded-2xl">
      <div className={`h-0.5 bg-gradient-to-r ${barFrom} to-transparent`} />
      <div className="p-3 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 truncate text-[11px] font-medium uppercase tracking-wider text-fg-dim sm:text-xs">
            {label}
          </div>
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${iconBg}`}
          >
            <Icon icon={icon} className={`h-3.5 w-3.5 sm:h-5 sm:w-5 ${iconText}`} />
          </div>
        </div>
        <div className="text-gradient-brand mt-2 font-mono text-xl font-semibold tabular-nums sm:mt-3 sm:text-3xl">
          {value}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: number }) {
  const meta = getStatusMeta(status);

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotColor}`} />
      {meta.label}
    </span>
  );
}

function RoleBadge({ roleName, displayName }: { roleName: string; displayName: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${getRoleMeta(roleName)}`}>
      {roleName === "super_admin" ? <Icon icon={shieldCheck} className="h-3 w-3" /> : null}
      {displayName}
    </span>
  );
}

function GroupTags({
  groups,
  showRole = false,
  showStatus = false,
}: {
  groups?: AdminUserGroupRef[] | null;
  showRole?: boolean;
  showStatus?: boolean;
}) {
  if (!groups || groups.length === 0) {
    return <span className="text-sm text-fg-dim">未加入任何用户组</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {groups.map((group) => {
        const isLeader = showRole && group.memberRole === 1;

        return (
          <span
            key={`${group.id}-${group.memberRole}`}
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getGroupBadgeClass(showStatus ? group.status : undefined)}`}
          >
            <span>{group.name}</span>
            {showRole ? (
              <>
                <span className="mx-1 opacity-60">·</span>
                <span className={isLeader ? "rounded-full bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-200" : ""}>
                  {getGroupMemberRoleLabel(group.memberRole)}
                </span>
              </>
            ) : null}
            {showStatus && group.status === 0 ? (
              <>
                <span className="mx-1 opacity-60">·</span>
                <span>已停用</span>
              </>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

function DrawerSection({
  icon,
  title,
  children,
}: {
  icon: IconifyIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="glass-panel rounded-2xl">
      <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-5 py-3.5">
        <Icon icon={icon} className="h-4 w-4 text-fg-dim" />
        <h3 className="text-sm font-medium text-fg-muted">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-fg-dim">{label}</label>;
}

function InputClassName(disabled = false) {
  return `w-full rounded-xl border border-white/[0.08] bg-black/30 px-3.5 py-2.5 text-sm text-fg-primary placeholder:text-fg-dim/60 transition focus:border-primary-400/60 focus:ring-1 focus:ring-primary-400/30 focus:outline-none ${disabled ? "cursor-not-allowed opacity-60" : ""}`;
}
