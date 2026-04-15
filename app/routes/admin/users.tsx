import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router";

import { AnimatedSelect } from "~/components/animated-select";
import { MotionDateInput } from "~/components/motion-date-input";
import {
  ModalShell,
  useModalPresence,
  useModalPresenceValue,
} from "~/components/modal-shell";
import {
  createAdminUser,
  getAdminUser,
  listAdminRoles,
  listAdminUsers,
  resetAdminUserPassword,
  updateAdminUser,
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

type DrawerState = "closed" | "entering" | "open" | "closing";

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
      className: "text-emerald-300 bg-emerald-500/10 border border-emerald-500/20",
    };
  }

  return {
    label: "停用",
    className: "text-gray-300 bg-gray-700/50 border border-gray-700",
  };
}

function getRoleMeta(roleName: string) {
  if (roleName === "super_admin") {
    return "text-amber-200 bg-amber-500/10 border border-amber-500/20";
  }
  if (roleName === "admin") {
    return "text-sky-200 bg-sky-500/10 border border-sky-500/20";
  }
  return "text-gray-200 bg-gray-700/50 border border-gray-700";
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
    return "border border-gray-700 bg-gray-800/80 text-gray-300";
  }
  return "border border-primary-500/20 bg-primary-500/10 text-primary-200";
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

  const [drawerState, setDrawerState] = useState<DrawerState>("closed");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editForm, setEditForm] = useState<UserFormState>(defaultUserFormState);
  const [savingEdit, setSavingEdit] = useState(false);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserFormState>(buildCreateFormState(""));
  const [creating, setCreating] = useState(false);

  const [passwordModalTarget, setPasswordModalTarget] = useState<AdminUserListItem | AdminUserDetail | null>(null);
  const [passwordValue, setPasswordValue] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);

  const [statusModalTarget, setStatusModalTarget] = useState<AdminUserListItem | AdminUserDetail | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const createModalVisible = useModalPresence(createModalOpen);
  const passwordModalVisible = useModalPresenceValue(passwordModalTarget);
  const statusModalVisible = useModalPresenceValue(statusModalTarget);

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
  const drawerVisible = drawerState !== "closed";
  const drawerActive = drawerState === "entering" || drawerState === "open";

  useEffect(() => {
    if (noAdminPermission) {
      return;
    }

    let cancelled = false;

    async function loadRoles() {
      try {
        setRolesLoading(true);
        const response = await listAdminRoles();
        if (!cancelled) {
          const defaultEditableRole = response.find((item) => item.editableByCurrentActor);
          setRoles(response);
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

    void loadRoles();

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
          setUsers(response.items);
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

    void loadUsers();

    return () => {
      cancelled = true;
    };
  }, [navigate, noAdminPermission, query]);

  useEffect(() => {
    if (!drawerActive || selectedUserId === null) {
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
          requestCloseDrawer();
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
  }, [drawerActive, navigate, selectedUserId]);

  useEffect(() => {
    if (drawerState !== "entering") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setDrawerState("open");
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [drawerState]);

  useEffect(() => {
    if (drawerState !== "closing") {
      return;
    }

    const timer = window.setTimeout(() => {
      setDrawerState("closed");
      setSelectedUserId(null);
      setSelectedUser(null);
      setDetailLoading(false);
    }, 420);

    return () => {
      window.clearTimeout(timer);
    };
  }, [drawerState]);

  async function refreshList() {
    const response = await listAdminUsers(query);
    setUsers(response.items);
    setSummary(response.summary);
    setPagination(response.pagination);
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFlash(null);
    setQuery({
      ...filters,
      page: 1,
      pageSize: query.pageSize ?? 10,
    });
  }

  function handleResetFilters() {
    setFlash(null);
    setFilters(defaultQuery);
    setQuery(defaultQuery);
  }

  function openCreateModal() {
    setCreateForm(buildCreateFormState(defaultCreateRoleId));
    setCreateModalOpen(true);
  }

  function openDetail(userId: number) {
    setSelectedUserId(userId);
    setSelectedUser(null);
    setDrawerState((current) => (current === "closed" ? "entering" : "open"));
  }

  function requestCloseDrawer() {
    setDrawerState((current) => {
      if (current === "closed" || current === "closing") {
        return current;
      }
      return "closing";
    });
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFlash(null);

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
      <div className="motion-fade-up motion-surface rounded-2xl border border-amber-500/20 bg-amber-500/10 p-6">
        <h1 className="text-xl font-semibold text-white">用户数据</h1>
        <p className="mt-2 text-sm leading-6 text-amber-100/80">
          当前账号没有管理员权限，无法访问用户管理接口。请使用管理员账号登录后再进入该页面。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="motion-fade-up flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-white">用户数据</h1>
          <p className="mt-1 text-sm text-gray-400">
            统一管理 `users` 表中的账号资料、角色、状态与登录方式。
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          disabled={rolesLoading || editableRoleOptions.length === 0}
          className="motion-button inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          新建账号
        </button>
      </div>

      {flash ? (
        <div
          className={`motion-fade-up rounded-2xl border px-4 py-3 text-sm ${
            flash.type === "success"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
              : "border-red-500/20 bg-red-500/10 text-red-100"
          }`}
          style={{ animationDelay: "60ms" }}
        >
          {flash.message}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="motion-fade-up" style={{ animationDelay: "80ms" }}>
          <StatCard label="账号总数" value={summary.total} hint="users 表中的全部账号" />
        </div>
        <div className="motion-fade-up" style={{ animationDelay: "140ms" }}>
          <StatCard label="启用账号" value={summary.enabled} hint={`停用 ${summary.disabled} 个`} />
        </div>
        <div className="motion-fade-up" style={{ animationDelay: "200ms" }}>
          <StatCard label="管理员账号" value={summary.admins} hint="包含 admin / super_admin" />
        </div>
        <div className="motion-fade-up" style={{ animationDelay: "260ms" }}>
          <StatCard label="GitHub 绑定" value={summary.githubBound} hint="已绑定 GitHub OAuth" />
        </div>
      </div>

      <form
        onSubmit={handleSearchSubmit}
        className="motion-fade-up motion-panel-soft rounded-2xl border border-gray-800 bg-gray-900/70 p-5"
        style={{ animationDelay: "120ms" }}
      >
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
              onChange={(value) =>
                setFilters((previous) => ({ ...previous, role: value }))
              }
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
            <FieldLabel label="状态" />
            <AnimatedSelect
              value={String(filters.status ?? "")}
              onChange={(value) =>
                setFilters((previous) => ({
                  ...previous,
                  status: value === "" ? "" : Number(value),
                }))
              }
              options={statusOptions.map((option) => ({
                value: option.value,
                label: option.label,
              }))}
            />
          </div>
          <div className="flex items-end gap-3">
            <button
              type="submit"
              className="motion-button rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600"
            >
              搜索
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="motion-button rounded-xl border border-gray-700 px-4 py-2.5 text-sm text-gray-200 transition hover:bg-white/5"
            >
              重置
            </button>
          </div>
        </div>
      </form>

      <div
        className="motion-fade-up overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70"
        style={{ animationDelay: "160ms" }}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-950/60 text-left text-xs uppercase tracking-wider text-gray-400">
              <tr>
                <th className="px-5 py-3.5">账号</th>
                <th className="px-5 py-3.5">角色</th>
                <th className="px-5 py-3.5">组别</th>
                <th className="px-5 py-3.5">状态</th>
                <th className="px-5 py-3.5">登录方式</th>
                <th className="px-5 py-3.5">最近登录</th>
                <th className="px-5 py-3.5">创建时间</th>
                <th className="px-5 py-3.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loadingList ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">
                    正在加载用户列表...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">
                    当前筛选条件下没有匹配的账号。
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const readonlyReason = getReadonlyReason(user.role.name, actorRoleName);
                  const canMutate = readonlyReason === "";

                  return (
                    <tr key={user.id} className="transition-colors duration-200 hover:bg-white/[0.03]">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-500/15 text-sm font-semibold text-primary-300">
                            {(user.name || user.email).slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-white">{user.name}</div>
                            <div className="text-xs text-gray-500">{user.email}</div>
                            {user.phone ? <div className="text-xs text-gray-500">{user.phone}</div> : null}
                          </div>
                        </div>
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
                      <td className="px-5 py-4 text-gray-300">{getAuthMethodLabel(user)}</td>
                      <td className="px-5 py-4 text-gray-400">{formatDateTime(user.lastLoginAt)}</td>
                      <td className="px-5 py-4 text-gray-400">{formatDateTime(user.createdAt)}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openDetail(user.id)}
                            className="motion-button rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 transition hover:bg-white/5"
                          >
                            详情
                          </button>
                          <button
                            type="button"
                            onClick={() => setPasswordModalTarget(user)}
                            disabled={!canMutate}
                            title={readonlyReason || "重置密码"}
                            className="motion-button rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            密码
                          </button>
                          <button
                            type="button"
                            onClick={() => setStatusModalTarget(user)}
                            disabled={!canMutate}
                            title={readonlyReason || (user.status === 1 ? "停用账号" : "启用账号")}
                            className="motion-button rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {user.status === 1 ? "停用" : "启用"}
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

        <div className="flex flex-col gap-3 border-t border-gray-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-400">
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
              className="motion-button rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages || pagination.totalPages === 0}
              onClick={() =>
                setQuery((previous) => ({
                  ...previous,
                  page: Math.min((previous.page ?? 1) + 1, Math.max(pagination.totalPages, 1)),
                }))
              }
              className="motion-button rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {createModalVisible ? (
        <ModalShell
          title="新建账号"
          description="后台直接创建邮箱密码账号，默认创建后立即可登录。GitHub 绑定仅支持用户自行登录后生成。"
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
        >
          <form onSubmit={handleCreateUser} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FieldLabel label="角色" />
                <AnimatedSelect
                  value={createForm.roleId}
                  onChange={(value) =>
                    setCreateForm((previous) => ({ ...previous, roleId: value }))
                  }
                  options={[
                    { value: "", label: "请选择角色", disabled: true },
                    ...editableRoleOptions.map((role) => ({
                      value: role.id,
                      label: role.displayName,
                    })),
                  ]}
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
                  onChange={(value) =>
                    setCreateForm((previous) => ({ ...previous, gender: value }))
                  }
                  options={genderOptions.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                />
              </div>
              <div>
                <FieldLabel label="生日" />
                <MotionDateInput
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

            <div className="rounded-xl border border-gray-800 bg-gray-950/60 px-4 py-3 text-sm text-gray-400">
              创建后账号默认启用。若需要临时禁止登录，请创建完成后再执行“停用”操作。
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="rounded-xl border border-gray-700 px-4 py-2.5 text-sm text-gray-200 transition hover:bg-white/5"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={creating || editableRoleOptions.length === 0}
                className="rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {creating ? "创建中..." : "确认创建"}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {passwordModalVisible ? (
        <ModalShell
          title="重置密码"
          description={`直接为 ${passwordModalVisible.email} 设置新的本地密码。旧密码会立即失效。`}
          open={passwordModalTarget !== null}
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
              <p className="mt-2 text-xs text-gray-500">
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
                className="rounded-xl border border-gray-700 px-4 py-2.5 text-sm text-gray-200 transition hover:bg-white/5"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={resettingPassword}
                className="rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resettingPassword ? "提交中..." : "确认重置"}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {statusModalVisible ? (
        <ModalShell
          title={statusModalVisible.status === 1 ? "停用账号" : "启用账号"}
          description={`目标账号：${statusModalVisible.email}`}
          open={statusModalTarget !== null}
          onClose={() => setStatusModalTarget(null)}
          widthClass="max-w-lg"
        >
          <div className="space-y-5">
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
              {statusModalVisible.status === 1
                ? "停用后将立即阻断新登录，并使当前会话在下次 /api/me 校验时失效。系统不会物理删除该账号。"
                : "启用后账号可重新使用邮箱密码、验证码或 GitHub 登录。"}
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setStatusModalTarget(null)}
                className="rounded-xl border border-gray-700 px-4 py-2.5 text-sm text-gray-200 transition hover:bg-white/5"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleToggleStatus()}
                disabled={togglingStatus}
                className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {togglingStatus
                  ? "提交中..."
                  : statusModalVisible.status === 1
                    ? "确认停用"
                    : "确认启用"}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {drawerVisible ? (
        <div className="fixed inset-0 z-40">
          <div
            className="motion-overlay absolute inset-0 bg-black/70"
            data-state={drawerState === "open" ? "open" : "closed"}
            onClick={requestCloseDrawer}
          />
          <aside
            className="motion-drawer-right absolute right-0 top-0 h-full w-full max-w-3xl overflow-y-auto border-l border-gray-800 bg-gray-950 shadow-2xl"
            data-state={drawerState === "open" ? "open" : "closed"}
          >
            <div className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950/95 px-6 py-5 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-white">
                      {selectedUser?.name || "用户详情"}
                    </h2>
                    {selectedUser ? (
                      <>
                        <RoleBadge
                          roleName={selectedUser.role.name}
                          displayName={selectedUser.role.displayName}
                        />
                        <StatusBadge status={selectedUser.status} />
                      </>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-gray-400">
                    {selectedUser?.email ?? "正在加载账号详情..."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={requestCloseDrawer}
                  className="motion-button rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition hover:bg-white/5"
                >
                  关闭
                </button>
              </div>
            </div>

            <div className="space-y-6 px-6 py-6">
              {detailLoading || !selectedUser ? (
                <div className="rounded-2xl border border-gray-800 bg-gray-900/70 px-6 py-10 text-center text-sm text-gray-400">
                  正在加载用户详情...
                </div>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="motion-surface rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
                      <div className="text-xs uppercase tracking-wider text-gray-500">登录方式</div>
                      <div className="mt-3 text-sm font-medium text-white">
                        {getAuthMethodLabel(selectedUser)}
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        {selectedUser.authMethods.hasPassword ? "已设置邮箱密码" : "未设置本地密码"}
                      </div>
                    </div>
                    <div className="motion-surface rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
                      <div className="text-xs uppercase tracking-wider text-gray-500">GitHub 绑定</div>
                      <div className="mt-3 text-sm font-medium text-white">
                        {selectedUser.authMethods.githubBound ? "已绑定" : "未绑定"}
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        {selectedUser.githubUsername ? `用户名：${selectedUser.githubUsername}` : "后台不支持手动改绑或解绑"}
                      </div>
                    </div>
                    <div className="motion-surface rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
                      <div className="text-xs uppercase tracking-wider text-gray-500">最近登录</div>
                      <div className="mt-3 text-sm font-medium text-white">
                        {formatDateTime(selectedUser.lastLoginAt)}
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        创建于 {formatDateTime(selectedUser.createdAt)}
                      </div>
                    </div>
                  </div>

                  <div className="motion-surface rounded-2xl border border-gray-800 bg-gray-900/70 p-4">
                    <div className="text-xs uppercase tracking-wider text-gray-500">所属分组</div>
                    <div className="mt-3">
                      <GroupTags groups={selectedUser.groups} showRole showStatus />
                    </div>
                    <div className="mt-3 text-xs text-gray-500">
                      分组成员调整统一在“用户分组”页面完成，当前页面仅展示结果。
                    </div>
                  </div>

                  {selectedReadonlyReason ? (
                    <div className="motion-fade-up rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm leading-6 text-amber-100">
                      {selectedReadonlyReason}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setPasswordModalTarget(selectedUser)}
                      disabled={!selectedCanMutate}
                      className="motion-button rounded-xl border border-gray-700 px-4 py-2.5 text-sm text-gray-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      重置密码
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusModalTarget(selectedUser)}
                      disabled={!selectedCanMutate}
                      className="motion-button rounded-xl border border-red-500/30 px-4 py-2.5 text-sm text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {selectedUser.status === 1 ? "停用账号" : "启用账号"}
                    </button>
                  </div>

                  <form onSubmit={handleUpdateUser} className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <FieldLabel label="角色" />
                        <AnimatedSelect
                          value={editForm.roleId}
                          onChange={(value) =>
                            setEditForm((previous) => ({ ...previous, roleId: value }))
                          }
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
                          onChange={(value) =>
                            setEditForm((previous) => ({ ...previous, status: value }))
                          }
                          disabled={!selectedCanMutate}
                          options={statusOptions
                            .filter((option) => option.value !== "")
                            .map((option) => ({
                              value: option.value,
                              label: option.label,
                            }))}
                        />
                      </div>
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
                        <FieldLabel label="性别" />
                        <AnimatedSelect
                          value={editForm.gender}
                          onChange={(value) =>
                            setEditForm((previous) => ({ ...previous, gender: value }))
                          }
                          disabled={!selectedCanMutate}
                          options={genderOptions.map((option) => ({
                            value: option.value,
                            label: option.label,
                          }))}
                        />
                      </div>
                      <div>
                        <FieldLabel label="生日" />
                        <MotionDateInput
                          type="date"
                          value={editForm.birthday}
                          onChange={(event) => setEditForm((previous) => ({ ...previous, birthday: event.target.value }))}
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

                    <div className="motion-surface rounded-2xl border border-gray-800 bg-gray-900/70 p-4 text-sm text-gray-400">
                      <div>创建时间：{formatDateTime(selectedUser.createdAt)}</div>
                      <div className="mt-2">更新时间：{formatDateTime(selectedUser.updatedAt)}</div>
                    </div>

                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setEditForm(toUserFormState(selectedUser))}
                        disabled={savingEdit || !selectedCanMutate}
                        className="motion-button rounded-xl border border-gray-700 px-4 py-2.5 text-sm text-gray-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        重置修改
                      </button>
                      <button
                        type="submit"
                        disabled={savingEdit || !selectedCanMutate}
                        className="motion-button rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {savingEdit ? "保存中..." : "保存变更"}
                      </button>
                    </div>
                  </form>
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

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="motion-stat-surface rounded-2xl border border-gray-800 bg-gray-900/70 p-5">
      <div className="text-sm text-gray-400">{label}</div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-xs text-gray-500">{hint}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: number }) {
  const meta = getStatusMeta(status);

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function RoleBadge({ roleName, displayName }: { roleName: string; displayName: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getRoleMeta(roleName)}`}>
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
    return <span className="text-sm text-gray-500">未加入任何用户组</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {groups.map((group) => (
        <span
          key={`${group.id}-${group.memberRole}`}
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getGroupBadgeClass(showStatus ? group.status : undefined)}`}
        >
          {group.name}
          {showRole ? ` · ${getGroupMemberRoleLabel(group.memberRole)}` : ""}
          {showStatus && group.status === 0 ? " · 已停用" : ""}
        </span>
      ))}
    </div>
  );
}

function FieldLabel({ label }: { label: string }) {
  return <label className="mb-2 block text-sm font-medium text-gray-200">{label}</label>;
}

function InputClassName(disabled = false) {
  return `motion-field w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 ${disabled ? "cursor-not-allowed opacity-60" : ""}`;
}
