import { useState, type FormEvent } from "react";
import { Link, redirect } from "react-router";

import type { Route } from "./+types/join-interest";
import { PublicHomePage } from "./home";
import { ApiError, apiRequest } from "~/lib/api-client";
import "~/components/join-experience.css";
import "./join-interest.css";

type JoinInterest = {
  id: number;
  preferredGroupId: number | null;
  qq: string;
  motivation: string;
  background: string;
  source: string;
  status: "pending" | "contacted" | "closed";
};

type InterestPageData = {
  groups: { id: number; name: string }[];
  interest: JoinInterest | null;
};

export function meta() {
  return [
    { title: "加入意向登记 | TARSGO" },
    { name: "description", content: "全年开放的吉甲大师战队入队意向登记" },
  ];
}

export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  try {
    const data = await apiRequest<InterestPageData>("/api/join-interest");
    return { ...data, source: new URL(request.url).searchParams.get("ch")?.slice(0, 60) ?? "" };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const url = new URL(request.url);
      throw redirect(`/login?redirect=${encodeURIComponent(url.pathname + url.search)}`);
    }
    throw error;
  }
}

clientLoader.hydrate = true;

export default function JoinInterestPage({ loaderData }: Route.ComponentProps) {
  const { groups, interest: initial, source } = loaderData;
  const [interest, setInterest] = useState<JoinInterest | null>(initial);
  const [groupId, setGroupId] = useState(initial?.preferredGroupId?.toString() ?? "");
  const [qq, setQQ] = useState(initial?.qq ?? "");
  const [motivation, setMotivation] = useState(initial?.motivation ?? "");
  const [background, setBackground] = useState(initial?.background ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const saved = await apiRequest<JoinInterest>("/api/join-interest", {
        method: "PUT",
        body: {
          preferredGroupId: groupId ? Number(groupId) : null,
          qq: qq.trim(),
          motivation: motivation.trim(),
          background: background.trim(),
          source,
        },
      });
      setInterest(saved);
      setMessage("加入意向已登记，我们会通过 QQ 联系你。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  async function withdraw() {
    if (!window.confirm("确定撤回加入意向？这不会影响已有的正式招新报名。")) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await apiRequest("/api/join-interest", { method: "DELETE" });
      setInterest(null);
      setMessage("已撤回加入意向");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "撤回失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PublicHomePage page="join">
      <main className="join-page join-interest">
        <div className="join-page__container">
          <div className="join-interest__header">
            <Link to="/join" className="join-interest__back">← 返回加入战队</Link>
            <h1>加入意向登记</h1>
            <p>全年开放。填写意向不等于正式招新报名，培训资格仍以招新审核结果为准。</p>
          </div>
          <form className="join-interest__form" onSubmit={save} aria-busy={saving}>
            {interest ? <p className="join-interest__saved" role="status">已登记 · {interest.status === "pending" ? "待联系" : interest.status === "contacted" ? "已联系" : "已结束"}</p> : null}
            <label>
              <span>意向组别</span>
              <select value={groupId} onChange={(event) => setGroupId(event.target.value)} disabled={saving}>
                <option value="">暂未确定</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
            <label>
              <span>QQ 号</span>
              <input type="text" inputMode="numeric" pattern="[1-9][0-9]{4,11}" title="请输入 5 至 12 位 QQ 号" required maxLength={12} value={qq} onChange={(event) => setQQ(event.target.value)} disabled={saving} autoComplete="off" />
            </label>
            <label>
              <span>为什么想加入？（选填）</span>
              <textarea rows={3} maxLength={500} value={motivation} onChange={(event) => setMotivation(event.target.value)} disabled={saving} />
            </label>
            <label>
              <span>相关经历或技术基础（选填）</span>
              <textarea rows={3} maxLength={500} value={background} onChange={(event) => setBackground(event.target.value)} disabled={saving} />
            </label>
            <div className="join-interest__actions">
              <button type="submit" className="join-action join-action--primary" disabled={saving}>{saving ? "保存中…" : interest ? "更新意向" : "提交意向"}</button>
              {interest ? <button type="button" className="join-interest__withdraw" onClick={() => void withdraw()} disabled={saving}>撤回意向</button> : null}
            </div>
            {message ? <p className="join-interest__success" role="status">{message}</p> : null}
            {error ? <p className="join-interest__error" role="alert">{error}</p> : null}
          </form>
          <p className="join-interest__next">正式招新开放后，继续使用此账号<Link to="/dashboard/users/registrations">提交当届报名</Link>。</p>
        </div>
      </main>
    </PublicHomePage>
  );
}
