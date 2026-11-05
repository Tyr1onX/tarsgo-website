import { BrandLoader } from "~/components/brand-loader";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router";

import { ModalShell } from "~/components/modal-shell";
import { Notify } from "~/components/notify";
import { CoBuilderBadgeAdminPanel } from "~/components/co-builder-badge-admin-panel";
import { teamIdentityLabel, teamIdentityOptions, type TeamIdentityStatus } from "~/components/community-team-identity";
import { ApiError } from "~/lib/api-client";
import {
  createAdminUser,
  getAdminUser,
  listAdminRoles,
  listAdminUsers,
  resetAdminUserPassword,
  updateAdminUserGroup,
  updateAdminUserGroupRole,
  updateAdminUser,
  updateAdminUserTeamIdentity,
  type AdminUserDetail,
  type AdminUserListItem,
  type AdminUserRoleOption,
  type AdminUserSummary,
} from "~/lib/admin-users-client";
import { listAdminUserGroupOptions, type AdminUserGroupOption } from "~/lib/admin-user-groups-client";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";

export function meta() {
  return [{ title: "账号与权限 | TARSGO" }, { name: "description", content: "管理招新账号、系统角色和访问状态" }];
}

type AccountDraft = {
  realName: string;
  email: string;
  roleId: string;
  status: string;
  password: string;
};

const emptyDraft: AccountDraft = { realName: "", email: "", roleId: "", status: "1", password: "" };
const emptySummary: AdminUserSummary = { total: 0, enabled: 0, disabled: 0, admins: 0, grouped: 0, unassigned: 0, pending: 0, cleanupPending: 0, groupDistribution: [] };

function formatDate(value?: string | null) {
  if (!value) return "从未登录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function recruitmentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending_screening: "待初筛",
    pending_interview: "待面试",
    admitted: "已录取",
    rejected: "未通过",
    withdrawn: "已撤回",
  };
  return labels[status] ?? status;
}

function organizationTitleLabel(role: number) {
  if (role === 2) return "组长";
  if (role === 1) return "历史组管理员（停用）";
  return "普通成员";
}

