import { useEffect, useState } from "react";
import { Link } from "react-router";

import {
  collectionClient,
  type CollectionField,
  type CollectionForm,
  type CollectionInput,
  type CollectionOption,
  type CollectionSubmission,
} from "~/lib/collection-forms-client";

export function meta() { return [{ title: "收集表 | TARSGO" }]; }

const fieldTypes: Array<{ value: CollectionField["type"]; label: string }> = [
  { value: "text", label: "单行文本" },
  { value: "textarea", label: "多行文本" },
  { value: "number", label: "数字" },
  { value: "date", label: "日期" },
  { value: "radio", label: "单选" },
  { value: "select", label: "下拉选择" },
  { value: "checkbox", label: "多选" },
];
const choiceType = (type: CollectionField["type"]) => ["radio", "select", "checkbox"].includes(type);
const key = () => `f${Math.random().toString(36).slice(2, 10)}`;
const option = (): CollectionOption => ({ value: key(), label: "", capacity: 0 });
const blank = (): CollectionInput => ({
  title: "", description: "", fields: [{ key: key(), label: "姓名", type: "text", required: true }],
  status: "draft", loginRequired: true, capacity: 0, opensAt: null, closesAt: null,
});
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

export default function CollectionFormsAdmin() {
  const [items, setItems] = useState<CollectionForm[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<CollectionInput>(blank);
  const [count, setCount] = useState(0);
  const [records, setRecords] = useState<CollectionSubmission[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refreshList() {
    const result = await collectionClient.list();
    setItems(result.items);
  }
  useEffect(() => {
    void refreshList().catch((err) => setError(errorText(err))).finally(() => setLoading(false));
  }, []);

  function startNew() {
    setSelected(0);
    setDraft(blank());
    setRecords(null);
    setCount(0);
    setError("");
    setNotice("");
  }
  async function open(id: number) {
    setError("");
    setNotice("");
    setRecords(null);
    setLoading(true);
    try {
      const detail = await collectionClient.get(id);
      setDraft({
        title: detail.form.title, description: detail.form.description, fields: detail.form.fields,
        status: detail.form.status, loginRequired: detail.form.loginRequired,
        capacity: detail.form.capacity, opensAt: detail.form.opensAt, closesAt: detail.form.closesAt,
      });
      setCount(detail.count);
      setSelected(id);
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
      ...previous, fields: previous.fields.map((field, i) => i === index
        ? { ...field, options: field.options?.map((item, j) => j === optionIndex ? { ...item, ...updates } : item) }
        : field),
    }));

  async function save() {
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const body = { ...draft, title: draft.title.trim(), fields: draft.fields.map((field) => ({
        ...field, label: field.label.trim(),
        options: choiceType(field.type) ? field.options?.map((item) => ({ ...item, label: item.label.trim() })) : undefined,
      })) };
      if (selected) {
        await collectionClient.update(selected, body);
      } else {
        const result = await collectionClient.create(body);
        setSelected(result.id);
      }
      await refreshList();
      if (selected) await open(selected);
      else setDraft(body);
      setNotice("已保存");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }
  async function loadRecords() {
    if (!selected) return;
    try {
      setRecords((await collectionClient.submissions(selected)).items);
      setError("");
    } catch (err) {
      setError(errorText(err));
    }
  }
  async function removeRecord(recordId: number) {
    if (!selected || !window.confirm("删除此提交记录？名额会自动释放。")) return;
    try {
      await collectionClient.deleteSubmission(selected, recordId);
      setRecords((current) => current?.filter((item) => item.id !== recordId) ?? []);
      setCount((current) => current - 1);
      await refreshList();
    } catch (err) { setError(errorText(err)); }
  }

  const locked = count > 0;
  return (
    <main className="admin-design space-y-5">
      <header className="admin-page-header flex flex-wrap items-center justify-between gap-3">
        <h1 className="admin-page-title">收集表</h1>
        {selected === null
          ? <button className="admin-button admin-button--primary" onClick={startNew}>新建收集表</button>
          : <button className="admin-button admin-button--secondary" onClick={() => { setSelected(null); setRecords(null); setError(""); }}>返回列表</button>}
      </header>
      {error && <p role="alert" className="text-red-500">{error}</p>}
      {notice && <p role="status" className="text-green-700">{notice}</p>}
      {selected === null ? (
        loading ? <p>正在读取…</p> : items.length === 0 ? <p className="text-fg-muted">暂无收集表</p> :
        <div className="grid gap-3">
          {items.map((item) => <button
            key={item.id} type="button" onClick={() => void open(item.id)}
            className="admin-panel flex flex-wrap items-center justify-between gap-3 rounded-xl p-4 text-left"
          >
            <span><strong className="block">{item.title}</strong><small className="text-fg-muted">{item.count ?? 0} 份提交</small></span>
            <span className="text-sm text-fg-muted">{item.status === "draft" ? "草稿" : item.status === "closed" ? "已关闭" : "已发布"}</span>
          </button>)}
        </div>
      ) : (
        <div className="space-y-5">
          <section className="admin-panel space-y-4 rounded-xl p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 sm:col-span-2">标题
                <input className="admin-field" maxLength={120} value={draft.title} onChange={(e) => change("title", e.target.value)} />
              </label>
              <label className="grid gap-1 sm:col-span-2">说明
                <textarea className="admin-field min-h-20" maxLength={1000} value={draft.description} onChange={(e) => change("description", e.target.value)} />
              </label>
              <label className="grid gap-1">状态
                <select className="admin-field" value={draft.status} onChange={(e) => change("status", e.target.value as CollectionInput["status"])}>
                  <option value="draft" disabled={locked}>草稿</option>
                  <option value="published">发布</option>
                  <option value="closed">关闭</option>
                </select>
              </label>
              <label className="grid gap-1">总名额（0 为不限）
                <input className="admin-field" type="number" min={0} max={1000000} value={draft.capacity} onChange={(e) => change("capacity", Number(e.target.value))} />
              </label>
              <label className="grid gap-1">开始时间
                <input className="admin-field" type="datetime-local" value={toInputTime(draft.opensAt)} onChange={(e) => change("opensAt", fromInputTime(e.target.value))} />
              </label>
              <label className="grid gap-1">截止时间
                <input className="admin-field" type="datetime-local" value={toInputTime(draft.closesAt)} onChange={(e) => change("closesAt", fromInputTime(e.target.value))} />
              </label>
              <label className="flex items-center gap-2 sm:col-span-2">
                <input type="checkbox" checked={draft.loginRequired} disabled={locked} onChange={(e) => change("loginRequired", e.target.checked)} />
                需要登录才能提交（每个账号一次）
              </label>
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">填写字段</h2>
            {draft.fields.map((field, index) => <div className="admin-panel space-y-3 rounded-xl p-4" key={field.key}>
              <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
                <label className="grid gap-1">问题
                  <input className="admin-field" value={field.label} disabled={locked} maxLength={100} onChange={(e) => changeField(index, { label: e.target.value })} />
                </label>
                <label className="grid gap-1">类型
                  <select className="admin-field" value={field.type} disabled={locked} onChange={(e) => {
                    const type = e.target.value as CollectionField["type"];
                    changeField(index, { type, options: choiceType(type) ? [option(), option()] : undefined });
                  }}>
                    {fieldTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}
                  </select>
                </label>
                <div className="flex items-end gap-3">
                  <label className="flex items-center gap-1 pb-2"><input disabled={locked} type="checkbox" checked={field.required} onChange={(e) => changeField(index, { required: e.target.checked })} />必填</label>
                  <button disabled={locked || draft.fields.length === 1} className="admin-button admin-button--quiet" onClick={() => change("fields", draft.fields.filter((_, i) => i !== index))}>删除</button>
                </div>
              </div>
              {choiceType(field.type) && <div className="space-y-2">
                {field.options?.map((item, j) => <div className="flex flex-wrap items-center gap-2" key={item.value}>
                  <input className="admin-field min-w-40 flex-1" aria-label={`选项 ${j + 1}`} placeholder="选项名称" maxLength={100} disabled={locked}
                    value={item.label} onChange={(e) => changeOption(index, j, { label: e.target.value })} />
                  {field.type !== "checkbox" && <label className="flex items-center gap-2 text-sm">名额
                    <input className="admin-field w-24" type="number" min={0} max={1000000} disabled={locked}
                      value={item.capacity ?? 0} onChange={(e) => changeOption(index, j, { capacity: Number(e.target.value) })} />
                  </label>}
                  <button className="admin-button admin-button--quiet" disabled={locked || (field.options?.length ?? 0) <= 2}
                    onClick={() => changeField(index, { options: field.options?.filter((_, i) => i !== j) })}>移除</button>
                </div>)}
                <button disabled={locked || (field.options?.length ?? 0) >= 30} className="admin-button admin-button--secondary" onClick={() => changeField(index, { options: [...(field.options ?? []), option()] })}>添加选项</button>
              </div>}
            </div>)}
            <div className="flex flex-wrap gap-2">
              <button className="admin-button admin-button--secondary" disabled={locked || draft.fields.length >= 30}
                onClick={() => change("fields", [...draft.fields, { key: key(), label: "", type: "text", required: false }])}>添加字段</button>
              <button className="admin-button admin-button--primary" disabled={saving} onClick={() => void save()}>{saving ? "保存中…" : "保存表单"}</button>
            </div>
          </section>
          {Boolean(selected) && <section className="admin-panel space-y-3 rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">收集结果 · {count} 份</h2>
              <div className="flex flex-wrap gap-2">
                {draft.status !== "draft" && <Link className="admin-button admin-button--secondary" to={`/forms/${selected}`} target="_blank">打开填写页</Link>}
                <button className="admin-button admin-button--secondary" onClick={() => void loadRecords()}>查看记录</button>
                <a className="admin-button admin-button--secondary" href={collectionClient.exportUrl(selected!)}>导出 CSV</a>
              </div>
            </div>
            {records && (records.length === 0 ? <p className="text-fg-muted">暂无提交</p> :
              <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm">
                <thead><tr><th className="p-2">时间</th>{draft.fields.map((field) => <th key={field.key} className="p-2">{field.label}</th>)}<th className="p-2">操作</th></tr></thead>
                <tbody>{records.map((record) => <tr className="border-t border-[var(--admin-border-subtle)]" key={record.id}>
                  <td className="whitespace-nowrap p-2">{new Date(record.createdAt).toLocaleString("zh-CN")}</td>
                  {draft.fields.map((field) => <td className="p-2" key={field.key}>{answerText(field, record.answers[field.key])}</td>)}
                  <td className="p-2"><button className="admin-button admin-button--quiet" onClick={() => void removeRecord(record.id)}>删除</button></td>
                </tr>)}</tbody>
              </table></div>)}
          </section>}
        </div>
      )}
    </main>
  );
}
