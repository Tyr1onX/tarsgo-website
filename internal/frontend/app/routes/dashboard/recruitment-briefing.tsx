import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router";

import { WorkManualDocument } from "~/components/work-manual-document";
import { apiRequest } from "~/lib/api-client";
import { hasOperationsWorkManualAccess } from "~/lib/dashboard-navigation";
import type { ManualDocument, OperationsCatalogue } from "~/lib/work-manual-content";
import type { DashboardLayoutOutletContext } from "./layout";
import "./work-manual.css";

export function meta() {
  return [{ title: "招新宣讲活动筹备与现场执行 | 工作手册 | TARSGO" }];
}

export default function RecruitmentBriefingRoute() {
  const { currentUser, groupResolution } = useOutletContext<DashboardLayoutOutletContext>();
  const canRead = hasOperationsWorkManualAccess(currentUser, groupResolution?.groups);
  const [document, setDocument] = useState<ManualDocument | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!canRead) return;
    let active = true;
    apiRequest<OperationsCatalogue>("/api/work-manual/operations")
      .then((catalogue) => {
        if (!active) return;
        const briefing = catalogue.documents.find((item) => item.slug === "recruitment-briefing");
        if (briefing) setDocument(briefing);
        else setError("流程暂不可用。");
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "加载失败，请重试。");
      });
    return () => { active = false; };
  }, [canRead, retry]);

  return <main className="work-manual admin-design mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-6">
    <Link className="work-manual__back" to="/dashboard/guide?tab=operations">返回工作手册</Link>
    {!canRead ? <p className="work-manual__status">当前账号无权查看运营组 SOP。</p>
      : document ? <WorkManualDocument document={document} titleLevel={1} />
        : <div className="work-manual__status" role={error ? "alert" : "status"}>
          <p>{error || "正在加载 SOP…"}</p>
          {error ? <button type="button" onClick={() => { setError(""); setRetry((value) => value + 1); }}>重试</button> : null}
        </div>}
  </main>;
}
