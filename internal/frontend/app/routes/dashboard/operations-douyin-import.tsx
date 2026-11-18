import { useEffect, useState, type ChangeEvent } from "react";
import { Link } from "react-router";
import { getOperationsBoard, importDouyinFans, importDouyinPosts } from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() { return [{ title: "导入抖音数据 | TARSGO" }]; }

export default function OperationsDouyinImportPage() {
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<"posts" | "fans" | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "posts" | "fans"; error: boolean; message: string } | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    void getOperationsBoard().then((board) => { if (active) setCanManage(board.canManage); })
      .catch((cause) => { if (active) setLoadError(cause instanceof Error ? cause.message : "加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function upload(kind: "posts" | "fans", event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !window.confirm(`确认导入「${file.name}」的抖音${kind === "posts" ? "作品" : "粉丝"}记录？`)) return;
    setImporting(kind);
    setFeedback(null);
    try {
      const response = kind === "posts" ? await importDouyinPosts(file) : await importDouyinFans(file);
      setFeedback({ kind, error: false, message: kind === "posts"
        ? `已更新 ${response.count} 条公开作品` : `已更新 ${response.count} 天粉丝数据` });
    } catch (cause) {
      setFeedback({ kind, error: true, message: cause instanceof Error ? cause.message : "导入失败" });
    } finally {
      setImporting(null);
    }
  }

  return <main className="operations-progress operations-progress__step-page admin-design">
    <Link className="operations-progress__back" to="/dashboard/workbench/operations">返回战队动态</Link>
    <section className="operations-progress__item operations-progress__status-editor">
      <h1>导入抖音数据</h1>
      {loadError ? <p className="operations-progress__error" role="alert">{loadError}</p> : null}
      {loading ? <p className="operations-progress__muted">正在加载…</p> : !canManage
        ? <p className="operations-progress__muted">无导入权限</p>
        : <div className="grid gap-5">
          <div className="grid gap-2">
            <label>作品列表（.xlsx）
              <input type="file" accept=".xlsx" aria-label="选择抖音作品列表" disabled={importing !== null}
                onChange={(event) => void upload("posts", event)} />
            </label>
            {feedback?.kind === "posts" ? <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "operations-progress__error" : ""}>{feedback.message}</p> : null}
          </div>
          <div className="grid gap-2">
            <label>粉丝数据（.xlsx）
              <input type="file" accept=".xlsx" aria-label="选择抖音粉丝数据" disabled={importing !== null}
                onChange={(event) => void upload("fans", event)} />
            </label>
            {feedback?.kind === "fans" ? <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "operations-progress__error" : ""}>{feedback.message}</p> : null}
          </div>
        </div>}
    </section>
  </main>;
}