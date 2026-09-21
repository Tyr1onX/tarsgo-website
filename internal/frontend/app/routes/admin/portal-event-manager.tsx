import { useEffect, useMemo, useState, type FormEvent } from "react";

import { AnimatedSelect } from "~/components/animated-select";
import { ModalShell } from "~/components/modal-shell";
import type { AdminUserGroupListItem } from "~/lib/admin-user-groups-client";
import { ApiError } from "~/lib/api-client";
import { createAdminEvent, deleteAdminEvent, listAdminEvents, updateAdminEvent, type EventInput, type PortalEvent } from "~/lib/portal-client";

const statuses = [{ value: "", label: "全部状态" }, { value: "draft", label: "草稿" }, { value: "published", label: "已发布" }, { value: "cancelled", label: "已取消" }];
const emptyEvent: EventInput = { title: "", description: "", location: "", startsAt: "", endsAt: "", status: "draft", audienceType: "all", targetGroupIds: [] };

function localInput(value: string) {
  if (!value) return "";
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

function apiInput(value: string) { return new Date(value).toISOString(); }

export function PortalEventManager({ groups, managedOnly = false, notify }: { groups: AdminUserGroupListItem[]; managedOnly?: boolean; notify: (type: "success" | "error", message: string) => void }) {
  const [items, setItems] = useState<PortalEvent[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PortalEvent | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<PortalEvent | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [form, setForm] = useState<EventInput>(emptyEvent);
  const [saving, setSaving] = useState(false);
  const selectedGroups = useMemo(() => new Set(form.targetGroupIds), [form.targetGroupIds]);

  async function load() {
    setLoading(true);
    try { setItems((await listAdminEvents(filter)).items); }
    catch (error) { notify("error", error instanceof ApiError ? error.message : "加载日程失败"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [filter]);

  function edit(item: PortalEvent) {
    setForm({ title: item.title, description: item.description, location: item.location, startsAt: item.startsAt, endsAt: item.endsAt, status: item.status, audienceType: item.audienceType, targetGroupIds: item.targetGroupIds });
    setEditing(item);
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const payload = { ...form, startsAt: apiInput(localInput(form.startsAt)), endsAt: apiInput(localInput(form.endsAt)) };
      if (editing) await updateAdminEvent(editing.id, payload); else await createAdminEvent(payload);
      notify("success", editing ? "日程已更新" : "日程已创建"); setEditing(undefined); await load();
    } catch (error) { notify("error", error instanceof ApiError ? error.message : "保存日程失败"); }
    finally { setSaving(false); }
  }

  async function confirmRemove() {
    if (!deleting) return;
    setDeletingBusy(true);
    try { await deleteAdminEvent(deleting.id); setDeleting(null); notify("success", "日程已删除"); await load(); }
    catch (error) { notify("error", error instanceof ApiError ? error.message : "删除日程失败"); }
    finally { setDeletingBusy(false); }
  }

  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-4"><div className="w-48"><AnimatedSelect value={filter} onChange={setFilter} options={statuses} size="compact" /></div><button type="button" onClick={() => { setForm(managedOnly ? { ...emptyEvent, audienceType: "groups" } : emptyEvent); setEditing(null); }} className="btn-gradient rounded-xl px-4 py-2 text-sm font-medium">新建日程</button></div>
    <div className="overflow-hidden glass-panel rounded-2xl">{loading ? <div className="space-y-3 p-5">{[1, 2, 3].map((key) => <div key={key} className="h-16 animate-pulse rounded-2xl bg-white/[0.04]" />)}</div> : items.length === 0 ? <div className="p-12 text-center text-gray-400">暂无日程</div> : items.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-4 last:border-0"><div><h2 className="font-medium">{item.title}</h2><p className="mt-1 text-sm text-gray-400">{new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(new Date(item.startsAt))} · {item.location || "地点待定"}</p><p className="mt-1 text-xs text-gray-500">{statuses.find((status) => status.value === item.status)?.label} · {item.audienceType === "all" ? "全员可见" : "指定组可见"}</p></div><div className="flex gap-2"><button type="button" onClick={() => edit(item)} className="btn-glass rounded-xl px-3 py-1.5 text-sm">编辑</button><button type="button" onClick={() => setDeleting(item)} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-500/20">删除</button></div></div>)}</div>
    {editing !== undefined && <ModalShell open title={editing ? "编辑日程" : "新建日程"} description="时间按北京时间显示；结束时间必须晚于开始时间" onClose={() => setEditing(undefined)}><form onSubmit={submit} className="space-y-4"><label className="block text-sm">标题<input required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5" /></label><label className="block text-sm">说明<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5" /></label><label className="block text-sm">地点<input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">开始时间（北京时间）<input required type="datetime-local" value={localInput(form.startsAt)} onChange={(event) => setForm({ ...form, startsAt: apiInput(event.target.value) })} className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5" /></label><label className="text-sm">结束时间（北京时间）<input required type="datetime-local" value={localInput(form.endsAt)} onChange={(event) => setForm({ ...form, endsAt: apiInput(event.target.value) })} className="mt-1 w-full rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2.5" /></label></div><AnimatedSelect value={form.status} onChange={(value) => setForm({ ...form, status: value as EventInput["status"] })} options={statuses.slice(1)} /><div className="flex gap-5 text-sm">{!managedOnly && <label><input type="radio" checked={form.audienceType === "all"} onChange={() => setForm({ ...form, audienceType: "all", targetGroupIds: [] })} /> 全员可见</label>}<label><input type="radio" checked={form.audienceType === "groups"} onChange={() => setForm({ ...form, audienceType: "groups" })} /> {managedOnly ? "本组可见" : "指定组可见"}</label></div>{form.audienceType === "groups" && <div className="grid gap-2 sm:grid-cols-2">{groups.map((group) => <label key={group.id} className="rounded-xl border border-white/[0.06] p-3 text-sm"><input type="checkbox" checked={selectedGroups.has(group.id)} onChange={(event) => setForm({ ...form, targetGroupIds: event.target.checked ? [...form.targetGroupIds, group.id] : form.targetGroupIds.filter((id) => id !== group.id) })} /> {group.name}</label>)}</div>}<div className="flex justify-end gap-3"><button type="button" onClick={() => setEditing(undefined)} className="btn-glass rounded-xl px-4 py-2 text-sm">取消</button><button disabled={saving} className="btn-gradient rounded-xl px-4 py-2 text-sm disabled:opacity-50">{saving ? "保存中…" : "保存"}</button></div></form></ModalShell>}
    {deleting && <ModalShell open title="删除日程" description="删除后，该日程将不再显示在默认列表和队员主页中。" onClose={() => { if (!deletingBusy) setDeleting(null); }} widthClass="max-w-md"><div className="space-y-5"><p className="text-sm text-gray-300">确定删除日程“{deleting.title}”吗？此操作会软删除该日程。</p><div className="flex justify-end gap-3"><button type="button" disabled={deletingBusy} onClick={() => setDeleting(null)} className="btn-glass rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50">取消</button><button type="button" disabled={deletingBusy} onClick={() => void confirmRemove()} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-300 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50">{deletingBusy ? "删除中…" : "确认删除"}</button></div></div></ModalShell>}
  </div>;
}
