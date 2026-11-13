import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";

import { collectionClient, type CollectionField, type CollectionForm, type CollectionViewer } from "~/lib/collection-forms-client";
import { accountProfilePath } from "~/lib/account-profile";
import { CollectionFormFields } from "~/components/collection-form-fields";

export function meta() { return [{ title: "收集表 | TARSGO" }]; }

export default function CollectionFormPage() {
  const params = useParams();
  const id = Number(params.id);
  const [form, setForm] = useState<CollectionForm | null>(null);
  const [remaining, setRemaining] = useState(-1);
  const [viewer, setViewer] = useState<CollectionViewer | null>(null);
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
    setViewer(data.viewer);
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    if (!Number.isSafeInteger(id) || id <= 0) { setError("表单不存在"); setLoading(false); return; }
    void collectionClient.publicForm(id).then((data) => {
      if (active) { setForm(data.form); setRemaining(data.remaining); setViewer(data.viewer); }
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
        setViewer(data.viewer);
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
      !form ? <section className="space-y-3">
        <p role="alert">{error || "表单不存在"}</p>
        {error.includes("登录") && <Link className="inline-block underline"
          to={`/login?redirect=${encodeURIComponent(`/forms/${id}`)}`}>登录后填写</Link>}
      </section> :
      done ? <section className="rounded-xl border border-border-subtle p-6">
        <h1 className="text-2xl font-semibold">提交成功</h1>
        <p className="mt-3 text-fg-muted">{form.title}</p>
        <Link className="mt-5 inline-block underline" to="/">返回首页</Link>
      </section> :
      viewer && !viewer.profileComplete ? <section className="space-y-4 rounded-xl border border-border-subtle p-6">
        <h1 className="text-2xl font-semibold">{form.title}</h1>
        <p>请先完善个人资料，再参加这次收集。</p>
        <Link className="inline-block underline"
          to={accountProfilePath(viewer.participant.userId, `/forms/${id}`)}>完善个人资料</Link>
      </section> :
      viewer?.submitted ? <section className="space-y-3 rounded-xl border border-border-subtle p-6">
        <h1 className="text-2xl font-semibold">{form.title}</h1>
        <p>你已经提交过此表单。</p>
      </section> :
      <form className="space-y-6" onSubmit={(event) => void submit(event)}>
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold">{form.title}</h1>
          {form.description && <p className="whitespace-pre-wrap text-fg-muted">{form.description}</p>}
          {viewer && <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg-muted">
            <span>填写人：{viewer.participant.realName}
              {viewer.participant.college ? ` · ${viewer.participant.college}` : ""}</span>
            <Link className="underline"
              to={accountProfilePath(viewer.participant.userId, `/forms/${id}`)}>修改个人资料</Link>
          </div>}
          {remaining >= 0 && <p className="text-sm text-fg-muted">剩余 {remaining} 个名额</p>}
        </header>
        <CollectionFormFields fields={form.fields} answers={answers} onAnswer={update} disabled={Boolean(disabledReason) || sending} />
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
