import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";

import { ModalShell } from "~/components/modal-shell";
import { Notify } from "~/components/notify";
import { ApiError } from "~/lib/api-client";
import {
  createAdminUserGroup,
  listAdminUserGroups,
  updateAdminUserGroup,
  type AdminUserGroupListItem,
  type AdminUserGroupSummary,
  type ListAdminUserGroupsInput,
  type UpsertAdminUserGroupInput,
} from "~/lib/admin-user-groups-client";

type Flash = { tone: "success" | "error"; message: string } | null;
type GroupForm = UpsertAdminUserGroupInput;

const emptySummary: AdminUserGroupSummary = {
  total: 0,
  active: 0,
  disabled: 0,
};

const emptyForm: GroupForm = {
  name: "",
  description: "",
  tags: [],
  show: 1,
  status: 1,
};

export function meta() {
  return [
    { title: "招新组别 | TARSGO" },
    { name: "description", content: "配置候选人可选的招新意向组别" },
  ];
}

export function UserGroups() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<ListAdminUserGroupsInput["status"]>("");
  const [keyword, setKeyword] = useState("");
  const [groups, setGroups] = useState<AdminUserGroupListItem[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AdminUserGroupListItem | null>(null);
  const [form, setForm] = useState<GroupForm>(emptyForm);
  const [tagInput, setTagInput] = useState("");
  const [flash, setFlash] = useState<Flash>(null);

  async function loadGroups() {
    setLoading(true);
    try {
      const result = await listAdminUserGroups({ status: statusFilter });
      setGroups(result.items);
      setSummary(result.summary);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        navigate("/login", { replace: true });
      } else {
        setFlash({ tone: "error", message: getErrorMessage(error) });
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadGroups();
  }, [statusFilter]);

  const filteredGroups = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return groups;
    return groups.filter((group) =>
      [group.name, group.description ?? "", ...(group.tags ?? [])]
        .some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [groups, keyword]);

  function openCreate() {
    setEditingGroup(null);
    setForm(emptyForm);
    setTagInput("");
    setModalOpen(true);
  }

  function openEdit(group: AdminUserGroupListItem) {
    setEditingGroup(group);
    setForm({
      name: group.name,
      description: group.description ?? "",
      tags: group.tags ?? [],
      show: group.show,
      status: group.status,
    });
    setTagInput("");
    setModalOpen(true);
  }

  function addTags() {
    const additions = tagInput.split(/[\n,，]/).map((tag) => tag.trim()).filter(Boolean);
    if (additions.length) {
      setForm((current) => ({ ...current, tags: Array.from(new Set([...current.tags, ...additions])) }));
    }
    setTagInput("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFlash(null);
    const payload = { ...form, name: form.name.trim(), description: form.description?.trim() ?? "" };
    try {
      const result = editingGroup
        ? await updateAdminUserGroup(editingGroup.id, payload)
        : await createAdminUserGroup(payload);
      setModalOpen(false);
      setFlash({ tone: "success", message: `已保存招新组别：${result.name}` });
      await loadGroups();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        navigate("/login", { replace: true });
      } else {
        setFlash({ tone: "error", message: getErrorMessage(error) });
      }
    } finally {
      setSaving(false);
    }
  }

  async function updateGroup(group: AdminUserGroupListItem, changes: Partial<GroupForm>) {
    setFlash(null);
    try {
      const result = await updateAdminUserGroup(group.id, {
        name: group.name,
        description: group.description ?? "",
        tags: group.tags ?? [],
        show: changes.show ?? group.show,
        status: changes.status ?? group.status,
      });
      setFlash({ tone: "success", message: `已更新 ${result.name}` });
      await loadGroups();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        navigate("/login", { replace: true });
      } else {
        setFlash({ tone: "error", message: getErrorMessage(error) });
      }
    }
  }

  return (
    <div className="admin-design space-y-5">
      <Notify
        tone={flash?.tone ?? "success"}
        title={flash?.tone === "error" ? "操作失败" : "操作成功"}
        message={flash?.message ?? ""}
        open={flash !== null}
        onClose={() => setFlash(null)}
      />

      <header className="admin-page-header flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="admin-eyebrow">吉甲 · 招新设置</div>
          <h2 className="admin-page-title">招新组别</h2>
          <p className="admin-page-description">维护候选人报名可选的意向组。停用组别会保留已有报名和历史记录。</p>
        </div>
        <button type="button" onClick={openCreate} className="admin-button admin-button--primary">新建组别</button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="招新组别概况">
        <Summary label="全部组别" value={summary.total} />
        <Summary label="已启用" value={summary.active} />
        <Summary label="已停用" value={summary.disabled} />
      </section>

      <section className="admin-filter-panel grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <input
          aria-label="搜索招新组别"
          className="admin-field"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索组别名称、描述或标签"
        />
        <select aria-label="筛选组别状态" className="admin-field" value={String(statusFilter ?? "")} onChange={(event) => setStatusFilter(event.target.value === "" ? "" : Number(event.target.value))}>
          <option value="">全部状态</option>
          <option value="1">已启用</option>
          <option value="0">已停用</option>
        </select>
      </section>

      <section className="admin-panel overflow-hidden" aria-label="招新组别列表">
        {loading ? <div className="admin-table-empty">正在加载组别…</div> : filteredGroups.length === 0 ? (
          <div className="admin-table-empty">{keyword.trim() ? "没有匹配的组别。" : "暂无招新组别。"}</div>
        ) : (
          <div className="divide-y divide-[var(--admin-border-subtle)]">
            {filteredGroups.map((group) => (
              <article key={group.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-[var(--admin-text)]">{group.name}</h3>
                    <span className={`admin-status ${group.status === 1 ? "admin-status--success" : "admin-status--muted"}`}>{group.status === 1 ? "启用" : "停用"}</span>
                    <span className="admin-status admin-status--muted">{group.show === 1 ? "报名页展示" : "报名页隐藏"}</span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--admin-muted)]">{group.description?.trim() || "暂无描述"}</p>
                  {group.tags?.length ? <div className="mt-2 flex flex-wrap gap-1.5">{group.tags.map((tag) => <span key={tag} className="admin-badge">{tag}</span>)}</div> : null}
                </div>
                <div className="flex flex-wrap gap-2 sm:shrink-0">
                  <button type="button" onClick={() => openEdit(group)} className="admin-button admin-button--secondary admin-button--small">编辑</button>
                  <button type="button" onClick={() => void updateGroup(group, { status: group.status === 1 ? 0 : 1 })} className="admin-button admin-button--quiet admin-button--small">{group.status === 1 ? "停用" : "启用"}</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <ModalShell open={modalOpen} title={editingGroup ? "编辑招新组别" : "新建招新组别"} onClose={() => setModalOpen(false)} panelClassName="admin-design admin-panel" bodyClassName="p-5" widthClass="max-w-2xl">
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm text-[var(--admin-muted)]">组别名称<input required maxLength={100} className="admin-field mt-1" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="block text-sm text-[var(--admin-muted)]">说明<textarea maxLength={500} className="admin-field mt-1 min-h-24" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
          <div className="space-y-2">
            <label className="block text-sm text-[var(--admin-muted)]">标签（逗号分隔）</label>
            <div className="flex gap-2"><input className="admin-field" value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addTags(); } }} placeholder="例如：机械、控制" /><button type="button" onClick={addTags} className="admin-button admin-button--secondary">添加</button></div>
            {form.tags.length ? <div className="flex flex-wrap gap-2">{form.tags.map((tag) => <button key={tag} type="button" onClick={() => setForm((current) => ({ ...current, tags: current.tags.filter((item) => item !== tag) }))} className="admin-badge" aria-label={`移除标签 ${tag}`}>{tag} ×</button>)}</div> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-[var(--admin-muted)]">状态<select className="admin-field mt-1" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: Number(event.target.value) }))}><option value={1}>启用</option><option value={0}>停用</option></select></label>
            <label className="block text-sm text-[var(--admin-muted)]">报名页<select className="admin-field mt-1" value={form.show} onChange={(event) => setForm((current) => ({ ...current, show: Number(event.target.value) }))}><option value={1}>展示</option><option value={0}>隐藏</option></select></label>
          </div>
          <div className="flex justify-end gap-2 border-t border-[var(--admin-border-subtle)] pt-4"><button type="button" onClick={() => setModalOpen(false)} disabled={saving} className="admin-button admin-button--secondary">取消</button><button type="submit" disabled={saving} className="admin-button admin-button--primary">{saving ? "保存中…" : "保存"}</button></div>
        </form>
      </ModalShell>
    </div>
  );
}

export default UserGroups;

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="admin-panel px-4 py-3"><div className="text-xs text-[var(--admin-muted)]">{label}</div><strong className="mt-1 block text-xl text-[var(--admin-text)]">{value}</strong></div>;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试。";
}
