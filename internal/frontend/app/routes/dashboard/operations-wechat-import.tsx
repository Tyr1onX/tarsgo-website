import { useEffect, useState, type ChangeEvent } from "react";
import { Link } from "react-router";
import { getOperationsBoard, importWeChatFollowers } from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() { return [{ title: "导入公众号关注数据 | TARSGO" }]; }

export default function OperationsWeChatImportPage() {
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getOperationsBoard().then((board) => { if (active) setCanManage(board.canManage); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !window.confirm(`确认导入「${file.name}」的公众号关注记录？`)) return;
    setImporting(true);
    setError("");
    setResult("");
    try {
      const response = await importWeChatFollowers(file);
      setResult(`已更新 ${response.count} 天关注数据（${response.first} 至 ${response.last}）`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导入失败");
    } finally {
      setImporting(false);
    }
  }

  return <main className="operations-progress operations-progress__step-page admin-design">
    <Link className="operations-progress__back" to="/dashboard/workbench/operations">返回战队动态</Link>
    <section className="operations-progress__item operations-progress__status-editor">
      <h1>导入公众号关注数据</h1>
      {error ? <p className="operations-progress__error" role="alert">{error}</p> : null}
      {loading ? <p className="operations-progress__muted">正在加载…</p> : !canManage
        ? <p className="operations-progress__muted">无导入权限</p>
        : <label>用户增长（.xls）
          <input type="file" accept=".xls" aria-label="选择公众号用户增长表格" disabled={importing}
            onChange={(event) => void upload(event)} />
        </label>}
      {result ? <p role="status">{result}</p> : null}
    </section>
  </main>;
}