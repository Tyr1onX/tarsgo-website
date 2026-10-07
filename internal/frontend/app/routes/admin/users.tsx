import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";

import { ModalShell } from "~/components/modal-shell";
import { ApiError } from "~/lib/api-client";
import {
  createAdminUser,
  getAdminUser,
  listAdminRoles,
  listAdminUsers,
  resetAdminUserPassword,
  updateAdminUser,
  updateAdminUserRecruitmentGroup,
  type AdminUserDetail,
  type AdminUserListItem,
  type AdminUserRoleOption,
  type AdminUserSummary,
} from "~/lib/admin-users-client";
import { listAdminUserGroupOptions, type AdminUserGroupOption } from "~/lib/admin-user-groups-client";

export function meta() {
  return [{ title: "账号与权限 | TARS-GO" }, { name: "description", content: "管理招新账号、系统角色和访问状态" }];
}

type AccountDraft = {
  name: string;
  email: string;
  roleId: string;
  status: string;
  password: string;
};

const emptyDraft: AccountDraft = { name: "", email: "", roleId: "", status: "1", password: "" };
const emptySummary: AdminUserSummary = { total: 0, enabled: 0, disabled: 0, admins: 0 };

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

export default function AccountManagement() {
  const navigate = useNavigate();
  const [roles, setRoles] = useState<AdminUserRoleOption[]>([]);
  const [groupOptions, setGroupOptions] = useState<AdminUserGroupOption[]>([]);
  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<AdminUserDetail | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);
  const [preferredGroupId, setPreferredGroupId] = useState("");
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [resetTarget, setResetTarget] = useState<AdminUserListItem | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetting, setResetting] = useState(false);

  async function loadRoles() {
    try {
      const [result, groups] = await Promise.all([listAdminRoles(), listAdminUserGroupOptions()]);
      setRoles(result.filter((role) => role.editableByCurrentActor));
      setGroupOptions(groups.filter((group) => group.status === 1));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) navigate("/login", { replace: true });
      else setError(cause instanceof Error ? cause.message : "账号角色加载失败");
    }
  }

  async function loadAccounts(nextPage = page) {
    setLoading(true);
    setError("");
    try {
      const result = await listAdminUsers({
        page: nextPage,
        pageSize: 20,
        keyword,
        role: roleFilter,
        status: statusFilter === "" ? "" : Number(statusFilter),
      });
      setItems(result.items);
      setSummary(result.summary);
      setTotalPages(Math.max(1, result.pagination.totalPages));
      setPage(result.pagination.page);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) navigate("/login", { replace: true });
      else setError(cause instanceof Error ? cause.message : "账号列表加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadRoles(); }, []);
  useEffect(() => { void loadAccounts(1); }, [keyword, roleFilter, statusFilter]);

  function openCreate() {
    setEditing(null);
    setEditingIsNew(true);
    setDraft({ ...emptyDraft, roleId: String(roles.find((role) => role.name === "user")?.id ?? roles[0]?.id ?? "") });
    setError("");
  }

  async function openEdit(item: AdminUserListItem) {
    setError("");
    try {
      const detail = await getAdminUser(item.id);
      setEditing(detail);
      setEditingIsNew(false);
      setDraft({ name: detail.name, email: detail.email, roleId: String(detail.role.id), status: String(detail.status), password: "" });
      setPreferredGroupId(detail.currentRecruitmentGroupId == null ? "" : String(detail.currentRecruitmentGroupId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "账号详情加载失败");
    }
  }

  function closeEditor() {
    setEditing(null);
    setEditingIsNew(false);
    setDraft(emptyDraft);
    setPreferredGroupId("");
  }

  async function savePreferredGroup() {
    if (!editing || !preferredGroupId) return;
    setSaving(true);
    setError("");
    try {
      const detail = await updateAdminUserRecruitmentGroup(editing.id, Number(preferredGroupId));
      setEditing(detail);
      setPreferredGroupId(detail.currentRecruitmentGroupId == null ? "" : String(detail.currentRecruitmentGroupId));
      setNotice("当届招新意向组已修正。");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) navigate("/login", { replace: true });
      else setError(cause instanceof Error ? cause.message : "意向组修正失败");
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const selectedRole = roles.find((role) => role.id === Number(draft.roleId));
      if (!selectedRole) throw new Error("请选择系统角色");
      if (editingIsNew) {
        await createAdminUser({
          name: draft.name.trim(),
          email: draft.email.trim(),
          password: draft.password,
          roleId: selectedRole.id,
        });
        setNotice("账号已创建。");
      } else if (editing) {
        await updateAdminUser(editing.id, {
          name: draft.name.trim(),
          email: draft.email.trim(),
          roleId: selectedRole.id,
          status: Number(draft.status),
        });
        setNotice("账号信息已保存。");
      }
      closeEditor();
      await loadAccounts();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) navigate("/login", { replace: true });
      else setError(cause instanceof Error ? cause.message : "账号保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function submitPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetTarget) return;
    setResetting(true);
    setError("");
    try {
      await resetAdminUserPassword(resetTarget.id, newPassword);
      setNotice(`已重置 ${resetTarget.email} 的密码。`);
      setResetTarget(null);
      setNewPassword("");
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) navigate("/login", { replace: true });
      else setError(cause instanceof Error ? cause.message : "密码重置失败");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="admin-design admin-users space-y-5">
      <header className="admin-page-header">
        <div className="admin-eyebrow">吉甲 · 系统管理</div>
        <h1 className="admin-page-title">账号与权限</h1>
        <p className="admin-page-description">搜索所有账号，处理角色、启停、密码、特殊账号和招新记录；队内成员生命周期由 TARS Base 管理。</p>
      </header>

      {error ? <div role="alert" className="admin-notice admin-notice--error">{error}</div> : null}
      {notice ? <div role="status" className="admin-notice admin-notice--success">{notice}</div> : null}

      <div className="admin-users__summary" aria-label="账号概况">
        <span>账号 <strong>{summary.total}</strong></span>
        <span>启用 <strong>{summary.enabled}</strong></span>
        <span>停用 <strong>{summary.disabled}</strong></span>
        <span>管理员 <strong>{summary.admins}</strong></span>
      </div>

      <section className="admin-filter-panel">
        <div className="admin-filter-grid sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs text-[var(--admin-muted)]">搜索账号<input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="姓名或邮箱" className="admin-field mt-1" /></label>
          <label className="text-xs text-[var(--admin-muted)]">系统角色<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="admin-field mt-1"><option value="">全部角色</option>{roles.map((role) => <option key={role.id} value={role.name}>{role.displayName}</option>)}</select></label>
          <label className="text-xs text-[var(--admin-muted)]">账号状态<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="admin-field mt-1"><option value="">全部状态</option><option value="1">启用</option><option value="0">停用</option></select></label>
          <div className="admin-filter-actions flex items-end"><button type="button" onClick={openCreate} className="admin-button admin-button--primary w-full">新建账号</button></div>
        </div>
      </section>

      <section className="admin-panel overflow-hidden" aria-label="账号列表">
        {loading ? <div role="status" className="admin-table-empty">正在加载账号…</div> : items.length === 0 ? <div className="admin-table-empty">没有符合条件的账号。</div> : (
          <div className="overflow-x-auto">
            <table className="admin-table admin-table--users">
              <thead><tr><th>账号</th><th>系统角色</th><th>状态</th><th>登录方式 · 最近登录</th><th className="text-right">操作</th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="admin-table-row">
                    <td><div className="font-medium text-[var(--admin-text)]">{item.name || "未设置名称"}</div><div className="mt-0.5 truncate text-xs text-[var(--admin-muted)]">{item.email}</div></td>
                    <td><span className={`admin-role ${item.role.name === "user" ? "" : "admin-role--elevated"}`}>{item.role.displayName}</span></td>
                    <td><span className={`admin-status ${item.status === 1 ? "admin-status--account-enabled" : "admin-status--account-disabled"}`}>{item.status === 1 ? "启用" : "停用"}</span></td>
                    <td><div className="text-xs text-[var(--admin-muted)]">{item.authMethods.hasPassword ? "邮箱密码" : "未设置密码"}</div><div className="mt-0.5 text-xs text-[var(--admin-dim)]">{formatDate(item.lastLoginAt)}</div></td>
                    <td><div className="admin-operation-group justify-end"><button type="button" onClick={() => void openEdit(item)} className="admin-button admin-button--secondary admin-button--small">编辑账号</button><button type="button" onClick={() => setResetTarget(item)} className="admin-button admin-button--quiet admin-button--small">重置密码</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--admin-border-subtle)] px-4 py-3 text-xs text-[var(--admin-muted)]">
          <span>第 {page} / {totalPages} 页</span>
          <div className="admin-operation-group"><button type="button" disabled={page <= 1 || loading} onClick={() => void loadAccounts(page - 1)} className="admin-button admin-button--secondary admin-button--small">上一页</button><button type="button" disabled={page >= totalPages || loading} onClick={() => void loadAccounts(page + 1)} className="admin-button admin-button--secondary admin-button--small">下一页</button></div>
        </div>
      </section>

      {editingIsNew || editing ? (
        <ModalShell open title={editingIsNew ? "新建账号" : "账号详情与权限"} description="处理账号访问权限，并核对该账号的招新意向与历史报名记录。" onClose={closeEditor} panelClassName="admin-panel" bodyClassName="p-5" widthClass="max-w-3xl">
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-xs text-[var(--admin-muted)]">显示名称<input required maxLength={100} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="admin-field mt-1" /></label>
            <label className="block text-xs text-[var(--admin-muted)]">登录邮箱<input required type="email" maxLength={255} value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} className="admin-field mt-1" /></label>
            <label className="block text-xs text-[var(--admin-muted)]">系统角色<select required value={draft.roleId} onChange={(event) => setDraft((current) => ({ ...current, roleId: event.target.value }))} className="admin-field mt-1">{roles.map((role) => <option key={role.id} value={role.id}>{role.displayName}</option>)}</select></label>
            {editingIsNew ? <label className="block text-xs text-[var(--admin-muted)]">初始密码<input required minLength={8} type="password" autoComplete="new-password" value={draft.password} onChange={(event) => setDraft((current) => ({ ...current, password: event.target.value }))} className="admin-field mt-1" /></label> : <label className="block text-xs text-[var(--admin-muted)]">账号状态<select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className="admin-field mt-1"><option value="1">启用</option><option value="0">停用</option></select></label>}
            {!editingIsNew && editing ? (
              <div className="space-y-4 border-t border-[var(--admin-border-subtle)] pt-4">
                <section className="space-y-2" aria-label="实名资料">
                  <h3 className="text-sm font-semibold text-[var(--admin-text)]">实名资料</h3>
                  <p className="text-xs text-[var(--admin-muted)]">真实姓名：{editing.realName || "未填写"} · 手机号：{editing.phone || "未填写"}</p>
                </section>
                <section className="space-y-2" aria-label="当届招新意向组">
                  <h3 className="text-sm font-semibold text-[var(--admin-text)]">当届招新意向组</h3>
                  {editing.currentRecruitmentGroupId == null ? <p className="text-xs text-[var(--admin-muted)]">该账号没有当前届报名记录，或当前没有进行中的招新。</p> : (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="min-w-48 flex-1 text-xs text-[var(--admin-muted)]">修正意向组<select value={preferredGroupId} onChange={(event) => setPreferredGroupId(event.target.value)} className="admin-field mt-1">{groupOptions.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
                      <button type="button" disabled={saving || !preferredGroupId || Number(preferredGroupId) === editing.currentRecruitmentGroupId} onClick={() => void savePreferredGroup()} className="admin-button admin-button--secondary admin-button--small">{saving ? "保存中…" : "保存意向组"}</button>
                    </div>
                  )}
                </section>
                <section className="space-y-2" aria-label="历史报名记录">
                  <h3 className="text-sm font-semibold text-[var(--admin-text)]">历史报名记录</h3>
                  {editing.recruitmentHistory.length === 0 ? <p className="text-xs text-[var(--admin-muted)]">没有报名记录。</p> : (
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {editing.recruitmentHistory.map((record) => <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--admin-border-subtle)] px-3 py-2 text-xs">
                        <div><strong className="text-[var(--admin-text)]">{record.formTitle || `报名表 #${record.formId}`}</strong><div className="mt-1 text-[var(--admin-muted)]">{record.formStatus === 1 ? "当前届" : record.formStatus === 2 ? "历史届" : "未发布"} · {recruitmentStatusLabel(record.recruitmentStatus)} · 意向组：{record.preferredGroup || "未设置"}</div></div>
                        <time className="text-[var(--admin-dim)]">{formatDate(record.submittedAt)}</time>
                      </div>)}
                    </div>
                  )}
                </section>
              </div>
            ) : null}
            {error ? <div role="alert" className="admin-notice admin-notice--error">{error}</div> : null}
            <div className="flex justify-end gap-2 border-t border-[var(--admin-border-subtle)] pt-4"><button type="button" onClick={closeEditor} disabled={saving} className="admin-button admin-button--secondary">取消</button><button type="submit" disabled={saving} className="admin-button admin-button--primary">{saving ? "保存中…" : editingIsNew ? "创建账号" : "保存修改"}</button></div>
          </form>
        </ModalShell>
      ) : null}

      {resetTarget ? (
        <ModalShell open title="重置登录密码" description={`为 ${resetTarget.email} 设置新密码。`} onClose={() => { if (!resetting) { setResetTarget(null); setNewPassword(""); } }} panelClassName="admin-panel" bodyClassName="p-5" widthClass="max-w-md">
          <form onSubmit={submitPasswordReset} className="space-y-4">
            <label className="block text-xs text-[var(--admin-muted)]">新密码<input required minLength={8} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="admin-field mt-1" /></label>
            {error ? <div role="alert" className="admin-notice admin-notice--error">{error}</div> : null}
            <div className="flex justify-end gap-2 border-t border-[var(--admin-border-subtle)] pt-4"><button type="button" onClick={() => setResetTarget(null)} disabled={resetting} className="admin-button admin-button--secondary">取消</button><button type="submit" disabled={resetting} className="admin-button admin-button--secondary">{resetting ? "重置中…" : "确认重置"}</button></div>
          </form>
        </ModalShell>
      ) : null}
    </div>
  );
}
