import { useEffect, useState } from "react";
import { apiRequest } from "~/lib/api-client";

type InterestItem = {
  id: number;
  userId: number;
  realName: string;
  email: string;
  college: string;
  grade: string;
  groupName: string;
  qq: string;
  motivation: string;
  background: string;
  source: string;
  status: string;
  createdAt: string;
};

type ListResult = { items: InterestItem[]; total: number; page: number };
const statusLabels: Record<string, string> = { pending: "待联系", contacted: "已联系", closed: "已结束" };

export function JoinInterests() {
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void apiRequest<ListResult>(`/api/admin/join-interests?status=${encodeURIComponent(status)}&page=${page}`)
      .then((data) => { if (active) setResult(data); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status, page, version]);

  async function updateStatus(id: number, next: string) {
    setUpdating(id);
    setError("");
    try {
      await apiRequest(`/api/admin/join-interests/${id}`, { method: "PATCH", body: { status: next } });
      setVersion((current) => current + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "更新失败");
    } finally {
      setUpdating(null);
    }
  }

  return (
    <section className="space-y-4" aria-label="常驻入队意向">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">常驻入队意向</h2>
        <label className="flex items-center gap-2 text-sm">
          <span>联系状态</span>
          <select className="admin-field" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="pending">待联系</option>
            <option value="contacted">已联系</option>
            <option value="closed">已结束</option>
            <option value="">全部</option>
          </select>
        </label>
      </div>
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="text-sm text-fg-muted">加载中…</p> : result?.items.length ? (
        <div className="overflow-x-auto">
          <table className="admin-table w-full">
            <thead><tr>
              <th scope="col">姓名 / 学院</th>
              <th scope="col">意向组别</th>
              <th scope="col">QQ / 邮箱</th>
              <th scope="col">加入原因 / 相关基础</th>
              <th scope="col">来源</th>
              <th scope="col">登记时间</th>
              <th scope="col">联系状态</th>
            </tr></thead>
            <tbody>
              {result.items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.realName || "未填写姓名"}</strong><div className="text-xs text-fg-muted">{[item.college, item.grade].filter(Boolean).join(" · ")}</div></td>
                  <td>{item.groupName || "—"}</td>
                  <td><div>{item.qq}</div><div className="text-xs">{item.email}</div></td>
                  <td className="max-w-64 whitespace-normal">
                    {item.motivation || "—"}
                    {item.background ? <div className="mt-1 text-xs text-fg-muted">{item.background}</div> : null}
                  </td>
                  <td>{item.source || "—"}</td>
                  <td>{new Date(item.createdAt).toLocaleDateString("zh-CN")}</td>
                  <td>
                    <select
                      aria-label={`更新${item.realName || item.email}的联系状态`}
                      className="admin-field"
                      value={item.status}
                      disabled={updating !== null}
                      onChange={(event) => void updateStatus(item.id, event.target.value)}
                    >
                      {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-fg-muted">暂无对应状态的意向登记</p>}
      {result && result.total > 0 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>共 {result.total} 条</span>
          <div className="flex items-center gap-2">
            <button className="admin-button admin-button--small admin-button--secondary" disabled={loading || page === 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
            <span>{page} / {Math.ceil(result.total / 50)}</span>
            <button className="admin-button admin-button--small admin-button--secondary" disabled={loading || page * 50 >= result.total} onClick={() => setPage((p) => p + 1)}>下一页</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
