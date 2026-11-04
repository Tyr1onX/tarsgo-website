import { useEffect, useState } from "react";
import { useOutletContext } from "react-router";
import { apiRequest } from "~/lib/api-client";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import "./recruitment-records.css";

type ArchivePage = { datasets: { key: string; label: string }[]; columns: string[]; rows: string[][]; nextCursor: string };

export function RecruitmentRecords() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [dataset, setDataset] = useState("recruitment");
  const [cursors, setCursors] = useState([""]);
  const [datasets, setDatasets] = useState([{key:"recruitment",label:"历史报名"},{key:"cultivation-notes",label:"培养备注"}]);
  const [page, setPage] = useState<ArchivePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const cursor = cursors[cursors.length - 1];
  useEffect(() => {
    const controller = new AbortController();
    setPage(null); setError(""); setLoading(true);
    if (currentUser.role.name !== "super_admin") { setLoading(false); return; }
    const search = new URLSearchParams({ dataset, cursor });
    apiRequest<ArchivePage>(`/api/admin/recruitment/retained-records?${search}`, { signal: controller.signal, cache: "no-store" })
      .then((value) => { if (!controller.signal.aborted) { setPage(value); setDatasets(value.datasets); } })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "读取失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [currentUser.id, currentUser.role.name, dataset, cursor, retry]);
  if (currentUser.role.name !== "super_admin") return <p role="alert">无权查看保留记录。</p>;
  return <section className="admin-design recruitment-records">
    <header><h2>早期报名与培养备注</h2><p>主要组别按最终录取组、意向组、第一志愿依次保留；旧最终结果与现行结果分别展示。</p></header>
    <label>档案类别 <select className="admin-field" value={dataset} disabled={loading} onChange={(event) => { setPage(null); setDataset(event.target.value); setCursors([""]); }}>
      {datasets.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
    </select></label>
    {loading ? <p role="status">正在读取档案…</p> : null}
    {error ? <p role="alert">{error} <button type="button" onClick={() => setRetry((value) => value + 1)}>重试</button></p> : null}
    {page?.rows.length ? <div className="recruitment-records__scroll" role="region" aria-label="历史记录" tabIndex={0}><table><caption>{page.datasets.find((item) => item.key === dataset)?.label} · 第 {cursors.length} 页</caption><thead><tr>{page.columns.map((column) => <th scope="col" key={column}>{column}</th>)}</tr></thead><tbody>
      {page.rows.map((row) => <tr key={row[0]}>{row.map((value, index) => <td key={index}>{value || "—"}</td>)}</tr>)}
    </tbody></table></div> : !loading && !error ? <p>没有保留的记录。</p> : null}
    <nav aria-label="档案分页"><button type="button" disabled={loading || cursors.length === 1} onClick={() => setCursors((values) => values.slice(0, -1))}>上一页</button><button type="button" disabled={loading || !page?.nextCursor} onClick={() => { if (page?.nextCursor) setCursors((values) => [...values, page.nextCursor]); }}>下一页</button></nav>
  </section>;
}
