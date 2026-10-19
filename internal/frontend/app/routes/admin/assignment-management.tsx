import { useEffect, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";

import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { assignmentClient, formatAssignmentDate, type Assignment, type AssignmentInput, type AssignmentMemberOption } from "~/lib/assignment-client";
import { hasTechnicalGroupAccess } from "~/lib/dashboard-navigation";

export function meta() {
  return [{ title: "作业管理 | TARSGO" }];
}

type Draft = Omit<AssignmentInput, "dueAt"> & { dueAt: string };

const emptyDraft: Draft = { groupId: 0, title: "", description: "", dueAt: "", attachmentRequirements: "", isGroupWide: true, targetUserIds: [] };
const fieldClass = "admin-field w-full";

function localShanghaiDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function requestInput(draft: Draft): AssignmentInput {
  return { ...draft, dueAt: `${draft.dueAt}:00+08:00`, targetUserIds: draft.targetUserIds };
}

function asDraft(item: Assignment): Draft {
  return {
    groupId: item.groupId,
    title: item.title,
    description: item.description,
    dueAt: localShanghaiDateTime(item.dueAt),
    attachmentRequirements: item.attachmentRequirements,
    isGroupWide: item.isGroupWide,
    targetUserIds: [],
  };
}

export default function AssignmentManagementRoute() {
  const { currentUser, groupResolution } = useOutletContext<DashboardLayoutOutletContext>();
  const technicalGroups = (groupResolution?.groups ?? []).filter((group) => hasTechnicalGroupAccess([group]));
  const [groupId, setGroupId] = useState(0);
  const [items, setItems] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<AssignmentMemberOption[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setItems([]);
    setMembers([]);
    setEditing(null);
    setGroupId((current) => technicalGroups.some((group) => group.groupId === current) ? current : technicalGroups[0]?.groupId ?? 0);
  }, [currentUser.id, groupResolution]);

  useEffect(() => {
    if (!groupId) return;
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([assignmentClient.listAdmin(groupId), assignmentClient.listGroupMembers(groupId)])
      .then(([assignments, groupMembers]) => {
        if (!active) return;
        setItems(assignments);
        setMembers(groupMembers);
        setDraft((current) => ({ ...current, groupId }));
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "作业数据加载失败");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [groupId, currentUser.id]);

  function resetDraft() {
    setEditing(null);
    setDraft({ ...emptyDraft, groupId });
  }

  function editAssignment(item: Assignment) {
    setEditing(item);
    setDraft(asDraft(item));
    setError("");
    setNotice("");
    if (!item.isGroupWide) {
      void assignmentClient.getAdmin(item.id).then((detail) => {
        setDraft((current) => ({ ...current, targetUserIds: detail.members.map((member) => member.userId) }));
      }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "作业成员加载失败"));
    }
  }

  function toggleMember(userId: number) {
    setDraft((current) => ({
      ...current,
      targetUserIds: current.targetUserIds.includes(userId)
        ? current.targetUserIds.filter((id) => id !== userId)
        : [...current.targetUserIds, userId],
    }));
  }

  async function refresh() {
    if (!groupId) return;
    const [assignments, groupMembers] = await Promise.all([assignmentClient.listAdmin(groupId), assignmentClient.listGroupMembers(groupId)]);
    setItems(assignments);
    setMembers(groupMembers);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const input = requestInput({ ...draft, groupId });
      if (editing) await assignmentClient.update(editing.id, input);
      else await assignmentClient.create(input);
      setNotice(editing ? "作业已更新。" : "作业已发布。");
      resetDraft();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存作业失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-design space-y-5" aria-labelledby="assignment-management-title">
      <header className="admin-page-header flex flex-wrap items-center justify-between gap-3">
        <h1 id="assignment-management-title" className="admin-page-title">作业管理</h1>
        {technicalGroups.length > 1 ? <label className="admin-field-label">技术组<select className="admin-field w-full" value={groupId} onChange={(event) => { setGroupId(Number(event.target.value)); resetDraft(); }}>
          {technicalGroups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
        </select></label> : technicalGroups[0] ? <p className="text-sm text-[var(--admin-muted)]">{technicalGroups[0].name}</p> : null}
      </header>
      {error ? <div role="alert" className="admin-notice admin-notice--error">{error}</div> : null}
      {notice ? <div role="status" className="admin-notice admin-notice--success">{notice}</div> : null}

      <section className="admin-panel space-y-4 p-4 sm:p-5" aria-labelledby="assignment-editor-title">
        <div className="admin-section-heading"><h2 id="assignment-editor-title">{editing ? "编辑作业" : "发布作业"}</h2>{editing ? <button type="button" className="admin-button admin-button--quiet" onClick={resetDraft}>取消编辑</button> : null}</div>
        <form onSubmit={save} className="grid gap-3 md:grid-cols-2">
          <label className="admin-field-label">标题<input className={fieldClass} required maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label className="admin-field-label">截止时间（北京时间）<input className={fieldClass} type="datetime-local" required value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} /></label>
          <label className="admin-field-label md:col-span-2">作业说明<textarea className={fieldClass} required rows={4} maxLength={10000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <label className="admin-field-label md:col-span-2">附件要求<input className={fieldClass} maxLength={2000} value={draft.attachmentRequirements} onChange={(event) => setDraft({ ...draft, attachmentRequirements: event.target.value })} /></label>
          <fieldset className="space-y-2 md:col-span-2">
            <legend className="admin-field-label">作业对象</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2"><input type="radio" name="assignment-target" checked={draft.isGroupWide} onChange={() => setDraft({ ...draft, isGroupWide: true, targetUserIds: [] })} />全组成员</label>
              <label className="inline-flex items-center gap-2"><input type="radio" name="assignment-target" checked={!draft.isGroupWide} onChange={() => setDraft({ ...draft, isGroupWide: false })} />指定成员</label>
            </div>
            {!draft.isGroupWide ? <div className="grid max-h-48 gap-2 overflow-y-auto rounded-xl border border-[var(--admin-border-subtle)] p-3 sm:grid-cols-2 lg:grid-cols-3">
              {members.map((member) => <label key={member.userId} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.targetUserIds.includes(member.userId)} onChange={() => toggleMember(member.userId)} />{member.name}</label>)}
              {members.length === 0 ? <p className="text-sm text-[var(--admin-muted)]">当前组暂无可分配成员。</p> : null}
            </div> : null}
          </fieldset>
          <div className="flex flex-wrap gap-2 md:col-span-2"><button type="submit" className="admin-button admin-button--primary" disabled={saving || !groupId || (!draft.isGroupWide && draft.targetUserIds.length === 0)}>{saving ? "保存中…" : editing ? "保存修改" : "发布作业"}</button></div>
        </form>
      </section>

      <section className="admin-panel p-4 sm:p-5" aria-labelledby="assignment-list-title">
        <div className="admin-section-heading"><h2 id="assignment-list-title">本组作业</h2></div>
        {loading ? <p role="status" className="py-4 text-sm text-[var(--admin-muted)]">正在加载…</p> : null}
        {!loading && items.length === 0 ? <p className="py-4 text-sm text-[var(--admin-muted)]">暂无已发布作业。</p> : null}
        <div className="divide-y divide-[var(--admin-border-subtle)]">{items.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0"><h3 className="truncate text-sm font-medium text-white">{item.title}</h3><p className="mt-1 text-xs text-[var(--admin-muted)]">截止 {formatAssignmentDate(item.dueAt)} · {item.isGroupWide ? "全组" : `${item.targetCount} 人`} · 已提交 {item.submittedCount}/{item.targetCount} · 已通过 {item.passedCount}</p></div>
          <div className="flex gap-2"><a href={`/dashboard/admin/training/submissions?assignmentId=${item.id}`} className="admin-button admin-button--secondary">提交记录</a><button type="button" className="admin-button admin-button--quiet" disabled={item.submittedCount > 0} onClick={() => editAssignment(item)}>{item.submittedCount > 0 ? "已有提交" : "编辑"}</button></div>
        </article>)}</div>
      </section>
    </section>
  );
}
