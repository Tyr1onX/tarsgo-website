import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBlocker } from "react-router";

import { CollectionFormFields } from "~/components/collection-form-fields";
import { collectionPresets, fieldKey, isChoice, makeCollectionPreset, makeField, makeOption, type CollectionPreset } from "~/lib/collection-form-presets";
import {
  collectionClient, type CollectionField, type CollectionForm, type CollectionInput,
  type CollectionOption, type CollectionSubmission, type CollectionUsage,
} from "~/lib/collection-forms-client";

export function meta() { return [{ title: "收集表 | TARSGO" }]; }

const fieldTypes: { value: CollectionField["type"]; label: string }[] = [
  { value: "text", label: "简短回答" }, { value: "textarea", label: "详细回答" },
  { value: "number", label: "数字" }, { value: "date", label: "日期" },
  { value: "radio", label: "单选" }, { value: "checkbox", label: "多选" },
  { value: "select", label: "下拉选择" },
];
const quickFields: { label: string; type: CollectionField["type"] }[] = [
  { label: "姓名", type: "text" }, { label: "学院", type: "text" },
  { label: "联系方式", type: "text" }, { label: "培训场次", type: "radio" },
];

const toInputTime = (time: string | null) => {
  if (!time) return "";
  const date = new Date(time);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromInputTime = (value: string) => value ? new Date(value).toISOString() : null;
const errorText = (err: unknown) => err instanceof Error ? err.message : "操作失败";
const answerText = (field: CollectionField, value: unknown) => {
  if (value == null) return "";
  const labels = new Map(field.options?.map((item) => [item.value, item.label]));
  if (Array.isArray(value)) return value.map((item) => labels.get(String(item)) ?? item).join("、");
  return labels.get(String(value)) ?? String(value);
};

type View = "edit" | "settings" | "publish" | "preview" | "results";

export default function CollectionFormsAdmin() {
  const [items, setItems] = useState<CollectionForm[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<CollectionInput>(() => makeCollectionPreset("blank"));
  const [view, setView] = useState<View>("edit");
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [addingField, setAddingField] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, unknown>>({});
  const [count, setCount] = useState(0);
  const [usage, setUsage] = useState<CollectionUsage>({});
  const [records, setRecords] = useState<CollectionSubmission[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<"saved" | "saving" | "error">("saved");
  const savedSnapshot = useRef("");
  const updateQueue = useRef<Promise<void>>(Promise.resolve());
  const publishing = useRef(false);
  const currentDraft = useRef(draft);
  currentDraft.current = draft;
  const handlingNavigation = useRef(false);
  const dirty = selected !== null && JSON.stringify(draft) !== savedSnapshot.current;
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirty && currentLocation.pathname !== nextLocation.pathname);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refreshList() {
    const result = await collectionClient.list();
    setItems(result.items);
  }
  useEffect(() => {
    void refreshList().catch((err) => setError(errorText(err))).finally(() => setLoading(false));
  }, []);

  // Serialize draft updates and publication so a delayed autosave cannot
  // overwrite the newly published form.
  const queueSave = useCallback((id: number, body: CollectionInput) => {
    const snapshot = JSON.stringify(body);
    const next = updateQueue.current.catch(() => {}).then(async () => {
      if (savedSnapshot.current === snapshot) return;
      await collectionClient.update(id, body);
      savedSnapshot.current = snapshot;
    });
    updateQueue.current = next;
    return next;
  }, []);

  useEffect(() => {
    if (!selected || draft.status !== "draft" || publishing.current) return;
    if (JSON.stringify(draft) === savedSnapshot.current) {
      setAutoSaveState("saved");
      return;
    }
    setAutoSaveState("saving");
    const timeout = window.setTimeout(() => {
      if (publishing.current) return;
      void queueSave(selected, draft).then(() => {
        if (currentDraft.current === draft) setAutoSaveState("saved");
      }).catch(() => setAutoSaveState("error"));
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [selected, draft, queueSave]);

  useEffect(() => {
    if (blocker.state !== "blocked") {
      handlingNavigation.current = false;
      return;
    }
    if (handlingNavigation.current) return;
    handlingNavigation.current = true;
    if (selected && draft.status === "draft") {
      void queueSave(selected, draft).then(() => {
        if (blocker.state === "blocked") blocker.proceed();
      }).catch((err) => {
        setAutoSaveState("error");
        setError(errorText(err));
        if (blocker.state === "blocked") blocker.reset();
      });
    } else if (window.confirm("有尚未保存的修改，确定离开吗？")) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, selected, draft, queueSave]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function createFromPreset(preset: CollectionPreset) {
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      const form = makeCollectionPreset(preset);
      const created = await collectionClient.create(form);
      savedSnapshot.current = JSON.stringify(form);
      setDraft(form);
      setSelected(created.id);
      setActiveKey(form.fields[0]?.key ?? null);
      setView("edit");
      setAutoSaveState("saved");
      setPreviewAnswers({});
      setAddingField(false);
      setRecords(null);
      setCount(0);
      setUsage({});
      setNotice("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setCreating(false);
    }
  }

  async function returnToList() {
    if (saving) return;
    if (selected && draft.status === "draft" && JSON.stringify(draft) !== savedSnapshot.current) {
      setAutoSaveState("saving");
      try {
        await queueSave(selected, draft);
        setAutoSaveState("saved");
      } catch (err) {
        setAutoSaveState("error");
        setError(errorText(err));
        return;
      }
    } else if (JSON.stringify(draft) !== savedSnapshot.current && !window.confirm("有尚未保存的修改，确定返回列表吗？")) {
      return;
    }
    try {
      await refreshList();
      setSelected(null);
      setRecords(null);
      setError("");
    } catch (err) {
      setError(errorText(err));
    }
  }
  async function deleteDraft(id: number, title: string) {
    if (!window.confirm(`删除草稿「${title || "未命名收集表"}」？`)) return;
    try {
      await collectionClient.delete(id);
      await refreshList();
      setError("");
    } catch (err) {
      setError(errorText(err));
    }
  }
  async function open(id: number) {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const detail = await collectionClient.get(id);
      const form: CollectionInput = {
        title: detail.form.title, description: detail.form.description, fields: detail.form.fields,
        status: detail.form.status, loginRequired: detail.form.loginRequired,
        capacity: detail.form.capacity, opensAt: detail.form.opensAt, closesAt: detail.form.closesAt,
      };
      savedSnapshot.current = JSON.stringify(form);
      setDraft(form);
      setAutoSaveState("saved");
      setCount(detail.count);
      setUsage(detail.usage);
      setSelected(id);
      setView("edit");
      setActiveKey(null);
      setAddingField(false);
      setPreviewAnswers({});
      setRecords(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  }
  const change = <K extends keyof CollectionInput>(name: K, value: CollectionInput[K]) =>
    setDraft((previous) => ({ ...previous, [name]: value }));
  const changeField = (index: number, updates: Partial<CollectionField>) =>
    setDraft((previous) => ({
      ...previous,
      fields: previous.fields.map((field, i) => i === index ? { ...field, ...updates } : field),
    }));
  const changeOption = (index: number, optionIndex: number, updates: Partial<CollectionOption>) =>
    setDraft((previous) => ({
      ...previous,
      fields: previous.fields.map((field, i) => i === index
        ? { ...field, options: field.options?.map((item, j) => j === optionIndex ? { ...item, ...updates } : item) }
        : field),
    }));
  const moveField = (index: number, offset: number) =>
    setDraft((previous) => {
      const fields = [...previous.fields];
      [fields[index], fields[index + offset]] = [fields[index + offset], fields[index]];
      return { ...previous, fields };
    });
  function addField(type: CollectionField["type"], label = "") {
    if (draft.fields.length >= 30) return;
    const field = makeField(type, label);
    setDraft((previous) => ({ ...previous, fields: [...previous.fields, field] }));
    setActiveKey(field.key);
    setAddingField(false);
  }
  function duplicateField(index: number) {
    if (draft.fields.length >= 30) return;
    const original = draft.fields[index];
    const copy: CollectionField = {
      ...original, key: fieldKey(),
      options: original.options?.map((item) => ({ ...item, value: fieldKey() })),
    };
    setDraft((previous) => ({
      ...previous, fields: [...previous.fields.slice(0, index + 1), copy, ...previous.fields.slice(index + 1)],
    }));
    setActiveKey(copy.key);
  }
  async function save(publish = false) {
    if (!selected || saving) return;
    setError("");
    setNotice("");
    // Drafts may contain unfinished questions; publication must not.
    if (publish || draft.status !== "draft") {
      if (!draft.title.trim()) {
        setError("请填写收集表标题");
        setView("edit");
        return;
      }
      const badIndex = draft.fields.findIndex((field) =>
        !field.label.trim() || (isChoice(field.type) && (field.options?.some((option) => !option.label.trim()) ?? true)));
      if (badIndex !== -1 || draft.fields.length === 0) {
        setActiveKey(draft.fields[Math.max(badIndex, 0)]?.key ?? null);
        setView("edit");
        setError(`请完善第 ${Math.max(badIndex, 0) + 1} 项的名称和选项`);
        return;
      }
      if (draft.opensAt && draft.closesAt && new Date(draft.closesAt) <= new Date(draft.opensAt)) {
        setView("settings");
        setError("截止时间应晚于开始时间");
        return;
      }
    }
    publishing.current = true;
    setSaving(true);
    try {
      const body: CollectionInput = {
        ...draft, title: draft.title.trim(),
        status: publish ? "published" : draft.status,
        fields: draft.fields.map((field) => ({
          ...field, label: field.label.trim(),
          options: isChoice(field.type) ? field.options?.map((option) => ({
            ...option, label: option.label.trim(), description: option.description?.trim(),
          })) : undefined,
        })),
      };
      await queueSave(selected, body);
      setDraft(body);
      if (publish) setView("edit");
      setAutoSaveState("saved");
      setNotice(publish ? "已发布，填写链接可以分享了" : "已保存");
      void refreshList().catch(() => {});
    } catch (err) {
      setAutoSaveState("error");
      setError(errorText(err));
    } finally {
      publishing.current = false;
      setSaving(false);
    }
  }
  async function showResults() {
    setView("results");
    if (!selected) return;
    try {
      const [submissions, detail] = await Promise.all([collectionClient.submissions(selected), collectionClient.get(selected)]);
      setRecords(submissions.items);
      setCount(detail.count);
      setUsage(detail.usage);
      setError("");
    } catch (err) {
      setError(errorText(err));
    }
  }
  async function copyShareLink() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/forms/${selected}`);
      setNotice("填写链接已复制");
      setError("");
    } catch {
      setError("复制失败，请打开填写页复制网址");
    }
  }
  async function removeRecord(recordId: number) {
    if (!selected || !window.confirm("删除此提交记录？名额会自动释放。")) return;
    try {
      await collectionClient.deleteSubmission(selected, recordId);
      await showResults();
      await refreshList();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const locked = count > 0;
  return <main className="admin-design space-y-4">
    <header className="admin-page-header flex flex-wrap items-center justify-between gap-3">
      <h1 className="admin-page-title">收集表</h1>
      {selected !== null && <button className="admin-button admin-button--secondary"
        onClick={() => void returnToList()}>返回列表</button>}
    </header>
    {selected === null ? (
      loading ? <p>正在读取…</p> : <>
        {error && <p role="alert" className="text-red-500">{error}</p>}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">创建收集表</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {collectionPresets.map((preset) => <button key={preset.id} type="button"
              disabled={creating} onClick={() => void createFromPreset(preset.id)}
              className="admin-panel space-y-2 p-4 text-left transition-colors hover:bg-[var(--admin-hover-overlay)] disabled:opacity-50">
              <strong className="block">{preset.title}</strong>
              <span className="block text-sm text-fg-muted">{preset.description}</span>
            </button>)}
          </div>
        </section>
        {items.length > 0 && <section className="space-y-3">
          <h2 className="text-lg font-semibold">已有收集表</h2>
          <div className="grid gap-3">
            {items.map((item) => <div key={item.id} className="admin-panel flex items-center gap-3 p-3">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void open(item.id)}>
                <strong className="block truncate">{item.title || "未命名收集表"}</strong>
                <span className="text-xs text-fg-muted">{item.count ?? 0} 份提交</span>
              </button>
              <span className="shrink-0 text-sm text-fg-muted">{item.status === "draft" ? "草稿" : item.status === "closed" ? "已关闭" : "已发布"}</span>
              {item.status === "draft" && <button type="button" className="admin-button admin-button--quiet"
                aria-label={`删除草稿：${item.title || "未命名收集表"}`}
                onClick={() => void deleteDraft(item.id, item.title)}>删除</button>}
            </div>)}
          </div>
        </section>}
      </>
    ) : <>
      <div className="admin-panel flex flex-wrap items-center justify-between gap-3 p-3">
        <nav aria-label="收集表管理" className="flex flex-wrap gap-1">
          <button type="button" aria-current={view === "edit" ? "page" : undefined}
            className={`admin-button ${view === "edit" ? "admin-button--primary" : "admin-button--quiet"}`}
            onClick={() => setView("edit")}>编辑</button>
          <button type="button" aria-current={view === "settings" || view === "publish" ? "page" : undefined}
            className={`admin-button ${view === "settings" || view === "publish" ? "admin-button--primary" : "admin-button--quiet"}`}
            onClick={() => setView("settings")}>设置</button>
          {Boolean(selected) && <button type="button" aria-current={view === "results" ? "page" : undefined}
            className={`admin-button ${view === "results" ? "admin-button--primary" : "admin-button--quiet"}`}
            onClick={() => void showResults()}>结果 {count || ""}</button>}
        </nav>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="admin-button admin-button--secondary"
            onClick={() => { setPreviewAnswers({}); setView(view === "preview" ? "edit" : "preview"); }}>
            {view === "preview" ? "退出预览" : "预览"}
          </button>
          {draft.status === "draft" ? <>
            <span role="status" className="self-center text-sm text-fg-muted">
              {autoSaveState === "error" ? "保存失败" : autoSaveState === "saving" ? "自动保存中…" : "草稿已保存"}
            </span>
            {autoSaveState === "error" && <button type="button" className="admin-button admin-button--secondary"
              disabled={saving} onClick={() => void save()}>重试</button>}
            {view !== "publish" && <button type="button" className="admin-button admin-button--primary"
              onClick={() => setView("publish")}>发布</button>}
          </> : <>
            <button type="button" className="admin-button admin-button--secondary" disabled={saving}
              onClick={() => void save()}>{saving ? "保存中…" : "保存修改"}</button>
            {draft.status === "published" && <button type="button" className="admin-button admin-button--primary"
              onClick={() => void copyShareLink()}>复制填写链接</button>}
          </>}
        </div>
      </div>

      {error && <p role="alert" className="text-red-500">{error}</p>}
      {notice && <p role="status" className="text-green-700">{notice}</p>}
      {draft.status === "published" && <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-fg-muted">已发布</span>
        {Boolean(selected) && <Link className="underline" to={`/forms/${selected}`} target="_blank">打开填写页</Link>}
      </div>}

      {view === "edit" && <div className="mx-auto max-w-3xl space-y-3">
        <section className="admin-panel space-y-3 p-5">
          <input aria-label="收集表标题" className="w-full border-0 bg-transparent text-2xl font-semibold outline-none placeholder:text-fg-muted"
            maxLength={120} placeholder="输入收集表标题" value={draft.title}
            onChange={(e) => change("title", e.target.value)} />
          <textarea aria-label="收集表说明" className="w-full resize-y border-0 bg-transparent text-sm outline-none placeholder:text-fg-muted"
            rows={2} maxLength={1000} placeholder="添加说明（可选）" value={draft.description}
            onChange={(e) => change("description", e.target.value)} />
        </section>

        {draft.fields.map((field, index) => {
          const editing = activeKey === field.key;
          return <section className={`admin-panel p-4 ${editing ? "ring-2 ring-[var(--admin-accent-soft)]" : ""}`} key={field.key}>
            {!editing ? <button type="button" className="w-full space-y-3 text-left" onClick={() => setActiveKey(field.key)}>
              <div className="flex items-start justify-between gap-3">
                <strong>{index + 1}. {field.label || "未命名填写项"}{field.required && <span className="text-red-500"> *</span>}</strong>
                <span className="shrink-0 text-xs text-fg-muted">{fieldTypes.find((item) => item.value === field.type)?.label}</span>
              </div>
              {isChoice(field.type) ? <div className="grid gap-2 text-sm text-fg-muted">
                {field.options?.map((option) => <div key={option.value} className="flex gap-2">
                  <span>{field.type === "checkbox" ? "□" : "○"}</span><span>{option.label}</span>
                </div>)}
              </div> : <div className="rounded-lg border border-[var(--admin-border-subtle)] px-3 py-2 text-sm text-fg-muted">
                {field.type === "date" ? "年 / 月 / 日" : field.type === "number" ? "请输入数字" :
                  field.type === "textarea" ? "在这里填写详细内容…" : "在这里填写内容…"}
              </div>}
            </button> : <div className="space-y-4">
              <div className="flex items-start gap-2">
                <span className="pt-2 text-sm text-fg-muted">{index + 1}.</span>
                <input aria-label={`第 ${index + 1} 项名称`} className="admin-field min-w-0 flex-1 !text-base !font-semibold"
                  placeholder="输入问题，例如培训时间" maxLength={100} disabled={locked}
                  value={field.label} onChange={(e) => changeField(index, { label: e.target.value })} />
              </div>
              {isChoice(field.type) ? <div className="space-y-2">
                {field.options?.map((option, j) => {
                  const used = usage[field.key]?.[option.value] ?? 0;
                  return <div key={option.value} className="space-y-2 rounded-lg border border-[var(--admin-border-subtle)] p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-fg-muted">{field.type === "checkbox" ? "□" : "○"}</span>
                      <input aria-label={`选项 ${j + 1}`} className="admin-field min-w-32 flex-1"
                        value={option.label} maxLength={100} disabled={locked}
                        onChange={(e) => changeOption(index, j, { label: e.target.value })} />
                      <input aria-label={`选项 ${j + 1} 名额`} type="number" min={0} max={1000000} placeholder="名额不限"
                        className="admin-field !w-28" value={option.capacity || ""}
                        onChange={(e) => changeOption(index, j, { capacity: Number(e.target.value) })} />
                      {!locked && (field.options?.length ?? 0) > 2 && <button type="button"
                        className="admin-button admin-button--quiet" onClick={() => changeField(index, {
                          options: field.options?.filter((_, i) => i !== j),
                        })}>删除</button>}
                    </div>
                    <details className="ml-6 text-sm text-fg-muted">
                      <summary className="cursor-pointer">补充说明{option.description ? "（已填写）" : "（可选）"}</summary>
                      <textarea aria-label={`选项 ${j + 1} 补充说明`} className="admin-field mt-2 min-h-16 w-full resize-y"
                        rows={2} maxLength={300} value={option.description ?? ""}
                        placeholder="例如地点、设备" onChange={(e) => changeOption(index, j, { description: e.target.value })} />
                    </details>
                    {count > 0 && <p className="ml-6 text-xs text-fg-muted">已选 {used}{option.capacity ? ` · 余 ${Math.max(0, option.capacity - used)}` : " · 不限"}</p>}
                  </div>;
                })}
                {!locked && <button type="button" className="admin-button admin-button--secondary"
                  disabled={(field.options?.length ?? 0) >= 30} onClick={() => changeField(index, {
                    options: [...(field.options ?? []), makeOption(`选项 ${(field.options?.length ?? 0) + 1}`)],
                  })}>＋ 添加选项</button>}
              </div> : <div className="rounded-lg border border-[var(--admin-border-subtle)] px-3 py-3 text-sm text-fg-muted">
                {field.type === "date" ? "年 / 月 / 日" : field.type === "number" ? "请输入数字" :
                  field.type === "textarea" ? "在这里填写详细内容…" : "在这里填写内容…"}
              </div>}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--admin-border-subtle)] pt-3">
                <div className="flex flex-wrap items-center gap-3">
                  <select aria-label={`第 ${index + 1} 项类型`} className="admin-field !w-32" value={field.type}
                    disabled={locked} onChange={(e) => {
                      const type = e.target.value as CollectionField["type"];
                      changeField(index, { type, options: isChoice(type)
                        ? (isChoice(field.type) ? field.options : [makeOption("选项 1"), makeOption("选项 2")])
                        : undefined });
                    }}>
                    {fieldTypes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={field.required} disabled={locked}
                      onChange={(e) => changeField(index, { required: e.target.checked })} />必填
                  </label>
                </div>
                <div className="flex flex-wrap gap-1">
                  {!locked && index > 0 && <button type="button" className="admin-button admin-button--quiet"
                    onClick={() => moveField(index, -1)}>上移</button>}
                  {!locked && index < draft.fields.length - 1 && <button type="button" className="admin-button admin-button--quiet"
                    onClick={() => moveField(index, 1)}>下移</button>}
                  {!locked && draft.fields.length < 30 && <button type="button" className="admin-button admin-button--quiet"
                    onClick={() => duplicateField(index)}>复制</button>}
                  {!locked && draft.fields.length > 1 && <button type="button" className="admin-button admin-button--quiet"
                    onClick={() => { change("fields", draft.fields.filter((_, i) => i !== index)); setActiveKey(null); }}>删除</button>}
                  <button type="button" className="admin-button admin-button--secondary"
                    onClick={() => setActiveKey(null)}>完成</button>
                </div>
              </div>
            </div>}
          </section>;
        })}
        {!locked && <div className="space-y-2">
          <button type="button" className="admin-button admin-button--secondary" disabled={draft.fields.length >= 30}
            aria-expanded={addingField} onClick={() => setAddingField((v) => !v)}>＋ 添加问题</button>
          {addingField && <section className="admin-panel space-y-3 p-4" aria-label="添加问题">
            <p className="text-sm font-medium">常用字段</p>
            <div className="flex flex-wrap gap-2">
              {quickFields.map((item) => <button type="button" className="admin-button admin-button--secondary"
                key={item.label} onClick={() => addField(item.type, item.label)}>{item.label}</button>)}
            </div>
            <p className="text-sm font-medium">其他题型</p>
            <div className="flex flex-wrap gap-2">
              {fieldTypes.map((item) => <button type="button" className="admin-button admin-button--secondary"
                key={item.value} onClick={() => addField(item.value, item.label === "简短回答" ? "请填写" : "")}>{item.label}</button>)}
            </div>
          </section>}
        </div>}
      </div>}

      {(view === "settings" || view === "publish") && <section className="admin-panel mx-auto max-w-3xl space-y-5 p-5">
        <h2 className="text-lg font-semibold">{view === "publish" ? "发布前确认" : "填写设置"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">收集状态
            {draft.status === "draft" ? <span className="admin-field flex items-center">草稿（发布后开放填写）</span> :
              <select className="admin-field" value={draft.status}
                onChange={(e) => change("status", e.target.value as CollectionInput["status"])}>
                <option value="published">开放收集</option>
                <option value="closed">停止收集</option>
              </select>}
          </label>
          <label className="grid gap-1">总名额
            <input className="admin-field" type="number" min={0} max={1000000} placeholder="不限"
              value={draft.capacity || ""} onChange={(e) => change("capacity", Number(e.target.value))} />
          </label>
          <label className="grid gap-1">开始时间
            <input className="admin-field" type="datetime-local" value={toInputTime(draft.opensAt)}
              onChange={(e) => change("opensAt", fromInputTime(e.target.value))} />
          </label>
          <label className="grid gap-1">截止时间
            <input className="admin-field" type="datetime-local" min={toInputTime(draft.opensAt)}
              value={toInputTime(draft.closesAt)} onChange={(e) => change("closesAt", fromInputTime(e.target.value))} />
          </label>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.loginRequired} disabled={locked}
            onChange={(e) => change("loginRequired", e.target.checked)} />
          需要登录后填写（每个账号只能提交一次）
        </label>
        {view === "publish" && <button type="button" className="admin-button admin-button--primary"
          disabled={saving} onClick={() => void save(true)}>{saving ? "发布中…" : "确认发布"}</button>}
      </section>}

      {view === "preview" && <section className="mx-auto max-w-2xl space-y-4">
        <p className="text-sm text-fg-muted">填写预览，不会提交数据</p>
        <div className="admin-panel space-y-5 p-5">
          <header className="space-y-2">
            <h2 className="text-2xl font-semibold">{draft.title || "未命名收集表"}</h2>
            {draft.description && <p className="whitespace-pre-wrap text-fg-muted">{draft.description}</p>}
          </header>
          <CollectionFormFields fields={draft.fields} answers={previewAnswers}
            onAnswer={(field, value) => setPreviewAnswers((previous) => ({ ...previous, [field.key]: value }))} />
        </div>
      </section>}

      {view === "results" && <section className="admin-panel space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">提交记录 · {count} 份{draft.capacity > 0 ? ` / ${draft.capacity}` : ""}</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="admin-button admin-button--secondary" onClick={() => void showResults()}>刷新</button>
            {Boolean(selected) && <a className="admin-button admin-button--secondary" href={collectionClient.exportUrl(selected!)}>导出 CSV</a>}
          </div>
        </div>
        {records?.length === 0 ? <p className="text-fg-muted">暂无提交</p> :
          <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm">
            <thead><tr><th className="p-2">时间</th>{draft.fields.map((field) => <th key={field.key} className="p-2">{field.label}</th>)}<th className="p-2">操作</th></tr></thead>
            <tbody>{records?.map((record) => <tr className="border-t border-[var(--admin-border-subtle)]" key={record.id}>
              <td className="whitespace-nowrap p-2">{new Date(record.createdAt).toLocaleString("zh-CN")}</td>
              {draft.fields.map((field) => <td key={field.key} className="p-2">{answerText(field, record.answers[field.key])}</td>)}
              <td className="p-2"><button type="button" className="admin-button admin-button--quiet"
                onClick={() => void removeRecord(record.id)}>删除</button></td>
            </tr>)}</tbody>
          </table></div>}
      </section>}
    </>}
  </main>;
}
