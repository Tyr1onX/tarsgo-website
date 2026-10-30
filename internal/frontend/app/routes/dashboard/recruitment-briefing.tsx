import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router";

import { apiRequest } from "~/lib/api-client";
import { hasOperationsWorkManualAccess } from "~/lib/dashboard-navigation";
import type { ManualDocument, OperationsCatalogue } from "~/lib/work-manual-content";
import type { DashboardLayoutOutletContext } from "./layout";
import "./work-manual.css";

export function meta() {
  return [{ title: "招新宣讲流程 | TARSGO" }];
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

  if (!canRead) {
    return <main className="work-manual briefing-flow admin-design">
      <p className="work-manual__status">当前账号无权查看运营组 SOP。</p>
    </main>;
  }

  const steps = document?.sections.flatMap((section) =>
    section.blocks.filter((block) => block.type === "step")) ?? [];

  return <main className="work-manual briefing-flow admin-design">
    <Link className="briefing-flow__back" to="/dashboard/guide?tab=operations">返回工作手册</Link>
    <h1>招新宣讲流程</h1>
    {document ? <ol className="briefing-flow__steps">
      {steps.map((step, index) => step.type === "step" && <li key={step.title}>
        <span className="briefing-flow__number">{String(index + 1).padStart(2, "0")}</span>
        <div>
          <h2>{step.title}</h2>
          {step.items.map((item) => <p key={item}>{item}</p>)}
        </div>
      </li>)}
    </ol> : <div className="work-manual__status" role={error ? "alert" : "status"}>
      <p>{error || "正在加载流程…"}</p>
      {error ? <button type="button" onClick={() => { setError(""); setRetry((value) => value + 1); }}>重试</button> : null}
    </div>}
  </main>;
}
