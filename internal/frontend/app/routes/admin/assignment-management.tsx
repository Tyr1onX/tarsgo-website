import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";

import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { ApiError } from "~/lib/api-client";
import { assignmentClient, formatAssignmentDate, type Assignment, type AssignmentInput, type AssignmentMaterialFile, type AssignmentMemberOption } from "~/lib/assignment-client";
import {
  assignmentDeadlineForShortcut,
  assignmentDeadlineIsFuture,
  assignmentDeadlineShortcuts,
  assignmentDeadlineToISOString,
  shanghaiDateTimeLocal,
  type AssignmentDeadlineShortcut,
} from "~/lib/assignment-deadline";
import { assignmentMaterialAccept, formatAssignmentMaterialSize, validateAssignmentMaterialSelection } from "~/lib/assignment-materials";
import { filterAssignmentMembers, toggleAssignmentMemberSelection } from "~/lib/assignment-member-selection";
import { useAssignmentGroups } from "~/lib/use-assignment-groups";

export function meta() {
  return [{ title: "作业管理 | TARSGO" }];
}

type Draft = Omit<AssignmentInput, "dueAt"> & { dueAt: string };

const emptyDraft = (groupId: number): Draft => ({
  groupId,
  title: "",
  description: "",
  dueAt: assignmentDeadlineForShortcut(new Date(), 7),
  attachmentRequirements: "",
  isGroupWide: true,
  targetUserIds: [],
});
const fieldClass = "admin-field w-full";

function requestInput(draft: Draft): AssignmentInput {
  const dueAt = assignmentDeadlineToISOString(draft.dueAt);
  if (!dueAt || !assignmentDeadlineIsFuture(draft.dueAt, new Date())) {
    throw new Error("截止时间必须晚于当前北京时间。");
  }
  return { ...draft, dueAt, targetUserIds: draft.targetUserIds };
}

function asDraft(item: Assignment): Draft {
  return {
    groupId: item.groupId,
    title: item.title,
    description: item.description,
    dueAt: shanghaiDateTimeLocal(item.dueAt),
    attachmentRequirements: item.attachmentRequirements,
    isGroupWide: item.isGroupWide,
    targetUserIds: [],
  };
}

