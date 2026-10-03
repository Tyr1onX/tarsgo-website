import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useOutletContext, useSearchParams } from "react-router";

import { AnimatedSelect } from "~/components/animated-select";
import { ModalShell } from "~/components/modal-shell";
import { Notify } from "~/components/notify";
import { listAdminUserGroupOptions, listAdminUserGroups, type AdminUserGroupListItem } from "~/lib/admin-user-groups-client";
import { ApiError } from "~/lib/api-client";
import {
  createAdminAnnouncement,
  deleteAdminAnnouncement,
  listAdminAnnouncements,
  updateAdminAnnouncement,
  type AnnouncementCategory,
  type AnnouncementInput,
  type AnnouncementStatus,
  type PortalAnnouncement,
  type PortalAudienceType,
  listManagedPortalGroups,
} from "~/lib/portal-client";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { PortalEventManager } from "./portal-event-manager";
import { PortalLinkManager } from "./portal-link-manager";

export function meta() {
  return [{ title: "队务管理 | TARS-GO 管理后台" }, { name: "description", content: "管理主页公告、日程和快捷链接" }];
}

type TabKey = "announcements" | "events" | "links";
type Flash = { type: "success" | "error"; message: string } | null;

const emptyForm: AnnouncementInput = {
  title: "", summary: "", content: "", category: "team", status: "draft", isPinned: false,
  publishAt: null, expireAt: null, audienceType: "all", targetGroupIds: [],
};

const statusOptions = [
  { value: "", label: "全部状态" }, { value: "draft", label: "草稿" },
  { value: "published", label: "已发布" }, { value: "archived", label: "已归档" },
];
const categoryOptions = [
  { value: "competition", label: "赛事" }, { value: "training", label: "训练" },
  { value: "team", label: "团队" }, { value: "system", label: "系统" },
];

function datetimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function toRFC3339(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function announcementForm(item: PortalAnnouncement): AnnouncementInput {
  return {
    title: item.title, summary: item.summary, content: item.content, category: item.category,
    status: item.status, isPinned: item.isPinned, publishAt: item.publishAt,
    expireAt: item.expireAt, audienceType: item.audienceType, targetGroupIds: item.targetGroupIds,
  };
}

export default function PortalContentPage() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const isSuperAdmin = currentUser.role.name === "super_admin";
  const hasGlobalPortalAccess = isSuperAdmin || (currentUser.role.name === "admin" && currentUser.adminScope === "global");
  const tab: TabKey = rawTab === "events" || rawTab === "links" ? rawTab : "announcements";
  const [items, setItems] = useState<PortalAnnouncement[]>([]);
  const [groups, setGroups] = useState<AdminUserGroupListItem[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<PortalAnnouncement | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<PortalAnnouncement | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [form, setForm] = useState<AnnouncementInput>(emptyForm);
  const [flash, setFlash] = useState<Flash>(null);

  useEffect(() => {
    if (!rawTab || !["announcements", "events", "links"].includes(rawTab)) {
      navigate("/dashboard/admin/portal-content?tab=announcements", { replace: true });
    }
  }, [isSuperAdmin, navigate, rawTab]);

  async function load() {
    setLoading(true);
    try {
      const [announcements, groupItems] = await Promise.all([
        listAdminAnnouncements(filter),
        isSuperAdmin
          ? listAdminUserGroups({ status: 1 }).then((result) => result.items)
          : hasGlobalPortalAccess
            ? listAdminUserGroupOptions().then((items) => items.filter((item) => item.status === 1).map((item) => ({ id: item.id, name: item.name, status: item.status } as AdminUserGroupListItem)))
            : listManagedPortalGroups(),
      ]);
      setItems(announcements.items);
      setGroups(groupItems);
    } catch (error) {
      setFlash({ type: "error", message: error instanceof ApiError ? error.message : "加载门户内容失败" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [filter, hasGlobalPortalAccess, isSuperAdmin]);

  const selectedGroups = useMemo(() => new Set(form.targetGroupIds), [form.targetGroupIds]);

  function openCreate() {
    setForm(hasGlobalPortalAccess ? emptyForm : { ...emptyForm, audienceType: "groups" });
    setEditing(null);
  }

  function openEdit(item: PortalAnnouncement) {
    setForm(announcementForm(item));
    setEditing(item);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, publishAt: form.publishAt ? toRFC3339(datetimeLocal(form.publishAt)) : null, expireAt: form.expireAt ? toRFC3339(datetimeLocal(form.expireAt)) : null };
      if (editing) await updateAdminAnnouncement(editing.id, payload);
      else await createAdminAnnouncement(payload);
      setEditing(undefined);
      setFlash({ type: "success", message: editing ? "公告已更新" : "公告已创建" });
      await load();
    } catch (error) {
      setFlash({ type: "error", message: error instanceof ApiError ? error.message : "保存公告失败" });
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await deleteAdminAnnouncement(deleting.id);
      setDeleting(null);
      setFlash({ type: "success", message: "公告已删除" });
      await load();
    } catch (error) {
      setFlash({ type: "error", message: error instanceof ApiError ? error.message : "删除公告失败" });
    } finally {
      setDeletingBusy(false);
    }
  }

  if (currentUser.role.name !== "super_admin" && currentUser.role.name !== "admin") return null;

  return (
    <div className="space-y-6">
      {flash && <Notify tone={flash.type} title={flash.type === "success" ? "操作成功" : "操作失败"} message={flash.message} onClose={() => setFlash(null)} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-bold">队务管理</h1><p className="mt-1 text-sm text-gray-400">配置队员主页展示内容</p></div>
      </div>
      <div className="flex gap-2 border-b border-white/[0.06]">
        {(["announcements", "events", "links"] as TabKey[]).map((key) => (
          <button key={key} type="button" onClick={() => navigate(`/dashboard/admin/portal-content?tab=${key}`)} className={`border-b-2 px-4 py-3 text-sm ${tab === key ? "border-primary-500 text-primary-400" : "border-transparent text-gray-400"}`}>
            {key === "announcements" ? "公告" : key === "events" ? "日程" : "快捷链接"}
          </button>
        ))}
      </div>
      {tab === "events" ? <PortalEventManager groups={groups} managedOnly={!hasGlobalPortalAccess} notify={(type, message) => setFlash({ type, message })} /> : tab === "links" ? <PortalLinkManager groups={groups} managedOnly={!hasGlobalPortalAccess} notify={(type, message) => setFlash({ type, message })} /> : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4"><div className="w-48"><AnimatedSelect value={filter} onChange={setFilter} options={statusOptions} size="compact" /></div><button type="button" onClick={openCreate} className="btn-gradient rounded-xl px-4 py-2 text-sm font-medium text-white">新建公告</button></div>
          <div className="overflow-hidden glass-panel rounded-2xl">
            {loading ? <div className="space-y-3 p-5">{[1, 2, 3].map((key) => <div key={key} className="h-16 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div> : items.length === 0 ? (
              <div className="p-12 text-center text-gray-400">暂无公告</div>
            ) : items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-4 last:border-0">
                <div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate font-medium">{item.title}</h2>{item.isPinned && <span className="rounded bg-primary-500/10 px-2 py-0.5 text-xs text-primary-400">置顶</span>}</div><p className="mt-1 line-clamp-1 text-sm text-gray-400">{item.summary}</p><p className="mt-1 text-xs text-gray-500">{statusOptions.find((option) => option.value === item.status)?.label} · {item.audienceType === "all" ? "全员可见" : "指定组可见"}</p></div>
                <div className="flex gap-2"><button type="button" onClick={() => openEdit(item)} className="btn-glass rounded-xl px-3 py-1.5 text-sm">编辑</button><button type="button" onClick={() => setDeleting(item)} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-500/20">删除</button></div>
              </div>
            ))}
          </div>
          {!loading && <button type="button" onClick={() => void load()} className="text-sm text-primary-400 hover:text-primary-300">重新加载</button>}
        </div>
      )}
      {editing !== undefined && (
        <ModalShell open title={editing ? "编辑公告" : "新建公告"} description="所有时间按北京时间填写" onClose={() => setEditing(undefined)} widthClass="max-w-3xl">
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm text-gray-300">标题<input required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5" /></label>
            <label className="block text-sm text-gray-300">摘要（留空自动生成）<textarea maxLength={500} value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5" /></label>
            <label className="block text-sm text-gray-300">正文<textarea required rows={7} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5" /></label>
            <div className="grid gap-4 sm:grid-cols-2"><div><span className="mb-1 block text-sm text-gray-300">分类</span><AnimatedSelect value={form.category} onChange={(value) => setForm({ ...form, category: value as AnnouncementCategory })} options={categoryOptions} /></div><div><span className="mb-1 block text-sm text-gray-300">状态</span><AnimatedSelect value={form.status} onChange={(value) => setForm({ ...form, status: value as AnnouncementStatus })} options={statusOptions.slice(1)} /></div></div>
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm text-gray-300">发布时间<input type="datetime-local" value={datetimeLocal(form.publishAt)} onChange={(event) => setForm({ ...form, publishAt: toRFC3339(event.target.value) })} className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5" /></label><label className="text-sm text-gray-300">失效时间<input type="datetime-local" value={datetimeLocal(form.expireAt)} onChange={(event) => setForm({ ...form, expireAt: toRFC3339(event.target.value) })} className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5" /></label></div>
            <div className="flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={form.isPinned} onChange={(event) => setForm({ ...form, isPinned: event.target.checked })} />置顶</label>{hasGlobalPortalAccess && <label className="flex items-center gap-2"><input type="radio" checked={form.audienceType === "all"} onChange={() => setForm({ ...form, audienceType: "all", targetGroupIds: [] })} />全员可见</label>}<label className="flex items-center gap-2"><input type="radio" checked={form.audienceType === "groups"} onChange={() => setForm({ ...form, audienceType: "groups" })} />{hasGlobalPortalAccess ? "指定组可见" : "本组可见"}</label></div>
            {form.audienceType === "groups" && <div className="grid gap-2 sm:grid-cols-2">{groups.map((group) => <label key={group.id} className="flex items-center gap-2 rounded-xl border border-white/[0.06] p-3 text-sm"><input type="checkbox" checked={selectedGroups.has(group.id)} onChange={(event) => setForm({ ...form, targetGroupIds: event.target.checked ? [...form.targetGroupIds, group.id] : form.targetGroupIds.filter((id) => id !== group.id) })} />{group.name}</label>)}</div>}
            <div className="flex justify-end gap-3"><button type="button" onClick={() => setEditing(undefined)} className="btn-glass rounded-xl px-4 py-2 text-sm">取消</button><button disabled={saving} className="btn-gradient rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50">{saving ? "保存中…" : "保存"}</button></div>
          </form>
        </ModalShell>
      )}
      {deleting && (
        <ModalShell
          open
          title="删除公告"
          description="删除后，该公告将不再显示在默认列表和队员主页中。"
          onClose={() => { if (!deletingBusy) setDeleting(null); }}
          widthClass="max-w-md"
        >
          <div className="space-y-5">
            <p className="text-sm text-gray-300">确定删除公告“{deleting.title}”吗？此操作会软删除该公告。</p>
            <div className="flex justify-end gap-3">
              <button type="button" disabled={deletingBusy} onClick={() => setDeleting(null)} className="btn-glass rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">取消</button>
              <button type="button" disabled={deletingBusy} onClick={() => void confirmRemove()} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-300 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50">{deletingBusy ? "删除中…" : "确认删除"}</button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
