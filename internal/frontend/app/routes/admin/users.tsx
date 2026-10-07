import clock from "@iconify-icons/lucide/clock";
import github from "@iconify-icons/lucide/github";
import info from "@iconify-icons/lucide/info";
import keyRound from "@iconify-icons/lucide/key-round";
import mail from "@iconify-icons/lucide/mail";
import phone from "@iconify-icons/lucide/phone";
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
import { ModalShell } from "~/components/modal-shell";
import { Notify } from "~/components/notify";
import {
  type AdminUserGroupOption,
  listAdminUserGroupOptions,
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
  status: "",
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

const userRoleFilterOptions = [
  { value: "", label: "全部角色" },
  { value: "user", label: "成员" },
  { value: "admin", label: "管理员" },
  { value: "super_admin", label: "超级管理员" },
];

const DRAWER_ANIMATION_MS = 220;
const FLASH_DURATION_MS = 3000;
const NOTIFY_ANIMATION_MS = 300;
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
      className: "admin-status--account-enabled",
    };
  }

  return {
    label: "停用",
    className: "admin-status--account-disabled",
  };
}

function getRoleMeta(roleName: string) {
  if (roleName === "super_admin") {
    return "admin-role--elevated";
  }
  if (roleName === "admin") {
    return "admin-role--elevated";
  }
  return "";
}

function getAccountRoleLabel(user: Pick<AdminUserListItem, "role"> | Pick<AdminUserDetail, "role">) {
  if (user.role.name === "super_admin") return "超级管理员";
  if (user.role.name === "admin") return "管理员";
  return "成员";
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
  return "";
}

function getGroupMemberRoleLabel(role: number) {
  return role === 2 ? "组长" : role === 1 ? "组内管理" : "组员";
}

