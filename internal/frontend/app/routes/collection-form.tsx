import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";

import { collectionClient, type CollectionField, type CollectionForm, type CollectionOption } from "~/lib/collection-forms-client";

export function meta() { return [{ title: "收集表 | TARSGO" }]; }

function ChoiceContent({ option }: { option: CollectionOption }) {
  return <>
    <span className="min-w-0 flex-1 break-words">
      <span className="block whitespace-pre-wrap">{option.label}</span>
      {option.description && <span className="mt-1 block whitespace-pre-wrap text-sm text-fg-muted">{option.description}</span>}
    </span>
    {option.remaining != null && <span className="shrink-0 whitespace-nowrap text-sm text-fg-muted">
      {option.remaining === 0 ? "已满" : `余 ${option.remaining}`}
    </span>}
  </>;
}

export default function CollectionFormPage() {
  const params = useParams();
  const id = Number(params.id);
  const [form, setForm] = useState<CollectionForm | null>(null);
  const [remaining, setRemaining] = useState(-1);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("表单不存在");
    const data = await collectionClient.publicForm(id);
    setForm(data.form);
    setRemaining(data.remaining);
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    if (!Number.isSafeInteger(id) || id <= 0) { setError("表单不存在"); setLoading(false); return; }
    void collectionClient.publicForm(id).then((data) => {
      if (active) { setForm(data.form); setRemaining(data.remaining); }
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : "读取失败");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  // Returning to a tab refreshes remaining seats; submission is still checked
  // transactionally on the server if someone else took the last seat.
  useEffect(() => {
    if (done || !Number.isSafeInteger(id) || id <= 0) return;
    const refresh = () => {
      if (document.visibilityState !== "visible" || sending) return;
      void collectionClient.publicForm(id).then((data) => {
        setForm(data.form);
        setRemaining(data.remaining);
      }).catch(() => {});
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [id, done, sending]);

  const update = (field: CollectionField, value: unknown) => {
    setAnswers((previous) => ({ ...previous, [field.key]: value }));
  };
  const now = Date.now();
  const disabledReason = !form ? "" : form.status !== "published" ? "表单已关闭"
    : form.opensAt && new Date(form.opensAt).getTime() > now ? "表单尚未开始"
    : form.closesAt && new Date(form.closesAt).getTime() <= now ? "表单已截止"
    : remaining === 0 ? "名额已满"
    : form.fields.some((field) => field.required && ["radio", "select", "checkbox"].includes(field.type)
      && field.options?.every((option) => option.remaining === 0)) ? "可选名额已满" : "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || disabledReason || sending) return;
    const missingChoice = form.fields.find((field) => field.required && field.type === "checkbox"
      && (!Array.isArray(answers[field.key]) || (answers[field.key] as string[]).length === 0));
    if (missingChoice) {
      setError(`请填写${missingChoice.label}`);
      return;
    }
    setError("");
    setSending(true);
    try {
      await collectionClient.submit(form.id, answers);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
      try { await load(); } catch { /* Retain the original submit error. */ }
    } finally {
      setSending(false);
    }
  }

  return <main className="mx-auto min-h-[70vh] w-full max-w-2xl px-4 py-10 sm:py-16">
    {loading ? <p className="text-fg-muted">正在加载…</p> :
      !form ? <p role="alert">{error || "表单不存在"}</p> :
      done ? <section className="rounded-xl border border-border-subtle p-6">
        <h1 className="text-2xl font-semibold">提交成功</h1>
        <p className="mt-3 text-fg-muted">{form.title}</p>
        <Link className="mt-5 inline-block underline" to="/">返回首页</Link>
      </section> :
      <form className="space-y-6" onSubmit={(event) => void submit(event)}>
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold">{form.title}</h1>
          {form.description && <p className="whitespace-pre-wrap text-fg-muted">{form.description}</p>}
          {remaining >= 0 && <p className="text-sm text-fg-muted">剩余 {remaining} 个名额</p>}
        </header>
        {form.fields.map((field) => {
          const selected = answers[field.key];
          return <fieldset className="space-y-2 rounded-xl border border-border-subtle p-4" key={field.key} disabled={Boolean(disabledReason) || sending}>
            <legend className="px-1 font-medium">{field.label}{field.required && <span className="ml-1 text-red-500">*</span>}</legend>
            {(field.type === "text" || field.type === "number" || field.type === "date") &&
              <input className="w-full rounded-lg border border-border-subtle bg-transparent px-3 py-2"
                type={field.type} required={field.required} maxLength={field.type === "text" ? 500 : undefined}
                value={typeof selected === "string" || typeof selected === "number" ? selected : ""}
                onChange={(e) => update(field, field.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)} />}
            {field.type === "textarea" && <textarea className="min-h-28 w-full rounded-lg border border-border-subtle bg-transparent px-3 py-2"
              required={field.required} maxLength={5000} value={typeof selected === "string" ? selected : ""}
              onChange={(e) => update(field, e.target.value)} />}
            {field.type === "select" &&
              <select className="w-full rounded-lg border border-border-subtle bg-transparent px-3 py-2" required={field.required}
                value={typeof selected === "string" ? selected : ""} onChange={(e) => update(field, e.target.value)}>
                <option value="">请选择</option>
                {field.options?.map((option) => <option key={option.value} value={option.value} disabled={option.remaining === 0}>
                  {option.label}{option.remaining === 0 ? "（已满）" : option.remaining != null ? `（剩余 ${option.remaining}）` : ""}
                </option>)}
              </select>}
            {field.type === "radio" && <div className="grid gap-2">
              {field.options?.map((option) => <label key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 ${option.remaining === 0
                  ? "cursor-not-allowed border-border-subtle opacity-55"
                  : selected === option.value ? "border-accent-primary bg-accent-primary/5" : "border-border-subtle"}`}>
                <input className="mt-1 shrink-0" type="radio" name={field.key} required={field.required}
                  value={option.value} checked={selected === option.value} disabled={option.remaining === 0}
                  onChange={() => update(field, option.value)} />
                <ChoiceContent option={option} />
              </label>)}
            </div>}
            {field.type === "checkbox" && <div className="grid gap-2">
              {field.options?.map((option) => {
                const values = Array.isArray(selected) ? selected as string[] : [];
                return <label key={option.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 ${option.remaining === 0
                    ? "cursor-not-allowed border-border-subtle opacity-55"
                    : values.includes(option.value) ? "border-accent-primary bg-accent-primary/5" : "border-border-subtle"}`}>
                  <input className="mt-1 shrink-0" type="checkbox" checked={values.includes(option.value)}
                    disabled={option.remaining === 0}
                    onChange={(e) => update(field, e.target.checked ? [...values, option.value] : values.filter((value) => value !== option.value))} />
                  <ChoiceContent option={option} />
                </label>;
              })}
              {field.required && (!Array.isArray(selected) || selected.length === 0) && <span className="text-xs text-fg-muted">至少选择一项</span>}
            </div>}
          </fieldset>;
        })}
        {disabledReason && <p className="text-fg-muted" role="status">{disabledReason}</p>}
        {error && <p role="alert" className="text-red-500">{error}
          {error.includes("登录") && <Link className="ml-2 underline" to={`/login?redirect=${encodeURIComponent(`/forms/${id}`)}`}>前往登录</Link>}
        </p>}
        <button className="rounded-lg bg-accent-primary px-6 py-3 font-medium text-fg-inverse disabled:opacity-50"
          type="submit" disabled={Boolean(disabledReason) || sending}>
          {sending ? "提交中…" : "提交"}
        </button>
      </form>}
  </main>;
}