export default function AccountManagement() {
  const navigate = useNavigate();
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedUserId = searchParams.get("userId");
  const [roles, setRoles] = useState<AdminUserRoleOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<AdminUserGroupOption[]>([]);
  const [groupFilterOptions, setGroupFilterOptions] = useState<AdminUserGroupOption[]>([]);
  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [groupIdFilter, setGroupIdFilter] = useState("");
  const [groupStateFilter, setGroupStateFilter] = useState<"" | "assigned" | "unassigned" | "pending" | "cleanup">("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const accountRequestId = useRef(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<AdminUserDetail | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);
  const [detailSection, setDetailSection] = useState<"account" | "organization" | "records">("account");
  const [activeEditor, setActiveEditor] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [userGroupId, setUserGroupId] = useState("");
  const [groupRoleDrafts, setGroupRoleDrafts] = useState<Record<number, string>>({});
  const [teamIdentityDraft, setTeamIdentityDraft] = useState<TeamIdentityStatus>("community_member");
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  async function loadRoles() {
    try {
      const [result, groups] = await Promise.all([listAdminRoles(), listAdminUserGroupOptions()]);
      setRoles(result.filter((role) => role.editableByCurrentActor));
      setGroupFilterOptions(groups);
      setGroupOptions(groups.filter((group) => group.status === 1));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) navigate("/login", { replace: true });
      else setError(cause instanceof Error ? cause.message : "账号角色加载失败");
    }
  }

  async function loadAccounts(nextPage = page) {
    const requestId = ++accountRequestId.current;
    setLoading(true);
    setError("");
    try {
      const result = await listAdminUsers({
        page: nextPage, pageSize: 10, keyword: searchKeyword, role: roleFilter,
        status: statusFilter === "" ? "" : Number(statusFilter),
        groupId: groupIdFilter === "" ? "" : Number(groupIdFilter),
        groupState: groupStateFilter, includeInactive,
      });
      if (requestId !== accountRequestId.current) return;
      setItems(result.items);
      setSummary(result.summary);
      setTotalPages(Math.max(1, result.pagination.totalPages));
      setPage(result.pagination.page);
    } catch (cause) {
      if (requestId !== accountRequestId.current) return;
      if (cause instanceof ApiError && cause.status === 401) navigate("/login", { replace: true });
      else setError(cause instanceof Error ? cause.message : "账号列表加载失败");
    } finally {
      if (requestId === accountRequestId.current) setLoading(false);
    }
  }

  useEffect(() => { void loadRoles(); }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchKeyword(keyword), 300);
    return () => window.clearTimeout(timer);
  }, [keyword]);
  useEffect(() => {
    void loadAccounts(1);
    return () => { accountRequestId.current += 1; };
  }, [searchKeyword, roleFilter, statusFilter, groupIdFilter, groupStateFilter, includeInactive]);

  function showAccountDetail(detail: AdminUserDetail) {
    setEditing(detail);
    setEditingIsNew(false);
    setDraft({ realName: detail.realName ?? "", email: detail.email, roleId: String(detail.role.id), status: String(detail.status), password: "" });
    setUserGroupId(detail.groups.length === 1 && detail.groups[0].status === 1 ? String(detail.groups[0].groupId) : "");
    setGroupRoleDrafts(Object.fromEntries(detail.groups.map((group) => [group.groupId, String(group.role)])));
    setTeamIdentityDraft(detail.teamIdentityStatus);
    setNewPassword("");
    setActiveEditor("");
    setFieldError("");
  }

  useEffect(() => {
    if (!requestedUserId) return;
    if (!/^[1-9]\d*$/.test(requestedUserId) || !Number.isSafeInteger(Number(requestedUserId))) {
      setError("账号编号无效");
      return;
    }
    if (editing?.id === Number(requestedUserId)) return;
    let cancelled = false;
    setEditing(null);
    setError("");
    void getAdminUser(Number(requestedUserId)).then((detail) => {
      if (!cancelled) showAccountDetail(detail);
    }).catch((cause) => {
      if (cancelled) return;
      if (cause instanceof ApiError && cause.status === 401) navigate("/login", { replace: true });
      else setError(cause instanceof Error ? cause.message : "账号详情加载失败");
    });
    return () => { cancelled = true; };
  }, [requestedUserId, editing?.id]);

  function openEdit(item: AdminUserListItem) {
    setDetailSection("account");
    setNotice("");
    const next = new URLSearchParams(searchParams);
    next.set("userId", String(item.id));
    setSearchParams(next);
  }

  function closeEditor() {
    setEditing(null);
    setEditingIsNew(false);
    setDraft(emptyDraft);
    setActiveEditor("");
    setFieldError("");
    if (requestedUserId) {
      const next = new URLSearchParams(searchParams);
      next.delete("userId");
      setSearchParams(next, { replace: true });
    }
  }

  function openCreate() {
    setEditing(null);
    setEditingIsNew(true);
    setDraft({ ...emptyDraft, roleId: String(roles.find((role) => role.name === "user")?.id ?? roles[0]?.id ?? "") });
    setError("");
  }

  function beginEdit(field: string) {
    if (!editing) return;
    setDraft({ realName: editing.realName ?? "", email: editing.email, roleId: String(editing.role.id), status: String(editing.status), password: "" });
    setUserGroupId(editing.groups.length === 1 && editing.groups[0].status === 1 ? String(editing.groups[0].groupId) : "");
    setGroupRoleDrafts(Object.fromEntries(editing.groups.map((group) => [group.groupId, String(group.role)])));
    setTeamIdentityDraft(editing.teamIdentityStatus);
    setNewPassword("");
    setFieldError("");
    setActiveEditor(field);
  }

  function handleActionError(cause: unknown, fallback: string) {
    if (cause instanceof ApiError && cause.status === 401) navigate("/login", { replace: true });
    else setFieldError(cause instanceof Error ? cause.message : fallback);
  }

  async function refreshDetail(detail: AdminUserDetail, message: string) {
    showAccountDetail(await getAdminUser(detail.id));
    setNotice(message);
    await loadAccounts();
  }

  async function saveAccountPart(part: "profile" | "access") {
    if (!editing || saving) return;
    setSaving(true);
    setFieldError("");
    try {
      // PATCH accepts all account fields, so first verify that untouched values are current.
      const latest = await getAdminUser(editing.id);
      if (latest.updatedAt !== editing.updatedAt) {
        showAccountDetail(latest);
        setActiveEditor(part);
        setFieldError("账号数据已变化，请核对最新信息后重试。");
        return;
      }
      const selectedRole = roles.find((role) => role.id === Number(draft.roleId));
      if (part === "access" && !selectedRole) throw new Error("请选择系统角色");
      const updated = await updateAdminUser(editing.id, {
        realName: part === "profile" ? draft.realName.trim() : latest.realName ?? "",
        email: part === "profile" ? draft.email.trim() : latest.email,
        roleId: part === "access" ? selectedRole!.id : latest.role.id,
        status: part === "access" ? Number(draft.status) : latest.status,
      });
      await refreshDetail(updated, part === "profile" ? "基本资料已保存。" : "账号权限已保存。");
    } catch (cause) {
      handleActionError(cause, "账号保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveTeamIdentity() {
    if (!editing || saving || teamIdentityDraft === editing.teamIdentityStatus) return;
    setSaving(true);
    setFieldError("");
    try {
      await refreshDetail(await updateAdminUserTeamIdentity(editing.id, { status: teamIdentityDraft }), "战队成员身份已更新。");
    } catch (cause) {
      handleActionError(cause, "成员身份更新失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveGroupRole(groupId: number) {
    if (!editing || saving) return;
    const group = editing.groups.find((item) => item.groupId === groupId);
    const role = Number(groupRoleDrafts[groupId]);
    if (!group || role === group.role) return;
    if (!window.confirm("确认将「" + group.name + "」的组内身份改为「" + organizationTitleLabel(role) + "」？")) return;
    setSaving(true);
    setFieldError("");
    try {
      await refreshDetail(await updateAdminUserGroupRole(editing.id, groupId, role), "组内身份已更新。");
    } catch (cause) {
      handleActionError(cause, "组内身份更新失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveUserGroup() {
    if (!editing || saving || editing.groups.length > 1 || editing.role.name === "super_admin") return;
    const nextGroupID = userGroupId ? Number(userGroupId) : null;
    const existing = editing.groups[0];
    if ((!existing && nextGroupID === null) || (existing?.groupId === nextGroupID && existing.status === 1)) return;
    setFieldError("");
    try {
      // ReplaceUserGroupTx deletes every nonselected relation, including disabled groups.
      const latest = await getAdminUser(editing.id);
      if (JSON.stringify(latest.groups) !== JSON.stringify(editing.groups) || latest.groups.length > 1) {
        showAccountDetail(latest);
        setActiveEditor("group");
        setFieldError("组别关系已变化，请核对最新信息后重试。");
        return;
      }
      if (existing && !window.confirm("调整组别将移除「" + existing.name + "」的原关系及组内身份。确定继续？")) return;
      setSaving(true);
      await refreshDetail(await updateAdminUserGroup(editing.id, nextGroupID), "所属组别已更新。");
    } catch (cause) {
      handleActionError(cause, "所属组别更新失败");
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || saving) return;
    setSaving(true);
    setFieldError("");
    try {
      await resetAdminUserPassword(editing.id, newPassword);
      await refreshDetail(editing, "登录密码已重置。");
    } catch (cause) {
      handleActionError(cause, "密码重置失败");
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingIsNew || saving) return;
    setSaving(true);
    setError("");
    try {
      const selectedRole = roles.find((role) => role.id === Number(draft.roleId));
      if (!selectedRole) throw new Error("请选择系统角色");
      const created = await createAdminUser({
        realName: draft.realName.trim(), email: draft.email.trim(),
        password: draft.password, roleId: selectedRole.id,
      });
      showAccountDetail(created);
      setDetailSection("account");
      const next = new URLSearchParams(searchParams);
      next.set("userId", String(created.id));
      setSearchParams(next, { replace: true });
      setNotice("账号已创建。");
      await loadAccounts();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) navigate("/login", { replace: true });
      else setError(cause instanceof Error ? cause.message : "账号创建失败");
    } finally {
      setSaving(false);
    }
  }

  const editError = (field: string) => activeEditor === field && fieldError
    ? <p role="alert" className="mt-2 text-xs text-[var(--theme-danger)]">{fieldError}</p> : null;
  const canEdit = editing?.role.name !== "super_admin";

  return (
    <div className="admin-design admin-users space-y-5">
      <header className="admin-page-header admin-users__header">
        <h1 className="admin-page-title">账号与权限</h1>
        {requestedUserId ? <button type="button" onClick={closeEditor} className="admin-button admin-button--secondary">返回账号列表</button>
          : <button type="button" onClick={openCreate} className="admin-button admin-button--primary">新建账号</button>}
      </header>
      {error ? <div role="alert" className="admin-notice admin-notice--error">{error}</div> : null}
      {notice ? <Notify tone="success" message={notice} onClose={() => setNotice("")} /> : null}
      {!requestedUserId ? <>
      <div className="admin-users__summary" aria-label="账号概况">
        <span>用户总数 <strong>{summary.total}</strong></span>
        <span>启用 <strong>{summary.enabled}</strong></span>
        <span>停用 <strong>{summary.disabled}</strong></span>
        <span>组别待处理 <strong>{summary.pending + summary.cleanupPending}</strong></span>
      </div>
      {summary.groupDistribution.length ? <details className="admin-users__distribution">
        <summary>查看组别分布</summary>
        <div>{summary.groupDistribution.map((group) => <span key={group.groupId}>{group.name}<strong>{group.userCount}</strong></span>)}</div>
      </details> : null}

      <section className="admin-filter-panel">
        <div className="admin-filter-grid admin-users__filters">
          <label className="text-xs text-[var(--admin-muted)]">搜索成员<input type="search" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="姓名或邮箱" className="admin-field mt-1" /></label>
          <label className="text-xs text-[var(--admin-muted)]">具体组别<select value={groupStateFilter === "unassigned" ? "unassigned" : groupIdFilter} onChange={(event) => {
            const value = event.target.value;
            if (value === "unassigned") {
              setGroupIdFilter("");
              setGroupStateFilter("unassigned");
            } else {
              setGroupIdFilter(value);
              if (groupStateFilter === "unassigned") setGroupStateFilter("");
            }
          }} className="admin-field mt-1"><option value="">全部组别</option><option value="unassigned">未分组</option>{groupFilterOptions.map((group) => <option key={group.id} value={group.id}>{group.name}{group.status === 1 ? "" : "（已停用）"}</option>)}</select></label>
          <label className="text-xs text-[var(--admin-muted)]">账号状态<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="admin-field mt-1"><option value="">全部状态</option><option value="1">启用</option><option value="0">停用</option></select></label>
        </div>
        <details className="mt-3 border-t border-[var(--admin-border-subtle)] pt-3">
          <summary className="cursor-pointer text-xs font-medium text-[var(--admin-muted)]">高级筛选</summary>
          <div className="admin-filter-grid mt-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="text-xs text-[var(--admin-muted)]">系统角色<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="admin-field mt-1"><option value="">全部角色</option>{roles.map((role) => <option key={role.id} value={role.name}>{role.displayName}</option>)}</select></label>
            <label className="text-xs text-[var(--admin-muted)]">组别关系状态<select value={groupStateFilter} onChange={(event) => setGroupStateFilter(event.target.value as typeof groupStateFilter)} className="admin-field mt-1"><option value="">全部关系状态</option><option value="assigned">单一有效组别</option><option value="unassigned">未分组</option><option value="pending">多组待处理</option><option value="cleanup">停用组关系待清理</option></select></label>
            <label className="flex min-h-9 items-center gap-2 self-end text-xs text-[var(--admin-muted)]"><input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />包含停用或超过 90 天未登录的账号</label>
          </div>
        </details>
      </section>

      <section className="admin-panel overflow-hidden" aria-label="账号列表">
        {loading && items.length === 0 ? <BrandLoader label="正在加载账号" /> : items.length === 0 ? <div className="admin-table-empty">没有符合条件的账号。</div> : (
          <div className="admin-users__table-wrap">
            <table className="admin-table admin-users__table">
              <thead><tr><th>成员</th><th>组别</th><th>身份与权限</th><th>状态</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="admin-table-row">
                    <td><button type="button" className="admin-users__member-link" onClick={() => void openEdit(item)}><strong>{item.realName || "姓名待核实"}</strong><span>查看详情</span></button></td>
                    <td>{item.groupState === "pending" ? <><span className="admin-status admin-status--screening">待确认</span><span className="admin-users__group-name">{item.groups.filter((group) => group.status === 1).map((group) => group.name).join("、")}</span></> : item.groupState === "assigned" ? <><span className="admin-users__group-name">{item.groupName}</span>{item.cleanupPending ? <span className="admin-users__group-warning">待清理停用关系</span> : null}</> : <><span className="admin-users__group-name is-muted">未分组</span>{item.cleanupPending ? <span className="admin-users__group-warning">待清理停用关系</span> : null}</>}</td>
                    <td><div className="admin-users__identity"><span>{teamIdentityLabel(item.teamIdentityStatus)}</span><span className={`admin-role ${item.role.name === "user" ? "" : "admin-role--elevated"}`}>{item.role.displayName}</span></div></td>
                    <td><span className={`admin-status ${item.status === 1 ? "admin-status--account-enabled" : "admin-status--account-disabled"}`}>{item.status === 1 ? "启用" : "停用"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--admin-border-subtle)] px-4 py-3 text-xs text-[var(--admin-muted)]">
          <span>{loading ? "正在更新账号… · " : ""}第 {page} / {totalPages} 页</span>
          <div className="admin-operation-group"><button type="button" disabled={page <= 1 || loading} onClick={() => void loadAccounts(page - 1)} className="admin-button admin-button--secondary admin-button--small">上一页</button><button type="button" disabled={page >= totalPages || loading} onClick={() => void loadAccounts(page + 1)} className="admin-button admin-button--secondary admin-button--small">下一页</button></div>
        </div>
      </section>


      </> : null}
      {requestedUserId && !editing && !error ? <BrandLoader label="正在读取成员详情" /> : null}
      {requestedUserId && editing?.id === Number(requestedUserId) ? <div className="mx-auto w-full max-w-4xl space-y-5">
        <section className="admin-panel flex flex-wrap items-center gap-4 p-4 sm:p-5" aria-label="成员摘要">
          <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--admin-surface)] text-lg font-semibold text-[var(--admin-text)]">
            {editing.avatarUrl ? <img src={editing.avatarUrl} alt="" className="size-full object-cover" /> : (editing.realName || editing.email).slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-lg font-semibold text-[var(--admin-text)]">{editing.realName || "姓名待核实"}</h2>
            <p className="break-all text-sm text-[var(--admin-muted)]">{editing.email}</p>
            <p className="mt-1 text-xs text-[var(--admin-dim)]">账号 ID {editing.id}</p>
          </div>
          <span className={editing.status === 1 ? "admin-status admin-status--account-enabled" : "admin-status admin-status--account-disabled"}>{editing.status === 1 ? "启用" : "停用"}</span>
        </section>

        <nav aria-label="成员详情栏目" className="flex flex-wrap gap-2 border-b border-[var(--admin-border-subtle)] pb-2">
          {([{ id: "account", label: "账号与权限" }, { id: "organization", label: "战队组织" }, { id: "records", label: "记录与贡献" }] as const).map((section) => (
            <button key={section.id} type="button" aria-current={detailSection === section.id ? "page" : undefined}
              className={detailSection === section.id ? "admin-button admin-button--primary" : "admin-button admin-button--quiet"}
              onClick={() => { setDetailSection(section.id); setActiveEditor(""); setFieldError(""); }}>{section.label}</button>
          ))}
        </nav>

        {detailSection === "account" ? <div className="space-y-5">
          <section className="admin-panel space-y-4 p-4 sm:p-5" aria-label="基本资料">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[var(--admin-text)]">基本资料</h3>
              {canEdit && activeEditor !== "profile" ? <button type="button" onClick={() => beginEdit("profile")} className="admin-button admin-button--quiet admin-button--small">修改</button> : null}
            </div>
            {activeEditor === "profile" ? <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void saveAccountPart("profile"); }}>
              <label className="block text-xs text-[var(--admin-muted)]">姓名<input required maxLength={100} className="admin-field mt-1" value={draft.realName} onChange={(event) => setDraft((current) => ({ ...current, realName: event.target.value }))} /></label>
              <label className="block text-xs text-[var(--admin-muted)]">邮箱<input required type="email" maxLength={255} className="admin-field mt-1" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></label>
              {editError("profile")}
              <div className="flex gap-2"><button disabled={saving} type="submit" className="admin-button admin-button--primary admin-button--small">保存</button><button disabled={saving} type="button" onClick={() => setActiveEditor("")} className="admin-button admin-button--secondary admin-button--small">取消</button></div>
            </form> : <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-[var(--admin-muted)]">姓名</dt><dd className="mt-1 text-[var(--admin-text)]">{editing.realName || "未填写"}</dd></div>
              <div><dt className="text-xs text-[var(--admin-muted)]">邮箱</dt><dd className="mt-1 break-all text-[var(--admin-text)]">{editing.email}</dd></div>
              <div><dt className="text-xs text-[var(--admin-muted)]">手机号</dt><dd className="mt-1 text-[var(--admin-text)]">{editing.phone || "未填写"}</dd></div>
              <div><dt className="text-xs text-[var(--admin-muted)]">登录方式</dt><dd className="mt-1 text-[var(--admin-text)]">{editing.authMethods.hasPassword ? "邮箱密码" : "未设置密码"}</dd></div>
              <div><dt className="text-xs text-[var(--admin-muted)]">最近登录</dt><dd className="mt-1 text-[var(--admin-text)]">{formatDate(editing.lastLoginAt)}</dd></div>
            </dl>}
          </section>

          <section className="admin-panel space-y-4 p-4 sm:p-5" aria-label="系统权限">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[var(--admin-text)]">系统角色与账号状态</h3>
              {canEdit && activeEditor !== "access" ? <button type="button" onClick={() => beginEdit("access")} className="admin-button admin-button--quiet admin-button--small">修改</button> : null}
            </div>
            {activeEditor === "access" ? <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void saveAccountPart("access"); }}>
              <label className="block text-xs text-[var(--admin-muted)]">系统角色<select required className="admin-field mt-1" value={draft.roleId} onChange={(event) => setDraft((current) => ({ ...current, roleId: event.target.value }))}>
                {roles.map((role) => <option key={role.id} value={role.id}>{role.displayName}</option>)}
              </select></label>
              <label className="block text-xs text-[var(--admin-muted)]">账号状态<select className="admin-field mt-1" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}><option value="1">启用</option><option value="0">停用</option></select></label>
              {editError("access")}
              <div className="flex gap-2"><button disabled={saving} type="submit" className="admin-button admin-button--primary admin-button--small">保存</button><button disabled={saving} type="button" onClick={() => setActiveEditor("")} className="admin-button admin-button--secondary admin-button--small">取消</button></div>
            </form> : <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-[var(--admin-muted)]">系统角色</dt><dd className="mt-1 text-[var(--admin-text)]">{editing.role.displayName}</dd></div>
              <div><dt className="text-xs text-[var(--admin-muted)]">账号状态</dt><dd className="mt-1 text-[var(--admin-text)]">{editing.status === 1 ? "启用" : "停用"}</dd></div>
            </dl>}
          </section>

          <section className="admin-panel space-y-3 p-4 sm:p-5" aria-label="密码管理">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[var(--admin-text)]">登录密码</h3>
              {canEdit && activeEditor !== "password" ? <button type="button" onClick={() => beginEdit("password")} className="admin-button admin-button--quiet admin-button--small">重置</button> : null}
            </div>
            {activeEditor === "password" ? <form className="space-y-3" onSubmit={(event) => void resetPassword(event)}>
              <label className="block text-xs text-[var(--admin-muted)]">新密码<input type="password" autoComplete="new-password" required minLength={8} className="admin-field mt-1" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
              {editError("password")}
              <div className="flex gap-2"><button disabled={saving} type="submit" className="admin-button admin-button--primary admin-button--small">确认重置</button><button disabled={saving} type="button" onClick={() => setActiveEditor("")} className="admin-button admin-button--secondary admin-button--small">取消</button></div>
            </form> : <p className="text-sm text-[var(--admin-muted)]">{editing.authMethods.hasPassword ? "已设置登录密码" : "未设置密码"}</p>}
          </section>
        </div> : null}

        {detailSection === "organization" ? <div className="space-y-5">
          <section className="admin-panel space-y-3 p-4 sm:p-5" aria-label="战队成员身份">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[var(--admin-text)]">战队成员身份</h3>
              {canEdit && activeEditor !== "identity" ? <button type="button" onClick={() => beginEdit("identity")} className="admin-button admin-button--quiet admin-button--small">修改</button> : null}
            </div>
            {activeEditor === "identity" ? <div className="space-y-3">
              <label className="block text-xs text-[var(--admin-muted)]">成员身份<select className="admin-field mt-1" value={teamIdentityDraft} onChange={(event) => setTeamIdentityDraft(event.target.value as TeamIdentityStatus)}>
                {teamIdentityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select></label>
              {editError("identity")}
              <div className="flex gap-2"><button disabled={saving || teamIdentityDraft === editing.teamIdentityStatus} type="button" className="admin-button admin-button--primary admin-button--small" onClick={() => void saveTeamIdentity()}>保存</button><button disabled={saving} type="button" className="admin-button admin-button--secondary admin-button--small" onClick={() => setActiveEditor("")}>取消</button></div>
            </div> : <p className="text-sm text-[var(--admin-text)]">{teamIdentityLabel(editing.teamIdentityStatus)}</p>}
          </section>
          <section className="admin-panel space-y-4 p-4 sm:p-5" aria-label="组别关系">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[var(--admin-text)]">组别与组内身份</h3>
              {canEdit && editing.groups.length <= 1 && activeEditor !== "group" ? <button type="button" className="admin-button admin-button--quiet admin-button--small" onClick={() => beginEdit("group")}>调整组别</button> : null}
            </div>
            {editing.groups.length ? <ul className="divide-y divide-[var(--admin-border-subtle)]">{editing.groups.map((group) => <li key={group.groupId} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0"><p className="text-sm font-medium text-[var(--admin-text)]">{group.name}{group.status === 1 ? "" : "（已停用）"}</p><p className="mt-1 text-xs text-[var(--admin-muted)]">{organizationTitleLabel(group.role)}</p></div>
              {canEdit && (activeEditor === "group-role:" + group.groupId ? <div className="w-full space-y-2 sm:w-auto">
                <label className="block text-xs text-[var(--admin-muted)]">组内身份<select className="admin-field mt-1" value={groupRoleDrafts[group.groupId] ?? String(group.role)} onChange={(event) => setGroupRoleDrafts((current) => ({ ...current, [group.groupId]: event.target.value }))}>
                  <option value="0">普通成员</option>{group.role === 1 ? <option value="1" disabled>历史组管理员（停用）</option> : null}<option value="2">组长</option>
                </select></label>
                {editError("group-role:" + group.groupId)}
                <div className="flex gap-2"><button disabled={saving || Number(groupRoleDrafts[group.groupId]) === group.role} type="button" className="admin-button admin-button--primary admin-button--small" onClick={() => void saveGroupRole(group.groupId)}>保存</button><button disabled={saving} type="button" className="admin-button admin-button--secondary admin-button--small" onClick={() => setActiveEditor("")}>取消</button></div>
              </div> : <button type="button" className="admin-button admin-button--quiet admin-button--small" onClick={() => beginEdit("group-role:" + group.groupId)}>修改身份</button>)}
            </li>)}</ul> : <p className="text-sm text-[var(--admin-muted)]">未分组</p>}
            {editing.groups.length > 1 ? <p className="text-xs text-[var(--admin-muted)]">当前保留多组关系。现有组别接口会替换全部关系，因此不能在此调整组别。</p> : null}
            {activeEditor === "group" ? <div className="space-y-3 border-t border-[var(--admin-border-subtle)] pt-3">
              <label className="block text-xs text-[var(--admin-muted)]">所属组别<select value={userGroupId} onChange={(event) => setUserGroupId(event.target.value)} className="admin-field mt-1">
                <option value="">未分组</option>{groupOptions.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select></label>
              {editError("group")}
              <div className="flex gap-2"><button disabled={saving || (editing.groups.length === 0 && !userGroupId) || (editing.groups.length === 1 && editing.groups[0].status === 1 && String(editing.groups[0].groupId) === userGroupId)} type="button" onClick={() => void saveUserGroup()} className="admin-button admin-button--primary admin-button--small">保存</button><button disabled={saving} type="button" onClick={() => setActiveEditor("")} className="admin-button admin-button--secondary admin-button--small">取消</button></div>
            </div> : null}
          </section>
        </div> : null}

        {detailSection === "records" ? <div className="space-y-5">
          <section className="admin-panel space-y-3 p-4 sm:p-5" aria-label="招新记录">
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[var(--admin-text)]">招新历史</h3><button type="button" onClick={() => navigate("/dashboard/admin/registrations")} className="admin-button admin-button--quiet admin-button--small">前往招新管理</button></div>
            {editing.recruitmentHistory.length ? <ul className="divide-y divide-[var(--admin-border-subtle)]">{editing.recruitmentHistory.map((record) => <li key={record.id} className="flex flex-wrap justify-between gap-2 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0"><p className="text-sm font-medium text-[var(--admin-text)]">{record.formTitle || "报名表 #" + record.formId}</p>
                <p className="mt-1 text-xs text-[var(--admin-muted)]">{recruitmentStatusLabel(record.recruitmentStatus)} · 意向组：{record.preferredGroup || "未设置"}</p>
              </div><time className="text-xs text-[var(--admin-dim)]">{formatDate(record.submittedAt)}</time>
            </li>)}</ul> : <p className="text-sm text-[var(--admin-muted)]">没有招新记录</p>}
          </section>
          {currentUser.role.name === "super_admin" ? <section className="admin-panel p-4 sm:p-5" aria-label="吉甲共建者">
            <CoBuilderBadgeAdminPanel userId={editing.id} onUpdated={() => void loadAccounts()} />
          </section> : null}
        </div> : null}
      </div> : null}

      {editingIsNew ? <ModalShell open title="新建账号" onClose={closeEditor} panelClassName="admin-panel" bodyClassName="p-4 sm:p-5" widthClass="max-w-md"
        footer={<div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={closeEditor} className="admin-button admin-button--secondary">取消</button><button type="submit" form="account-editor-form" disabled={saving} className="admin-button admin-button--primary">创建账号</button></div>}>
        <form id="account-editor-form" className="space-y-4" onSubmit={(event) => void submit(event)}>
          <label className="block text-xs text-[var(--admin-muted)]">真实姓名<input required maxLength={100} value={draft.realName} onChange={(event) => setDraft((current) => ({ ...current, realName: event.target.value }))} className="admin-field mt-1" /></label>
          <label className="block text-xs text-[var(--admin-muted)]">登录邮箱<input required type="email" maxLength={255} value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} className="admin-field mt-1" /></label>
          <label className="block text-xs text-[var(--admin-muted)]">系统角色<select required value={draft.roleId} onChange={(event) => setDraft((current) => ({ ...current, roleId: event.target.value }))} className="admin-field mt-1">{roles.map((role) => <option key={role.id} value={role.id}>{role.displayName}</option>)}</select></label>
          <label className="block text-xs text-[var(--admin-muted)]">初始密码<input required minLength={8} type="password" autoComplete="new-password" value={draft.password} onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))} className="admin-field mt-1" /></label>
        </form>
      </ModalShell> : null}
    </div>
  );
}