function getGroupBadgeClass(status?: number) {
  if (status === 0) {
    return "admin-user-group--inactive";
  }
  return "";
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
  const canManageUserDirectory = actorRoleName === "super_admin" || actorRoleName === "admin";
  const canViewUserDirectory = canManageUserDirectory;

  const [query, setQuery] = useState<ListAdminUsersInput>(defaultQuery);
  const [filters, setFilters] = useState<ListAdminUsersInput>(defaultQuery);
  const [roles, setRoles] = useState<AdminUserRoleOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<AdminUserGroupOption[]>([]);
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
  const [rolesLoading, setRolesLoading] = useState(false);
  const [flash, setFlash] = useState<FlashState>(null);
  const [flashVisible, setFlashVisible] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editForm, setEditForm] = useState<UserFormState>(defaultUserFormState);
  const [roleFormRoleId, setRoleFormRoleId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const drawerOverlayRef = useRef<HTMLDivElement | null>(null);
  const drawerPanelRef = useRef<HTMLElement | null>(null);
  const drawerCloseTimerRef = useRef<number | null>(null);

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
  const selectedReadonlyReason = useMemo(() => {
    if (!selectedUser) {
      return "";
    }
    return getReadonlyReason(selectedUser.role.name, actorRoleName);
  }, [actorRoleName, selectedUser]);
  const selectedCanMutate = canViewUserDirectory && selectedReadonlyReason === "";
  const selectedCanEditIdentity = actorRoleName === "super_admin";
  const selectedCanEditStatus = actorRoleName === "super_admin" ||
    (actorRoleName === "admin" && selectedUser?.role.name === "user");

  useEffect(() => {
    if (!canViewUserDirectory) {
      return;
    }

    let cancelled = false;

    async function loadOptions() {
      try {
        setRolesLoading(true);
        const [roleResponse, groupResponse]: [AdminUserRoleOption[], AdminUserGroupOption[]] =
          canManageUserDirectory
            ? await Promise.all([listAdminRoles(), listAdminUserGroupOptions()])
            : [[], []];
        if (!cancelled) {
          const defaultEditableRole = roleResponse.find((item) => item.editableByCurrentActor);
          setRoles(roleResponse);
          setGroupOptions(groupResponse);
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
  }, [canManageUserDirectory, canViewUserDirectory]);

  useEffect(() => {
    if (!canViewUserDirectory) {
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
          setLoadingList(false);
        }
      }
    }

    void loadUsers();

    return () => {
      cancelled = true;
    };
  }, [canViewUserDirectory, navigate, query]);

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
          setRoleFormRoleId(String(detail.role.id));
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
    setQuery({
      ...filters,
      page: 1,
      pageSize: query.pageSize ?? 10,
    });
  }

  function handleResetFilters() {
    clearFlash(true);
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
      const updated = await updateAdminUser(selectedUser.id, {
        ...buildUpdatePayload({
          ...editForm,
          roleId: String(selectedUser.role.id),
          status: String(selectedUser.status),
        }),
        adminScope: selectedUser.adminScope,
        managementGroupId: selectedUser.managementGroupId,
      });
      setSelectedUser(updated);
      setEditForm(toUserFormState(updated));
      setRoleFormRoleId(String(updated.role.id));
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

  async function handleUpdateRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser || !selectedCanMutate || !selectedCanEditIdentity) {
      return;
    }

    try {
      setSavingRole(true);
      const updated = await updateAdminUser(selectedUser.id, {
        ...buildUpdatePayload({
          ...toUserFormState(selectedUser),
          roleId: roleFormRoleId,
        }),
        adminScope: selectedUser.adminScope,
        managementGroupId: selectedUser.managementGroupId,
      });
      setSelectedUser(updated);
      setRoleFormRoleId(String(updated.role.id));
      setFlash({ type: "success", message: `已更新 ${updated.email} 的系统角色` });
      await refreshList();
    } catch (error) {
      if (shouldRedirectToLogin(error)) {
        navigate("/login", { replace: true });
        return;
      }
      setFlash({ type: "error", message: getErrorMessage(error) });
    } finally {
      setSavingRole(false);
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
        setRoleFormRoleId(String(updated.role.id));
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

  if (!canViewUserDirectory) {
    return (
      <div className="admin-design admin-users">
        <div className="admin-notice admin-notice--warning">
          <h1 className="admin-page-title">人员管理</h1>
          <p className="mt-2 leading-6">
            当前账号没有管理员权限，无法访问用户管理接口。请使用管理员账号登录后再进入该页面。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-design admin-users space-y-4">
      <header className="admin-page-header flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="admin-eyebrow">吉甲 · 账号目录</div>
          <h1 className="admin-page-title">人员管理</h1>
          <p className="admin-page-description">查找账号、确认权限与所属组；资料编辑和安全操作分区处理。</p>
        </div>
        {canManageUserDirectory ? (
          <button
            type="button"
            onClick={openCreateModal}
            disabled={rolesLoading || editableRoleOptions.length === 0}
            className="admin-button admin-button--primary shrink-0"
          >
            <Icon icon={userPlus} className="h-4 w-4" />
            新建账号
          </button>
        ) : null}
      </header>

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

      <form
        aria-label="筛选人员账号"
        onSubmit={handleSearchSubmit}
        className="admin-filter-panel admin-users__filter-grid"
      >
        <div className="admin-users__filter-keyword">
          <FieldLabel label="关键词" htmlFor="user-keyword" />
          <input
            id="user-keyword"
            type="search"
            value={filters.keyword ?? ""}
            onChange={(event) => setFilters((previous) => ({ ...previous, keyword: event.target.value }))}
            placeholder="姓名、真实姓名、昵称、邮箱或手机号"
            className="admin-field"
          />
        </div>
        <div>
          <FieldLabel label="系统角色" htmlFor="user-role-filter" />
          <select
            id="user-role-filter"
            value={filters.role ?? ""}
            onChange={(event) => setFilters((previous) => ({ ...previous, role: event.target.value }))}
            className="admin-field"
          >
            {userRoleFilterOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel label="账号状态" htmlFor="user-status-filter" />
          <select
            id="user-status-filter"
            value={String(filters.status ?? "")}
            onChange={(event) => setFilters((previous) => ({
              ...previous,
              status: event.target.value === "" ? "" : Number(event.target.value),
            }))}
            className="admin-field"
          >
            {statusOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel label="所属组" htmlFor="user-group-filter" />
          <select
            id="user-group-filter"
            value={String(filters.groupId ?? "")}
            onChange={(event) => setFilters((previous) => ({
              ...previous,
              groupId: event.target.value === "" ? "" : Number(event.target.value),
            }))}
            className="admin-field"
          >
            <option value="">全部组别</option>
            {groupOptions.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}{group.status === 0 ? "（停用）" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-users__filter-actions">
          <button type="submit" className="admin-button admin-button--primary">
            <Icon icon={searchIcon} className="h-3.5 w-3.5" />
            搜索
          </button>
          <button type="button" onClick={handleResetFilters} className="admin-button admin-button--secondary">
            重置
          </button>
        </div>
      </form>

      <div className="admin-users__summary" aria-label="人员账号统计">
        <span>账号总数<strong>{summary.total}</strong></span>
        <span>启用<strong>{summary.enabled}</strong></span>
        <span>停用<strong>{summary.disabled}</strong></span>
        <span>管理员<strong>{summary.admins}</strong></span>
        <span>已绑定 GitHub<strong>{summary.githubBound}</strong></span>
      </div>

      <section className="admin-panel overflow-hidden" aria-label="人员账号列表">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--admin-border-subtle)] px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-[var(--admin-text)]">账号列表</h2>
          <span className="text-xs text-[var(--admin-dim)]">当前 {pagination.total} 条</span>
        </div>
        <div className="admin-users__table-wrap hidden xl:block">
          <table className="admin-table admin-table--users">
            <thead>
              <tr>
                <th className="w-[27%]">人员</th>
                <th className="w-[11%]">状态</th>
                <th className="w-[14%]">系统角色</th>
                <th className="w-[22%]">所属组</th>
                <th className="w-[16%]">账号 / 最近登录</th>
                <th className="w-[10%] text-right">详情</th>
              </tr>
            </thead>
            <tbody>
              {loadingList ? (
                <tr>
                  <td colSpan={6} className="admin-table-empty">
                    正在加载用户列表...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-table-empty">
                    当前筛选条件下没有匹配的账号。
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  return (
                    <tr key={user.id} className="admin-table-row">
                      <td>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="admin-users__avatar h-9 w-9 text-sm">
                            {(user.name || user.email).slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-[var(--admin-text)]">{user.name || "未填写姓名"}</div>
                            <div className="truncate text-xs text-[var(--admin-dim)]">{user.email}</div>
                            {user.realName?.trim() ? (
                              <div className="truncate text-xs text-[var(--admin-dim)]">真实姓名：{user.realName.trim()}</div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td><StatusBadge status={user.status} /></td>
                      <td>
                        <RoleBadge roleName={user.role.name} displayName={getAccountRoleLabel(user)} />
                      </td>
                      <td>
                        <GroupTags groups={user.groups} />
                      </td>
                      <td>
                        <div className="text-xs text-[var(--admin-muted)]">{getAuthMethodLabel(user)}</div>
                        <div className="mt-0.5 text-xs text-[var(--admin-dim)]">{formatDateTime(user.lastLoginAt)}</div>
                      </td>
                      <td>
                        <div className="admin-users__actions">
                          <button type="button" onClick={() => openDetail(user.id)} className="admin-button admin-button--secondary admin-button--small">
                            查看详情
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

        <div className="xl:hidden">
          {loadingList ? (
            <div className="admin-table-empty">正在加载用户列表...</div>
          ) : users.length === 0 ? (
            <div className="admin-table-empty">
              当前筛选条件下没有匹配的账号。
            </div>
          ) : (
            <ul className="divide-y divide-[var(--admin-border-subtle)]">
              {users.map((user) => {
                return (
                  <li key={user.id} className="admin-users__mobile-row">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="admin-users__avatar h-10 w-10 text-sm">
                        {(user.name || user.email).slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-[var(--admin-text)]">{user.name || "未填写姓名"}</div>
                        <div className="truncate text-xs text-[var(--admin-dim)]">{user.email}</div>
                        {user.realName?.trim() ? <div className="truncate text-xs text-[var(--admin-dim)]">真实姓名：{user.realName.trim()}</div> : null}
                      </div>
                      <StatusBadge status={user.status} />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <RoleBadge roleName={user.role.name} displayName={getAccountRoleLabel(user)} />
                      <GroupTags groups={user.groups} />
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--admin-dim)]">
                      <span>{getAuthMethodLabel(user)}</span>
                      <span>最近登录：{formatDateTime(user.lastLoginAt)}</span>
                    </div>

                    <div className="mt-3 flex justify-end border-t border-[var(--admin-border-subtle)] pt-3">
                      <button type="button" onClick={() => openDetail(user.id)} className="admin-button admin-button--secondary admin-button--small">
                        查看详情
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--admin-border-subtle)] px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="text-[var(--admin-dim)]">
            第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页，共 {pagination.total} 条记录
          </div>
          <div className="admin-actions">
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
              className="admin-field w-auto py-1.5"
            >
              {[10, 20, 50].map((value) => <option key={value} value={value}>{value} / 页</option>)}
            </select>
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setQuery((previous) => ({ ...previous, page: Math.max((previous.page ?? 1) - 1, 1) }))}
              className="admin-button admin-button--secondary admin-button--small"
            >
              上一页
            </button>
            <span className="min-w-7 text-center font-medium tabular-nums text-[var(--admin-text)]">
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
              className="admin-button admin-button--secondary admin-button--small"
            >
              下一页
            </button>
          </div>
        </div>
      </section>

      <ModalShell
        open={createModalOpen}
        title="新建账号"
        description="后台直接创建邮箱密码账号，默认创建后立即可登录。GitHub 绑定仅支持用户自行登录后生成。"
        onClose={() => setCreateModalOpen(false)}
        panelClassName="admin-design admin-users admin-users__modal"
        backdropClassName="admin-users__modal-backdrop"
        bodyClassName="px-5 py-4 sm:px-6 sm:py-5"
      >
            <form onSubmit={handleCreateUser} className="space-y-5">
              <div>
                <div className="admin-users__form-caption">必填信息</div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <FieldLabel label="角色" />
                    <select
                      value={createForm.roleId}
                      onChange={(event) => setCreateForm((previous) => ({ ...previous, roleId: event.target.value }))}
                      className="admin-field"
                      required
                    >
                      <option value="" disabled>请选择角色</option>
                      {editableRoleOptions.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name === "super_admin" ? "超级管理员" : role.name === "admin" ? "管理员" : "成员"}
                        </option>
                      ))}
                    </select>
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
                <div className="admin-users__form-caption">可选信息</div>
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
                    <select
                      value={createForm.gender}
                      onChange={(event) => setCreateForm((previous) => ({ ...previous, gender: event.target.value }))}
                      className="admin-field"
                    >
                      {genderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
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

              <div className="flex items-start gap-3 rounded-md border border-[var(--admin-border-subtle)] bg-[var(--admin-surface-subtle)] px-4 py-3 text-sm text-[var(--admin-muted)]">
                <Icon icon={info} className="mt-0.5 h-4 w-4 shrink-0 text-[var(--admin-accent)]" />
                创建后账号默认启用。若需要临时禁止登录，请创建完成后再执行"停用"操作。
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="admin-button admin-button--secondary"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={creating || editableRoleOptions.length === 0}
                  className="admin-button admin-button--primary"
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
        panelClassName="admin-design admin-users admin-users__modal"
        backdropClassName="admin-users__modal-backdrop"
        bodyClassName="px-5 py-4 sm:px-6 sm:py-5"
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
                <p className="mt-2 text-xs text-[var(--admin-dim)]">
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
                  className="admin-button admin-button--secondary"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={resettingPassword}
                  className="admin-button admin-button--primary"
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
        panelClassName="admin-design admin-users admin-users__modal"
        backdropClassName="admin-users__modal-backdrop"
        bodyClassName="px-5 py-4 sm:px-6 sm:py-5"
      >
        {statusModalTarget ? (
          <div className="space-y-5">
            <div className={`rounded-xl border px-4 py-3 text-sm leading-6 ${
              statusModalTarget.status === 1
              ? "border-[var(--admin-border)] bg-[var(--admin-danger-surface)] text-[var(--admin-danger)]"
                : "border-[var(--admin-border)] bg-[var(--admin-success-surface)] text-[var(--admin-success)]"
            }`}>
              {statusModalTarget.status === 1
                ? "停用后将立即阻断新登录，并使当前会话在下次 /api/me 校验时失效。系统不会物理删除该账号。"
                : "启用后账号可重新使用邮箱密码、验证码或 GitHub 登录。"}
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setStatusModalTarget(null)}
                className="admin-button admin-button--secondary"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleToggleStatus()}
                disabled={togglingStatus}
                className={`admin-button ${
                  statusModalTarget.status === 1
                    ? "admin-button--danger"
                    : "admin-button--positive"
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
          <div className="admin-design admin-users fixed inset-0 z-40">
            <div
              ref={drawerOverlayRef}
              className="admin-drawer-backdrop absolute inset-0"
              onClick={() => closeDrawer()}
            />
            <aside
              ref={drawerPanelRef}
              className="admin-drawer admin-users__drawer absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col"
            >
            {/* Header */}
            <div className="admin-users__drawer-header shrink-0 border-b">
              <div className="flex items-center justify-between px-6 py-4">
                <h2 className="text-lg font-semibold text-[var(--admin-text)]">人员详情</h2>
                <button
                  type="button"
                  onClick={() => closeDrawer()}
                  title="关闭"
                  aria-label="关闭"
                  className="admin-button admin-button--quiet admin-button--small"
                >
                  <Icon icon={x} className="h-4 w-4" />
                </button>
              </div>

              {selectedUser ? (
                <div className="border-t border-[var(--admin-border-subtle)] px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-4">
                    {selectedUser.avatarUrl ? (
                      <div className="relative shrink-0">
                        <img src={selectedUser.avatarUrl} alt="" className="h-12 w-12 rounded-full border border-[var(--admin-border)] object-cover" />
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--admin-canvas)] ${selectedUser.status === 1 ? "bg-emerald-400" : "bg-gray-500"}`}
                        />
                      </div>
                    ) : (
                      <div className="admin-users__avatar relative h-12 w-12 text-lg">
                        {(selectedUser.name || selectedUser.email).slice(0, 1).toUpperCase()}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--admin-canvas)] ${selectedUser.status === 1 ? "bg-emerald-400" : "bg-gray-500"}`}
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-base font-semibold text-[var(--admin-text)]">
                          {selectedUser.name}
                        </span>
                        <RoleBadge
                          roleName={selectedUser.role.name}
                          displayName={getAccountRoleLabel(selectedUser)}
                        />
                        <StatusBadge status={selectedUser.status} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--admin-muted)]">
                        <span className="inline-flex items-center gap-1.5">
                          <Icon icon={mail} className="h-3.5 w-3.5 text-[var(--admin-dim)]" />
                          {selectedUser.email}
                        </span>
                        {selectedUser.phone ? (
                          <span className="inline-flex items-center gap-1.5">
                          <Icon icon={phone} className="h-3.5 w-3.5 text-[var(--admin-dim)]" />
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
              <div className="space-y-4 p-4 sm:p-6">
                {detailLoading || !selectedUser ? (
                  <div className="flex flex-col items-center gap-3 py-20 text-sm text-[var(--admin-dim)]">
                    <span
                      aria-hidden="true"
                      className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-[var(--admin-border)] border-t-[var(--admin-accent)]"
                    />
                    <span>正在加载用户详情...</span>
                  </div>
                ) : (
                  <>
                    {/* Authentication & Login Info */}
                    <DrawerSection icon={shieldCheck} title="认证与登录">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="admin-users__info-card">
                          <div className="flex items-center gap-2 text-xs text-[var(--admin-dim)]">
                            <Icon icon={keyRound} className="h-3.5 w-3.5" />
                            登录方式
                          </div>
                          <div className="mt-2 text-sm font-medium text-[var(--admin-text)]">
                            {getAuthMethodLabel(selectedUser)}
                          </div>
                          <div className="mt-1 text-xs text-[var(--admin-dim)]">
                            {selectedUser.authMethods.hasPassword ? "已设置邮箱密码" : "未设置本地密码"}
                          </div>
                        </div>
                        <div className="admin-users__info-card">
                          <div className="flex items-center gap-2 text-xs text-[var(--admin-dim)]">
                            <Icon icon={github} className="h-3.5 w-3.5" />
                            GitHub 绑定
                          </div>
                          <div className="mt-2 text-sm font-medium text-[var(--admin-text)]">
                            {selectedUser.authMethods.githubBound ? (
                              <span className="text-[var(--admin-success)]">已绑定</span>
                            ) : (
                              <span className="text-[var(--admin-muted)]">未绑定</span>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-[var(--admin-dim)]">
                            {selectedUser.githubUsername
                              ? `@${selectedUser.githubUsername}`
                              : "仅支持用户自行绑定"}
                          </div>
                        </div>
                        <div className="admin-users__info-card">
                          <div className="flex items-center gap-2 text-xs text-[var(--admin-dim)]">
                            <Icon icon={clock} className="h-3.5 w-3.5" />
                            最近登录
                          </div>
                          <div className="mt-2 text-sm font-medium text-[var(--admin-text)]">
                            {formatDateTime(selectedUser.lastLoginAt)}
                          </div>
                          <div className="mt-1 text-xs text-[var(--admin-dim)]">
                            创建于 {formatDateTime(selectedUser.createdAt)}
                          </div>
                        </div>
                      </div>
                    </DrawerSection>

                    {/* Groups */}
                    <DrawerSection icon={usersIcon} title="所属分组">
                      <GroupTags groups={selectedUser.groups} showRole showStatus />
                      <p className="mt-3 text-xs text-[var(--admin-dim)]">
                        分组成员调整统一在"用户分组"页面完成，当前页面仅展示结果。
                      </p>
                    </DrawerSection>

                    {/* Readonly warning */}
                    {selectedReadonlyReason ? (
                      <div className="admin-notice admin-notice--warning flex items-start gap-3">
                        <Icon icon={shieldCheck} className="mt-0.5 h-4 w-4 shrink-0" />
                        <p className="text-sm leading-6">
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
                            <select
                              value={editForm.gender}
                              onChange={(event) => setEditForm((previous) => ({ ...previous, gender: event.target.value }))}
                              className={InputClassName(!selectedCanMutate)}
                              disabled={!selectedCanMutate}
                            >
                              {genderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <FieldLabel label="邮箱" />
                            <input
                              type="email"
                              value={editForm.email}
                              onChange={(event) => setEditForm((previous) => ({ ...previous, email: event.target.value }))}
                              className={InputClassName(!selectedCanMutate || !selectedCanEditIdentity)}
                              disabled={!selectedCanMutate || !selectedCanEditIdentity}
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

                      {/* Timestamps */}
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[var(--admin-border-subtle)] pt-3 text-xs text-[var(--admin-dim)]">
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
                          className="admin-button admin-button--primary"
                        >
                          {savingEdit ? "保存中..." : "保存变更"}
                        </button>
                      </div>
                    </form>

                    <section className="admin-users__security" aria-label="角色与账号安全操作">
                      <div className="mb-3">
                        <h3 className="text-sm font-semibold text-[var(--admin-text)]">访问与安全</h3>
                        <p className="mt-1 text-xs text-[var(--admin-dim)]">角色调整、密码重置和账号状态变更会立即影响访问权限。</p>
                      </div>

                      {selectedCanEditIdentity ? (
                        <form onSubmit={handleUpdateRole}>
                          <DrawerSection icon={shieldCheck} title="系统角色变更">
                            <p className="mb-3 text-xs leading-5 text-[var(--admin-dim)]">更改角色会影响该账号可访问的管理功能，请确认后单独保存。</p>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                              <div className="min-w-0 flex-1">
                                <FieldLabel label="系统角色" />
                                <select
                                  value={roleFormRoleId}
                                  onChange={(event) => setRoleFormRoleId(event.target.value)}
                                  className={InputClassName(!selectedCanMutate)}
                                  disabled={!selectedCanMutate}
                                >
                                  {roles.map((role) => (
                                    <option key={role.id} value={role.id} disabled={!role.editableByCurrentActor}>
                                      {role.name === "super_admin" ? "超级管理员" : role.name === "admin" ? "管理员" : "成员"}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <button
                                type="submit"
                                disabled={!selectedCanMutate || savingRole || roleFormRoleId === String(selectedUser.role.id)}
                                className="admin-button admin-button--secondary"
                              >
                                {savingRole ? "保存中..." : "保存角色"}
                              </button>
                            </div>
                          </DrawerSection>
                        </form>
                      ) : (
                        <DrawerSection icon={shieldCheck} title="系统角色">
                          <p className="text-sm text-[var(--admin-muted)]">{getAccountRoleLabel(selectedUser)}。角色修改仅限超级管理员。</p>
                        </DrawerSection>
                      )}

                      <DrawerSection icon={keyRound} title="账号安全操作">
                        <div className="divide-y divide-[var(--admin-border-subtle)]">
                          <div className="flex flex-col gap-2 py-3 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="text-sm font-medium text-[var(--admin-text)]">重置密码</div>
                              <p className="mt-0.5 text-xs text-[var(--admin-dim)]">旧密码会立即失效。</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPasswordModalTarget(selectedUser)}
                              disabled={actorRoleName !== "super_admin"}
                              title={actorRoleName === "super_admin" ? "重置密码" : "仅超级管理员可重置密码"}
                              className="admin-button admin-button--quiet admin-button--small self-start sm:self-auto"
                            >
                              重置密码
                            </button>
                          </div>
                          <div className="flex flex-col gap-2 py-3 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="text-sm font-medium text-[var(--admin-text)]">账号状态</div>
                              <p className="mt-0.5 text-xs text-[var(--admin-dim)]">当前：{selectedUser.status === 1 ? "启用" : "停用"}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setStatusModalTarget(selectedUser)}
                              disabled={!selectedCanEditStatus}
                              title={selectedCanEditStatus ? undefined : selectedReadonlyReason || "当前账号无权修改此状态"}
                              className="admin-button admin-button--quiet admin-button--small self-start sm:self-auto"
                            >
                              {selectedUser.status === 1 ? "停用账号" : "启用账号"}
                            </button>
                          </div>
                        </div>
                      </DrawerSection>
                    </section>
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


function StatusBadge({ status }: { status: number }) {
  const meta = getStatusMeta(status);

  return (
    <span className={`admin-status ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function RoleBadge({ roleName, displayName }: { roleName: string; displayName: string }) {
  return (
    <span className={`admin-role ${getRoleMeta(roleName)}`}>
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
    return <span className="text-xs text-[var(--admin-dim)]">未分组</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {groups.map((group) => {
        const isLeader = showRole && group.memberRole === 2;

        return (
          <span
            key={`${group.id}-${group.memberRole}`}
            className={`admin-user-group ${getGroupBadgeClass(showStatus ? group.status : undefined)}`}
          >
            <span>{group.name}</span>
            {showRole ? (
              <>
                <span className="mx-1 opacity-60">·</span>
                <span className={isLeader ? "admin-user-group__role" : ""}>
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
    <section className="admin-detail-section">
      <div className="admin-users__section-heading">
        <Icon icon={icon} className="h-4 w-4" />
        <h3>{title}</h3>
      </div>
      <div className="pt-3">{children}</div>
    </section>
  );
}

function FieldLabel({ label, htmlFor }: { label: string; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="admin-field-label">{label}</label>;
}

function InputClassName(disabled = false) {
  return `admin-field${disabled ? " admin-field--disabled" : ""}`;
}
