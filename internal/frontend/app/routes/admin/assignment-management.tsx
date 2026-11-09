import { BrandLoader } from "~/components/brand-loader";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";

import { FileUploadField, type FileUploadStatus } from "~/components/file-upload-field";
import { WorkbenchFeatureStatus } from "~/components/workbench-feature-status";
import { Notify } from "~/components/notify";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { ApiError } from "~/lib/api-client";
import { assignmentClient, assignmentPublicationStatusLabel, formatAssignmentDate, type Assignment, type AssignmentInput, type AssignmentMaterialFile, type AssignmentMemberOption } from "~/lib/assignment-client";
import {
  assignmentDeadlineForShortcut,
  assignmentDeadlineIsFuture,
  assignmentDeadlineShortcuts,
  assignmentDeadlineToISOString,
  shanghaiDateTimeLocal,
  type AssignmentDeadlineShortcut,
} from "~/lib/assignment-deadline";
import { formatAssignmentMaterialSize, validateAssignmentMaterialSelection } from "~/lib/assignment-materials";
import { filterAssignmentMembers, toggleAssignmentMemberSelection } from "~/lib/assignment-member-selection";
import { useAssignmentGroups } from "~/lib/use-assignment-groups";
import "./assignment-management.css";

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
  const { assignmentGroups, error: groupError, loading: groupsLoading } = useAssignmentGroups(currentUser.id, currentUser.role.name, groupResolution?.groups);
  const [groupId, setGroupId] = useState(0);
  const [items, setItems] = useState<Assignment[]>([]);
  const [members, setMembers] = useState<AssignmentMemberOption[]>([]);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(0));
  const [quickDeadline, setQuickDeadline] = useState<AssignmentDeadlineShortcut | null>("seven-days");
  const [memberSearch, setMemberSearch] = useState("");
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [existingMaterials, setExistingMaterials] = useState<AssignmentMaterialFile[]>([]);
  const [pendingMaterials, setPendingMaterials] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [materialsUploadStatus, setMaterialsUploadStatus] = useState<FileUploadStatus>("pending");
  const [publishStage, setPublishStage] = useState<"idle" | "saving" | "uploading" | "failed">("idle");
  const [publishCanCancel, setPublishCanCancel] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reconcileProgress, setReconcileProgress] = useState("");
  const publishRequestID = useRef<string | null>(null);
  const activePublishCancel = useRef<(() => void) | null>(null);
  const editRequestID = useRef(0);
  const filteredMembers = useMemo(() => filterAssignmentMembers(members, memberSearch), [members, memberSearch]);
  const selectedMembers = useMemo(() => members.filter((member) => draft.targetUserIds.includes(member.userId)), [members, draft.targetUserIds]);
  const lastTargetedAssignment = items.find((item) => !item.isGroupWide);

  useEffect(() => {
    setGroupId((current) => assignmentGroups.some((group) => group.groupId === current)
      ? current : assignmentGroups[0]?.groupId ?? 0);
  }, [assignmentGroups]);

  useEffect(() => {
    if (!groupId) return;
    let active = true;
    setLoading(true);
    setError("");
    setItems([]);
    setMembers([]);
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
    setComposerOpen(false);
    setDraft(emptyDraft(nextGroupID));
    setQuickDeadline("seven-days");
    setMemberSearch("");
    setExistingMaterials([]);
    setPendingMaterials([]);
    setMaterialsUploadStatus("pending");
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
    setComposerOpen(true);
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

  async function usePreviousRecipients() {
    if (!lastTargetedAssignment) return;
    setError("");
    try {
      const detail = await assignmentClient.getAdmin(lastTargetedAssignment.id);
      const currentIDs = new Set(members.map((member) => member.userId));
      const selected = detail.members.map((member) => member.userId).filter((id) => currentIDs.has(id));
      if (selected.length === 0) {
        setError("上次指定的成员已不在当前组，请重新选择。");
        return;
      }
      setDraft((current) => current.groupId === groupId && !current.isGroupWide
        ? { ...current, targetUserIds: selected } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取上次指定成员失败");
    }
  }

  function updateDeadline(value: string) {
    setDraft((current) => ({ ...current, dueAt: value }));
    setQuickDeadline(null);
  }

  async function refresh() {
    if (!groupId) return;
    setItems(await assignmentClient.listAdmin(groupId));
  }

  async function reconcileFeishuBoard() {
    if (!window.confirm("从网站重新核对当前管理员有权管理的全部作业和提交历史，并修复飞书看板。可能需要几分钟，不会修改网站成绩。继续吗？")) return;
    setReconciling(true);
    setError("");
    setNotice("");
    setReconcileProgress("正在读取网站作业和提交记录…");
    try {
      const assignments = await assignmentClient.listAdmin();
      const targets: { assignmentId: number; memberId: number }[] = [];
      let failed = 0;
      for (const item of assignments) {
        try {
          const detail = await assignmentClient.getAdmin(item.id);
          for (const member of detail.members) {
            if (member.latestSubmission) targets.push({ assignmentId: item.id, memberId: member.userId });
          }
        } catch {
          failed++;
        }
      }

      let created = 0;
      let updated = 0;
      for (let index = 0; index < targets.length; index++) {
        const target = targets[index];
        setReconcileProgress(`正在修复飞书看板 ${index + 1}/${targets.length}…`);
        try {
          const result = await assignmentClient.reconcileBitable(target.assignmentId, target.memberId);
          created += result.created;
          updated += result.updated;
          failed += result.failed;
        } catch {
          failed++;
        }
      }
      const summary = `飞书看板对账完成：新增 ${created} 条、更新 ${updated} 条；失败 ${failed} 项。`;
      if (failed > 0) setError(summary);
      else setNotice(summary);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "飞书看板对账失败");
    } finally {
      setReconciling(false);
      setReconcileProgress("");
    }
  }

  async function changePublicationStatus(item: Assignment, status: "published" | "withdrawn") {
    const action = status === "withdrawn" ? "撤回" : "重新发布";
    const message = status === "withdrawn"
      ? `确定撤回「${item.title}」？成员将不能继续提交，历史记录会保留。`
      : `确定重新发布「${item.title}」？历史记录保留；全组作业继续按当前成员生效。`;
    if (!window.confirm(message)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const updated = await assignmentClient.setPublicationStatus(item.id, status);
      setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
      setNotice(status === "withdrawn" ? "作业已撤回，历史记录已保留。" : "作业已重新发布。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${action}作业失败`);
    } finally { setSaving(false); }
  }

  async function deleteAssignment(item: Assignment) {
    if (!item.canDelete || !window.confirm(`确定永久删除「${item.title}」？仅删除没有提交、审核、技能关联及成长依据的作业。`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await assignmentClient.delete(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setNotice("无历史记录的作业已删除。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除作业失败");
    } finally { setSaving(false); }
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
        setMaterialsUploadStatus("uploading");
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
          setMaterialsUploadStatus("pending");
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
          setMaterialsUploadStatus("failed");
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
        setMaterialsUploadStatus("uploading");
        try {
          const materialFiles = await assignmentClient.uploadMaterialFiles(saved.id, pendingMaterials, setUploadProgress);
          setExistingMaterials(materialFiles);
          setPendingMaterials([]);
          setMaterialsUploadStatus("pending");
          setEditing(saved);
        } catch (cause) {
          setMaterialsUploadStatus("failed");
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
    <section className="admin-design assignment-management space-y-5" aria-labelledby="assignment-management-title">
      <header className="admin-page-header assignment-management__header flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2"><h1 id="assignment-management-title" className="admin-page-title">作业管理</h1><WorkbenchFeatureStatus feature="assignments" /></div>
        <div className="assignment-management__header-actions">
        {groupsLoading ? <BrandLoader label="正在加载组别" size="sm" /> : assignmentGroups.length > 1 ? <label className="admin-field-label assignment-management__group-select">组别<select className="admin-field w-full" value={groupId} disabled={saving || publishStage !== "idle"} onChange={(event) => { const nextGroupID = Number(event.target.value); setGroupId(nextGroupID); resetDraft(nextGroupID); }}>
          {assignmentGroups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
        </select></label> : assignmentGroups[0] ? <p className="text-sm text-[var(--admin-muted)]">{assignmentGroups[0].name}</p> : null}
        <button type="button" className="admin-button admin-button--quiet" onClick={() => void reconcileFeishuBoard()} disabled={reconciling || saving || publishStage !== "idle" || Boolean(groupError)}>{reconciling ? "正在对账…" : "修复飞书看板"}</button>
        {!composerOpen ? <button type="button" className="admin-button admin-button--primary" onClick={() => { resetDraft(); setComposerOpen(true); }} disabled={!groupId || Boolean(groupError)}>发布作业</button> : null}
        </div>
      </header>
      {groupError ? <div role="alert" className="admin-notice admin-notice--error">{groupError}</div> : null}
      {error ? <div role="alert" className="admin-notice admin-notice--error">{error}</div> : null}
      {reconcileProgress ? <div role="status" aria-live="polite" className="admin-notice">{reconcileProgress}</div> : null}
      {notice ? <Notify tone="success" message={notice} onClose={() => setNotice("")} /> : null}

      {composerOpen ? <section className="admin-panel assignment-editor" aria-labelledby="assignment-editor-title">
        <div className="admin-section-heading"><h2 id="assignment-editor-title">{editing ? "编辑作业" : "发布作业"}</h2><button type="button" className="admin-button admin-button--quiet admin-button--small" onClick={() => resetDraft()} disabled={saving}>取消</button></div>
        <form onSubmit={save} className="assignment-editor__form">
          <label className="admin-field-label assignment-editor__title">标题<input className={fieldClass} required maxLength={120} disabled={saving || publishStage !== "idle"} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <div className="assignment-editor__deadline">
            <label className="admin-field-label">截止时间（北京时间）<input className={fieldClass} type="datetime-local" required disabled={saving || publishStage !== "idle"} value={draft.dueAt} onInput={(event) => updateDeadline(event.currentTarget.value)} onChange={(event) => updateDeadline(event.currentTarget.value)} /></label>
            <div className="assignment-deadline-shortcuts" aria-label="快捷截止时间">
              {assignmentDeadlineShortcuts.map((shortcut) => <button key={shortcut.id} type="button" disabled={saving || publishStage !== "idle"} className={`admin-button admin-button--small ${quickDeadline === shortcut.id ? "admin-button--secondary" : "admin-button--quiet"}`} aria-pressed={quickDeadline === shortcut.id} onClick={() => { setDraft((current) => ({ ...current, dueAt: assignmentDeadlineForShortcut(new Date(), shortcut.days) })); setQuickDeadline(shortcut.id); }}>{shortcut.label}</button>)}
            </div>
          </div>
          <label className="admin-field-label assignment-editor__description">作业说明<textarea className={fieldClass} required rows={4} maxLength={10000} disabled={saving || publishStage !== "idle"} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
          <label className="admin-field-label assignment-editor__requirements">附件要求<input className={fieldClass} maxLength={2000} disabled={saving || publishStage !== "idle"} value={draft.attachmentRequirements} onChange={(event) => setDraft({ ...draft, attachmentRequirements: event.target.value })} /></label>
          <section className="assignment-editor__materials" aria-labelledby="assignment-materials-title">
            <h3 id="assignment-materials-title" className="text-sm font-semibold text-[var(--admin-text)]">教学资料附件</h3>
            <FileUploadField
              label="教学资料附件"
              files={pendingMaterials}
              onFilesChange={(next) => { setPendingMaterials(next); setMaterialsUploadStatus("pending"); setError(""); }}
              multiple
              hint="最多 10 个 · 单次请求上限 64 MiB（含表单数据）"
              disabled={saving || publishStage !== "idle" || loadingEdit || Boolean(editing && editing.submittedCount > 0)}
              status={materialsUploadStatus}
              progress={uploadProgress}
              validateSelection={(next) => validateAssignmentMaterialSelection(existingMaterials, [], next) || null}
            />
            {existingMaterials.length > 0 ? <ul className="divide-y divide-[var(--admin-border-subtle)] rounded-lg border border-[var(--admin-border-subtle)] px-3">
              {existingMaterials.map((file) => <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <a className="min-w-0 break-all text-[var(--admin-warning)] hover:text-[var(--admin-warning)]" href={file.downloadUrl}>{file.fileName}</a>
                <span className="flex items-center gap-2 text-xs text-[var(--admin-muted)]">{formatAssignmentMaterialSize(file.size)}<button type="button" className="admin-button admin-button--quiet" aria-label={`移除${file.fileName}`} disabled={saving || loadingEdit || Boolean(editing?.submittedCount)} onClick={() => {
                  if (!editing) return;
                  setSaving(true);
                  setError("");
                  void assignmentClient.removeMaterialFile(editing.id, file.id).then(setExistingMaterials).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "移除教学资料失败")).finally(() => setSaving(false));
                }}>移除</button></span>
              </li>)}
            </ul> : null}
            {editing?.submittedCount ? <p className="text-xs text-[var(--admin-muted)]">已有成员提交，教学资料已锁定。</p> : null}
          </section>
          <fieldset className="assignment-editor__recipients">
            <legend className="admin-field-label">作业对象</legend>
            {editing ? <p className="text-xs text-[var(--admin-muted)]">{draft.isGroupWide ? "全组范围持续同步，当前成员和原接收成员均可在提交记录中查看。" : "指定成员名单已锁定。需要调整请另建作业。"}</p> : null}
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2"><input type="radio" name="assignment-target" disabled={saving || publishStage !== "idle" || Boolean(editing)} checked={draft.isGroupWide} onChange={() => setDraft({ ...draft, isGroupWide: true, targetUserIds: [] })} />全组普通成员（实时）</label>
              <label className="inline-flex items-center gap-2"><input type="radio" name="assignment-target" disabled={saving || publishStage !== "idle" || Boolean(editing)} checked={!draft.isGroupWide} onChange={() => setDraft({ ...draft, isGroupWide: false })} />指定成员</label>
            </div>
            {!draft.isGroupWide ? <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="assignment-member-search">搜索组内成员</label>
                <input id="assignment-member-search" type="search" disabled={saving || publishStage !== "idle" || Boolean(editing)} className="admin-field min-w-48 flex-1" autoComplete="off" placeholder="搜索成员姓名" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} />
                {memberSearch ? <button type="button" disabled={saving || publishStage !== "idle" || Boolean(editing)} className="admin-button admin-button--quiet" onClick={() => setMemberSearch("")}>清空搜索</button> : null}
                {!editing && lastTargetedAssignment ? <button type="button" className="admin-button admin-button--quiet admin-button--small" disabled={saving || publishStage !== "idle"} onClick={() => void usePreviousRecipients()}>上次指定的成员</button> : null}
                <span className="text-sm text-[var(--admin-muted)]">已选 {draft.targetUserIds.length} 人</span>
              </div>
              {selectedMembers.length > 0 ? <div className="flex flex-wrap gap-1" aria-label="已选成员">
                {selectedMembers.map((member) => <button key={member.userId} type="button" disabled={saving || publishStage !== "idle" || Boolean(editing)} className="rounded-full border border-[var(--admin-border-subtle)] px-2 py-1 text-xs text-[var(--admin-muted)] hover:text-[var(--admin-text)]" aria-label={`取消选择${member.name}（账号 ${member.userId}）`} onClick={() => toggleMember(member.userId)}>× {member.name} #{member.userId}</button>)}
              </div> : null}
              <div className="grid max-h-48 gap-2 overflow-y-auto rounded-xl border border-[var(--admin-border-subtle)] p-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredMembers.map((member) => <label key={member.userId} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={saving || publishStage !== "idle" || Boolean(editing)} checked={draft.targetUserIds.includes(member.userId)} onChange={() => toggleMember(member.userId)} />{member.name} <span className="text-xs text-[var(--admin-muted)]">#{member.userId}</span></label>)}
                {loading ? <BrandLoader label="正在加载组内成员" size="sm" /> : !error && filteredMembers.length === 0 ? <p className="text-sm text-[var(--admin-muted)]">{memberSearch ? "没有匹配成员。" : "当前组没有可分配的普通成员。"}</p> : null}
              </div>
            </div> : null}
          </fieldset>
          <div className="assignment-editor__actions"><button type="submit" className="admin-button admin-button--primary" disabled={saving || loadingEdit || !groupId || (!draft.isGroupWide && draft.targetUserIds.length === 0)}>{saving ? publishStage === "saving" ? "保存作业信息中…" : uploadProgress === null ? "正在上传教学资料…" : `正在上传教学资料 ${uploadProgress}%` : editing ? "保存修改" : publishStage === "failed" ? "重试发布" : "发布作业"}</button>{saving && publishStage === "uploading" ? <button type="button" className="admin-button admin-button--quiet" onClick={() => activePublishCancel.current?.()}>停止上传</button> : null}{publishStage === "failed" && publishCanCancel ? <button type="button" className="admin-button admin-button--quiet" onClick={() => { setError(""); resetDraft(); }}>取消发布</button> : null}</div>
        </form>
      </section> : null}

      <section className="admin-panel assignment-list" aria-labelledby="assignment-list-title">
        <div className="admin-section-heading"><h2 id="assignment-list-title">本组作业</h2></div>
        {loading && !items.length ? <BrandLoader label="正在加载作业" /> : null}
        {!loading && !error && !groupError && items.length === 0 ? <p className="py-4 text-sm text-[var(--admin-muted)]">本组尚未发布作业。</p> : null}
        <div className="assignment-list__items">{items.map((item) => <article key={item.id} className="assignment-list__item">
          <div className="assignment-list__summary"><div className="assignment-list__title"><h3>{item.title}</h3><span className={`rounded-full border px-2 py-0.5 text-xs ${item.publicationStatus === "withdrawn" ? "border-[var(--admin-border)] text-[var(--admin-muted)]" : "border-[var(--admin-success-border)] text-[var(--admin-success)]"}`}>{assignmentPublicationStatusLabel(item.publicationStatus)}</span></div><p>截止 {formatAssignmentDate(item.dueAt)} · {item.isGroupWide ? "全组（实时）" : "指定成员"} · 接收 {item.targetCount} 人 · 已提交 {item.submittedCount}/{item.targetCount} · 已通过 {item.passedCount}</p></div>
          <div className="assignment-list__actions"><a href={`/dashboard/admin/training/submissions?assignmentId=${item.id}`} className="admin-button admin-button--secondary admin-button--small">提交记录</a><button type="button" className="admin-button admin-button--quiet admin-button--small" disabled={saving || item.submittedCount > 0} onClick={() => editAssignment(item)}>{item.submittedCount > 0 ? "已有提交" : "编辑"}</button>{item.publicationStatus === "withdrawn" ? <button type="button" className="admin-button admin-button--quiet admin-button--small" disabled={saving} onClick={() => void changePublicationStatus(item, "published")}>重新发布</button> : <button type="button" className="admin-button admin-button--quiet admin-button--small" disabled={saving} onClick={() => void changePublicationStatus(item, "withdrawn")}>撤回</button>}{item.canDelete ? <button type="button" className="admin-button admin-button--quiet admin-button--small text-[var(--admin-danger)]" disabled={saving} onClick={() => void deleteAssignment(item)}>删除</button> : item.publicationStatus === "withdrawn" ? <span className="assignment-list__retained">历史或技能关联已保留</span> : null}</div>
        </article>)}</div>
      </section>
    </section>
  );
}
