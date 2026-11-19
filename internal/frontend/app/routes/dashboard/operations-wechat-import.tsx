import { useEffect, useState, type ChangeEvent } from "react";
import { Link } from "react-router";
import {
  getOperationsBoard, importWeChatFollowers, importWeChatVideoFollowers, importWeChatVideoPosts,
} from "~/lib/operations-progress-client";
import "./operations-progress.css";

export function meta() { return [{ title: "导入公众号关注数据 | TARSGO" }]; }

export function OperationsFollowerImportPage({ platform }: { platform: "wechat" | "wechat_video" }) {
  const isVideo = platform === "wechat_video";
  const name = isVideo ? "视频号" : "公众号";
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<"posts" | "followers" | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "posts" | "followers"; error: boolean; message: string } | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    void getOperationsBoard().then((board) => { if (active) setCanManage(board.canManage); })
      .catch((cause) => { if (active) setLoadError(cause instanceof Error ? cause.message : "加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function upload(kind: "posts" | "followers", event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !window.confirm(`确认导入「${file.name}」的${name}${kind === "posts" ? "作品" : "关注"}记录？`)) return;
    setImporting(kind);
    setFeedback(null);
    try {
      if (kind === "posts") {
        const response = await importWeChatVideoPosts(file);
        setFeedback({ kind, error: false, message: `已更新 ${response.count} 条作品` });
      } else {
        const response = isVideo ? await importWeChatVideoFollowers(file) : await importWeChatFollowers(file);
        setFeedback({ kind, error: false, message: `已更新 ${response.count} 天关注数据（${response.first} 至 ${response.last}）` });
      }
    } catch (cause) {
      setFeedback({ kind, error: true, message: cause instanceof Error ? cause.message : "导入失败" });
    } finally {
      setImporting(null);
    }
  }

  const followerField = <div className="grid gap-2">
    <label>{isVideo ? "关注者增长详情（.csv）" : "用户增长（.xls）"}
      <input type="file" accept={isVideo ? ".csv" : ".xls"} aria-label={`选择${name}关注数据表格`}
        disabled={importing !== null} onChange={(event) => void upload("followers", event)} />
    </label>
    {feedback?.kind === "followers" ? <p role={feedback.error ? "alert" : "status"}
      className={feedback.error ? "operations-progress__error" : ""}>{feedback.message}</p> : null}
  </div>;

  return <main className="operations-progress operations-progress__step-page admin-design">
    <Link className="operations-progress__back" to="/dashboard/workbench/operations">返回战队动态</Link>
    <section className="operations-progress__item operations-progress__status-editor">
      <h1>导入{name}{isVideo ? "数据" : "关注数据"}</h1>
      {loadError ? <p className="operations-progress__error" role="alert">{loadError}</p> : null}
      {loading ? <p className="operations-progress__muted">正在加载…</p> : !canManage
        ? <p className="operations-progress__muted">无导入权限</p>
        : <div className="grid gap-5">
          {isVideo ? <div className="grid gap-2">
            <label>单篇视频 · 动态数据明细（.csv）
              <input type="file" accept=".csv" aria-label="选择视频号单篇视频数据表格"
                disabled={importing !== null} onChange={(event) => void upload("posts", event)} />
            </label>
            {feedback?.kind === "posts" ? <p role={feedback.error ? "alert" : "status"}
              className={feedback.error ? "operations-progress__error" : ""}>{feedback.message}</p> : null}
          </div> : null}
          {followerField}
        </div>}
    </section>
  </main>;
}

export default function OperationsWeChatImportPage() {
  return <OperationsFollowerImportPage platform="wechat" />;
}