export default function AssignmentManagementRoute() {
  const { currentUser, groupResolution } = useOutletContext<DashboardLayoutOutletContext>();
  const { technicalGroups, error: groupError, loading: groupsLoading } = useAssignmentGroups(currentUser.id, currentUser.role.name, groupResolution?.groups);
  const [groupId, setGroupId] = useState(0);
  const [items, setItems] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<AssignmentMemberOption[]>([]);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(0));
  const [quickDeadline, setQuickDeadline] = useState<AssignmentDeadlineShortcut | null>("seven-days");
  const [memberSearch, setMemberSearch] = useState("");
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [existingMaterials, setExistingMaterials] = useState<AssignmentMaterialFile[]>([]);
  const [pendingMaterials, setPendingMaterials] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [publishStage, setPublishStage] = useState<"idle" | "saving" | "uploading" | "failed">("idle");
  const [publishCanCancel, setPublishCanCancel] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const materialInputRef = useRef<HTMLInputElement | null>(null);
  const publishRequestID = useRef<string | null>(null);
  const activePublishCancel = useRef<(() => void) | null>(null);
  const editRequestID = useRef(0);
  const filteredMembers = useMemo(() => filterAssignmentMembers(members, memberSearch), [members, memberSearch]);
  const selectedMembers = useMemo(() => members.filter((member) => draft.targetUserIds.includes(member.userId)), [members, draft.targetUserIds]);

  useEffect(() => {
    setItems([]);
    setMembers([]);
    setEditing(null);
    const nextGroupID = technicalGroups.some((group) => group.groupId === groupId) ? groupId : technicalGroups[0]?.groupId ?? 0;
    setGroupId(nextGroupID);
    setDraft(emptyDraft(nextGroupID));
    setQuickDeadline("seven-days");
    setExistingMaterials([]);
    setPendingMaterials([]);
    editRequestID.current += 1;
  }, [currentUser.id, groupId, groupResolution, technicalGroups]);

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

  function resetDraft(nextGroupID = groupId) {
    editRequestID.current += 1;
    setEditing(null);
    setDraft(emptyDraft(nextGroupID));
    setQuickDeadline("seven-days");
    setMemberSearch("");
    setExistingMaterials([]);
    setPendingMaterials([]);
    setLoadingEdit(false);
    setUploadProgress(null);
    setPublishStage("idle");
    setPublishCanCancel(false);
    publishRequestID.current = null;
    activePublishCancel.current = null;
  }

  function editAssignment(item: Assignment) {
    const activeRequest = ++editRequestID.current;
    setEditing(item);
    setDraft(asDraft(item));
    setQuickDeadline(null);
    setExistingMaterials([]);
    setPendingMaterials([]);
    setError("");
    setNotice("");
    setLoadingEdit(true);
    void assignmentClient.getAdmin(item.id).then((detail) => {
      if (editRequestID.current !== activeRequest) return;
      setDraft((current) => ({ ...current, targetUserIds: detail.members.map((member) => member.userId) }));
      setExistingMaterials(detail.assignment.materialFiles ?? []);
    }).catch((cause: unknown) => {
      if (editRequestID.current === activeRequest) setError(cause instanceof Error ? cause.message : "作业资料加载失败");
    }).finally(() => {
      if (editRequestID.current === activeRequest) setLoadingEdit(false);
    });
  }

  function toggleMember(userId: number) {
    setDraft((current) => ({
      ...current,
      targetUserIds: toggleAssignmentMemberSelection(current.targetUserIds, userId),
    }));
  }

  function updateDeadline(value: string) {
    setDraft((current) => ({ ...current, dueAt: value }));
    setQuickDeadline(null);
  }

  async function refresh() {
    if (!groupId) return;
    setItems(await assignmentClient.listAdmin(groupId));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const input = requestInput({ ...draft, groupId });
      const wasEditing = Boolean(editing);
      const uploadingMaterials = pendingMaterials.length > 0;

      if (!wasEditing && uploadingMaterials) {
        setPublishStage("saving");
        setPublishCanCancel(false);
        if (!publishRequestID.current) publishRequestID.current = crypto.randomUUID();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        setPublishStage("uploading");
        setUploadProgress(0);
        const request = assignmentClient.publishWithMaterials(
          input,
          pendingMaterials,
          publishRequestID.current,
          setUploadProgress,
          () => setPublishStage("uploading"),
        );
        activePublishCancel.current = request.cancel;
        try {
          const result = await request.promise;
          activePublishCancel.current = null;
          setItems((current) => [result.assignment, ...current.filter((item) => item.id !== result.assignment.id)]);
          setExistingMaterials(result.materialFiles);
          setPendingMaterials([]);
          setNotice("作业及教学资料已完整发布。");
          resetDraft();
          try {
            await refresh();
          } catch (cause) {
            const detail = cause instanceof Error ? cause.message : "请重新加载页面。";
            setError(`作业已完整发布，但列表刷新失败：${detail}；作业仍显示在当前列表中。`);
          }
          return;
        } catch (cause) {
          activePublishCancel.current = null;
          setPublishStage("failed");
          const status = cause instanceof ApiError ? cause.status : 0;
          const definitelyNotPublished = status >= 400 && status < 500 && status !== 409;
          setPublishCanCancel(definitelyNotPublished);
          const detail = cause instanceof Error ? cause.message : "请重试发布。";
          setError(definitelyNotPublished
            ? `发布失败，作业未开放给成员：${detail} 可使用相同资料重试，或取消发布。`
            : `发布结果待确认：${detail} 请使用相同资料安全重试，以核对是否已完成发布。`);
          return;
        } finally {
          setUploadProgress(null);
        }
      }

      const saved = editing
        ? await assignmentClient.update(editing.id, input)
        : await assignmentClient.create(input);
      setItems((current) => wasEditing
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...current.filter((item) => item.id !== saved.id)]);
      if (!wasEditing && pendingMaterials.length > 0) setEditing(saved);
      if (pendingMaterials.length > 0) {
        setUploadProgress(0);
        try {
          const materialFiles = await assignmentClient.uploadMaterialFiles(saved.id, pendingMaterials, setUploadProgress);
          setExistingMaterials(materialFiles);
          setPendingMaterials([]);
          setEditing(saved);
        } catch (cause) {
          const detail = cause instanceof Error ? cause.message : "请稍后重试。";
          setEditing(saved);
          setError(`作业已保存，教学资料上传失败：${detail} 可在当前表单重试。`);
          return;
        } finally {
          setUploadProgress(null);
        }
      }
      setNotice(uploadingMaterials ? "作业及教学资料已保存。" : wasEditing ? "作业已更新。" : "作业已发布。");
      resetDraft();
      try {
        await refresh();
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : "请重新加载页面。";
        setError(`作业已保存，但列表刷新失败：${detail}；已保存的作业仍显示在当前列表中。`);
      }
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
        {groupsLoading ? <p role="status" className="text-sm text-[var(--admin-muted)]">正在加载技术组…</p> : technicalGroups.length > 1 ? <label className="admin-field-label">技术组<select className="admin-field w-full" value={groupId} disabled={saving || publishStage !== "idle"} onChange={(event) => { const nextGroupID = Number(event.target.value); setGroupId(nextGroupID); resetDraft(nextGroupID); }}>
          {technicalGroups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
        </select></label> : technicalGroups[0] ? <p className="text-sm text-[var(--admin-muted)]">{technicalGroups[0].name}</p> : null}
      </header>
      {groupError ? <div role="alert" className="admin-notice admin-notice--error">{groupError}</div> : null}
      {error ? <div role="alert" className="admin-notice admin-notice--error">{error}</div> : null}
      {notice ? <div role="status" className="admin-notice admin-notice--success">{notice}</div> : null}

      <section className="admin-panel space-y-4 p-4 sm:p-5" aria-labelledby="assignment-editor-title">
        <div className="admin-section-heading"><h2 id="assignment-editor-title">{editing ? "编辑作业" : "发布作业"}</h2>{editing ? <button type="button" className="admin-button admin-button--quiet" onClick={() => resetDraft()}>取消编辑</button> : null}</div>
        <form onSubmit={save} className="grid gap-3 md:grid-cols-2">
          <label className="admin-field-label">标题<input className={fieldClass} required maxLength={120} disabled={saving || publishStage !== "idle"} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <div className="space-y-2">
            <label className="admin-field-label">截止时间（北京时间）<input className={fieldClass} type="datetime-local" required disabled={saving || publishStage !== "idle"} value={draft.dueAt} onInput={(event) => updateDeadline(event.currentTarget.value)} onChange={(event) => updateDeadline(event.currentTarget.value)} /></label>
            <div className="flex flex-wrap gap-2" aria-label="快捷截止时间">
              {assignmentDeadlineShortcuts.map((shortcut) => <button key={shortcut.id} type="button" disabled={saving || publishStage !== "idle"} className={`admin-button ${quickDeadline === shortcut.id ? "admin-button--secondary" : "admin-button--quiet"}`} aria-pressed={quickDeadline === shortcut.id} onClick={() => { setDraft((current) => ({ ...current, dueAt: assignmentDeadlineForShortcut(new Date(), shortcut.days) })); setQuickDeadline(shortcut.id); }}>{shortcut.label}</button>)}
            </div>
          </div>
          <label className="admin-field-label md:col-span-2">作业说明<textarea className={fieldClass} required rows={4} maxLength={10000} disabled={saving || publishStage !== "idle"} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <label className="admin-field-label md:col-span-2">附件要求<input className={fieldClass} maxLength={2000} disabled={saving || publishStage !== "idle"} value={draft.attachmentRequirements} onChange={(event) => setDraft({ ...draft, attachmentRequirements: event.target.value })} /></label>
          <section className="space-y-3 md:col-span-2" aria-labelledby="assignment-materials-title">
            <h3 id="assignment-materials-title" className="text-sm font-semibold text-white">教学资料附件</h3>
            <input ref={materialInputRef} className="admin-field w-full" type="file" multiple accept={assignmentMaterialAccept} disabled={saving || publishStage !== "idle" || loadingEdit || Boolean(editing && editing.submittedCount > 0)} onChange={(event) => {
              const incoming = Array.from(event.currentTarget.files ?? []);
              const validationError = validateAssignmentMaterialSelection(existingMaterials, pendingMaterials, incoming);
              if (validationError) setError(validationError);
              else { setPendingMaterials((current) => [...current, ...incoming]); setError(""); }
              event.currentTarget.value = "";
            }} />
            {existingMaterials.length > 0 ? <ul className="divide-y divide-[var(--admin-border-subtle)] rounded-lg border border-[var(--admin-border-subtle)] px-3">
              {existingMaterials.map((file) => <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <a className="min-w-0 break-all text-amber-300 hover:text-amber-200" href={file.downloadUrl}>{file.fileName}</a>
                <span className="flex items-center gap-2 text-xs text-[var(--admin-muted)]">{formatAssignmentMaterialSize(file.size)}<button type="button" className="admin-button admin-button--quiet" aria-label={`移除${file.fileName}`} disabled={saving || loadingEdit || Boolean(editing?.submittedCount)} onClick={() => {
                  if (!editing) return;
                  setSaving(true);
                  setError("");
                  void assignmentClient.removeMaterialFile(editing.id, file.id).then(setExistingMaterials).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "移除教学资料失败")).finally(() => setSaving(false));
                }}>移除</button></span>
              </li>)}
            </ul> : null}
            {pendingMaterials.length > 0 ? <ul className="divide-y divide-[var(--admin-border-subtle)] rounded-lg border border-[var(--admin-border-subtle)] px-3" aria-label="待上传教学资料">
              {pendingMaterials.map((file, index) => <li key={`${file.name}-${file.size}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span className="min-w-0 break-all">{file.name}</span><span className="flex items-center gap-2 text-xs text-[var(--admin-muted)]">{formatAssignmentMaterialSize(file.size)}<button type="button" className="admin-button admin-button--quiet" aria-label={`移除待上传${file.name}`} disabled={saving} onClick={() => setPendingMaterials((current) => current.filter((_, currentIndex) => currentIndex !== index))}>移除</button></span></li>)}
            </ul> : null}
            {uploadProgress !== null ? <div role="status" className="space-y-1 text-xs text-[var(--admin-muted)]"><div className="flex justify-between"><span>正在上传教学资料</span><span>{uploadProgress}%</span></div><progress className="h-2 w-full accent-amber-400" max={100} value={uploadProgress} /></div> : null}
            {editing?.submittedCount ? <p className="text-xs text-[var(--admin-muted)]">已有成员提交，教学资料已锁定。</p> : null}
          </section>
          <fieldset className="space-y-2 md:col-span-2">
            <legend className="admin-field-label">作业对象</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2"><input type="radio" name="assignment-target" disabled={saving || publishStage !== "idle" || Boolean(editing && !editing.isGroupWide)} checked={draft.isGroupWide} onChange={() => setDraft({ ...draft, isGroupWide: true, targetUserIds: [] })} />全组成员</label>
              <label className="inline-flex items-center gap-2"><input type="radio" name="assignment-target" disabled={saving || publishStage !== "idle"} checked={!draft.isGroupWide} onChange={() => setDraft({ ...draft, isGroupWide: false })} />指定成员</label>
            </div>
            {!draft.isGroupWide ? <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="assignment-member-search">搜索组内成员</label>
                <input id="assignment-member-search" type="search" disabled={saving || publishStage !== "idle"} className="admin-field min-w-48 flex-1" autoComplete="off" placeholder="搜索成员姓名" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} />
                {memberSearch ? <button type="button" disabled={saving || publishStage !== "idle"} className="admin-button admin-button--quiet" onClick={() => setMemberSearch("")}>清空搜索</button> : null}
                <span className="text-sm text-[var(--admin-muted)]">已选 {draft.targetUserIds.length} 人</span>
              </div>
              {selectedMembers.length > 0 ? <div className="flex flex-wrap gap-1" aria-label="已选成员">
                {selectedMembers.map((member) => <button key={member.userId} type="button" disabled={saving || publishStage !== "idle"} className="rounded-full border border-[var(--admin-border-subtle)] px-2 py-1 text-xs text-[var(--admin-muted)] hover:text-white" aria-label={`取消选择${member.name}`} onClick={() => toggleMember(member.userId)}>× {member.name}</button>)}
              </div> : null}
              <div className="grid max-h-48 gap-2 overflow-y-auto rounded-xl border border-[var(--admin-border-subtle)] p-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredMembers.map((member) => <label key={member.userId} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={saving || publishStage !== "idle"} checked={draft.targetUserIds.includes(member.userId)} onChange={() => toggleMember(member.userId)} />{member.name}</label>)}
                {filteredMembers.length === 0 ? <p className="text-sm text-[var(--admin-muted)]">{memberSearch ? "没有匹配成员。" : "当前组暂无可分配成员。"}</p> : null}
              </div>
            </div> : null}
          </fieldset>
          <div className="flex flex-wrap gap-2 md:col-span-2"><button type="submit" className="admin-button admin-button--primary" disabled={saving || loadingEdit || !groupId || (!draft.isGroupWide && draft.targetUserIds.length === 0)}>{saving ? publishStage === "saving" ? "保存作业信息中…" : uploadProgress === null ? "正在上传教学资料…" : `正在上传教学资料 ${uploadProgress}%` : editing ? "保存修改" : publishStage === "failed" ? "重试发布" : "发布作业"}</button>{saving && publishStage === "uploading" ? <button type="button" className="admin-button admin-button--quiet" onClick={() => activePublishCancel.current?.()}>停止上传</button> : null}{publishStage === "failed" && publishCanCancel ? <button type="button" className="admin-button admin-button--quiet" onClick={() => { setError(""); resetDraft(); }}>取消发布</button> : null}</div>
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
