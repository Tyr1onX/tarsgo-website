import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useOutletContext } from "react-router";

import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { ApiError, apiRequest } from "~/lib/api-client";
import { hasAssignmentGroupAccess, hasOperationsWorkManualAccess } from "~/lib/dashboard-navigation";
import "./work-manual.css";

type ManualLink = { label: string; href: string };
type ManualBlock =
  | { type: "paragraph"; text: string }
  | { type: "step"; title: string; items: string[]; links?: ManualLink[] }
  | { type: "list"; label?: string; items: string[] }
  | { type: "note"; text: string }
  | { type: "download"; label: string; href: string }
  | { type: "links"; items: ManualLink[] };
type ManualSection = { id: string; title: string; blocks: ManualBlock[] };
type ManualDocument = { slug: string; title: string; sections: ManualSection[] };
type OperationsCatalogue = { documents: ManualDocument[] };

export function meta() {
  return [{ title: "工作手册 | TARSGO" }];
}

function GuideLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="text-[var(--admin-accent-text)] underline underline-offset-2" to={to}>{children}</Link>;
}

function WebsiteGuide({ currentUser, groupResolution }: Pick<DashboardLayoutOutletContext, "currentUser" | "groupResolution">) {
  const canManage = ["admin", "super_admin"].includes(currentUser.role.name);
  const canUseAssignments = currentUser.role.name === "super_admin" || hasAssignmentGroupAccess(groupResolution?.groups);

  return <section className="admin-design mx-auto w-full max-w-4xl space-y-5" aria-labelledby="website-guide-title">
    <header>
      <h2 id="website-guide-title" className="text-xl font-semibold">网站使用指南</h2>
      <p className="mt-2 text-sm text-[var(--admin-muted)]">工作台按当前开放的日常事务和作业流程整理；入口仍由账号权限和所属组别决定。</p>
    </header>

    <section className="space-y-4 rounded-xl border border-[var(--admin-border-subtle)] p-4 sm:p-5" aria-labelledby="daily-guide-title">
      <h3 id="daily-guide-title" className="text-lg font-semibold">日常事务</h3>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
        <li>在 <GuideLink to="/dashboard/weekly-reports">工作周报</GuideLink> 记录和维护自己的工作进展。</li>
        <li>在 <GuideLink to="/dashboard/leave">请假工作台</GuideLink> 提交、查询和管理自己的请假申请。</li>
        {canManage ? <li>在「日常事务」下的「请假管理」处理自己有权限管理的申请；授权审批仍仅限超级管理员。</li> : null}
        <li>成员可在「个人资料 → 课程时间」上传或更新教务系统导出的 Excel 课表；工作台仅使用课表计算空闲情况。</li>
      </ol>
    </section>

    {!canManage ? <section className="space-y-4 rounded-xl border border-[var(--admin-border-subtle)] p-4 sm:p-5" aria-labelledby="member-guide-title">
      <h3 id="member-guide-title" className="text-lg font-semibold">成员使用</h3>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
        <li>登录后点右上角“个人资料”核对姓名、联系方式和组别；组别有误时联系管理员。</li>
        {canUseAssignments ? <li>机械组、电控组、视觉组、AI 组和运营组成员可在 <GuideLink to="/dashboard/assignments">我的作业</GuideLink> 查看作业要求、提交成果并查看批改反馈。</li> : null}
        <li>目前新人培养只开放作业流程；其他培养入口和 TARS BASE 暂未开放。</li>
      </ol>
    </section> : null}

    {canManage ? <section className="space-y-4 rounded-xl border border-[var(--admin-border-subtle)] p-4 sm:p-5" aria-labelledby="admin-guide-title">
      <h3 id="admin-guide-title" className="text-lg font-semibold">管理员使用</h3>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
        {currentUser.role.name === "super_admin" ? <li>在 <GuideLink to="/dashboard/admin/users">账号与权限</GuideLink> 管理账号和组别。</li> : null}
        {canUseAssignments ? <li>对已授权的五个组别之一，在 <GuideLink to="/dashboard/admin/training/assignments">作业管理</GuideLink> 发布和管理本组作业，在 <GuideLink to="/dashboard/admin/training/submissions">提交记录</GuideLink> 查看提交并批改。</li> : null}
        <li>在 <GuideLink to="/dashboard/admin/timetable-availability">时间协调</GuideLink> 查看全组空闲人数、具体成员及个人时段。</li>
        <li>新人培养当前仅开放作业管理和提交批改；其他培养入口暂未开放，历史记录保留。</li>
      </ol>
    </section> : null}
  </section>;
}

function ManualBlockView({ block }: { block: ManualBlock }) {
  switch (block.type) {
    case "paragraph":
      return <p className="work-manual__paragraph">{block.text}</p>;
    case "step":
      return <section className="work-manual__step">
        <h3>{block.title}</h3>
        <ol>{block.items.map((item) => <li key={item}>{item}</li>)}</ol>
        {block.links?.length ? <div className="work-manual__related-links">{block.links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}</div> : null}
      </section>;
    case "list":
      return <div className="work-manual__list-block">
        {block.label ? <h3>{block.label}</h3> : null}
        <ul>{block.items.map((item) => <li key={item}>{item}</li>)}</ul>
      </div>;
    case "note":
      return <p className="work-manual__note">{block.text}</p>;
    case "download":
      return <a className="work-manual__download" href={block.href} download>{block.label}<span aria-hidden="true">↓</span></a>;
    case "links":
      return <div className="work-manual__related-links">{block.items.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}</div>;
  }
}

function OperationsSOP({ catalogue, selectedSlug, onSelect }: {
  catalogue: OperationsCatalogue;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}) {
  const document = catalogue.documents.find((item) => item.slug === selectedSlug) ?? catalogue.documents[0];
  if (!document) return <p className="work-manual__empty">暂无已发布的运营组 SOP。</p>;

  return <div className="work-manual__reading-layout">
    <nav className="work-manual__directory" aria-label="运营组 SOP 目录">
      <p className="work-manual__directory-label">运营组 SOP</p>
      <ul className="work-manual__document-list">
        {catalogue.documents.map((item) => <li key={item.slug}><button type="button" className="work-manual__directory-item" aria-current={item.slug === document.slug ? "page" : undefined} onClick={() => onSelect(item.slug)}>{item.title}</button></li>)}
      </ul>
      <ol>
        {document.sections.map((section) => <li key={section.id}><a href={`#${document.slug}-${section.id}`}>{section.title}</a></li>)}
      </ol>
    </nav>

    <article className="work-manual__article">
      <h2>{document.title}</h2>
      {document.sections.map((section) => <section className="work-manual__section" id={`${document.slug}-${section.id}`} key={section.id} aria-labelledby={`${document.slug}-${section.id}-title`}>
        <h2 id={`${document.slug}-${section.id}-title`}>{section.title}</h2>
        <div className="work-manual__section-content">
          {section.blocks.map((block, index) => <ManualBlockView key={`${block.type}-${index}`} block={block} />)}
        </div>
      </section>)}
    </article>
  </div>;
}

export default function GuideRoute() {
  const { currentUser, groupResolution } = useOutletContext<DashboardLayoutOutletContext>();
  const canReadOperationsSOP = hasOperationsWorkManualAccess(currentUser, groupResolution?.groups);
  const [activeTab, setActiveTab] = useState<"website" | "operations">("website");
  const [operationsCatalogue, setOperationsCatalogue] = useState<OperationsCatalogue | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [operationsError, setOperationsError] = useState<{ message: string; status: number } | null>(null);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [hasRequestedOperations, setHasRequestedOperations] = useState(false);
  const operationsRequestStarted = useRef(false);

  useEffect(() => {
    if (activeTab !== "operations" || !canReadOperationsSOP || operationsCatalogue || hasRequestedOperations || operationsRequestStarted.current) return;
    operationsRequestStarted.current = true;
    setHasRequestedOperations(true);
    setOperationsLoading(true);
    setOperationsError(null);
    apiRequest<OperationsCatalogue>("/api/work-manual/operations")
      .then((catalogue) => setOperationsCatalogue(catalogue))
      .catch((error: unknown) => setOperationsError({
        message: error instanceof ApiError ? error.message : "工作手册暂时无法加载，请稍后重试。",
        status: error instanceof ApiError ? error.status : 0,
      }))
      .finally(() => setOperationsLoading(false));
  }, [activeTab, canReadOperationsSOP, hasRequestedOperations, operationsCatalogue]);

  const retryOperations = () => {
    operationsRequestStarted.current = false;
    setHasRequestedOperations(false);
    setOperationsError(null);
  };

  return <main className="work-manual admin-design mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
    <header className="work-manual__header">
      <h1 className="text-2xl font-semibold">工作手册</h1>
      <div className="work-manual__tabs" role="group" aria-label="工作手册内容">
        <button type="button" aria-pressed={activeTab === "website"} onClick={() => setActiveTab("website")}>网站使用指南</button>
        {canReadOperationsSOP ? <button type="button" aria-pressed={activeTab === "operations"} onClick={() => setActiveTab("operations")}>运营组 SOP</button> : null}
      </div>
    </header>

    <div>
      {activeTab === "website" ? <WebsiteGuide currentUser={currentUser} groupResolution={groupResolution} /> : null}
      {activeTab === "operations" ? operationsLoading ? <p className="work-manual__status" role="status">正在加载 SOP…</p>
        : operationsError ? <div className="work-manual__status" role={operationsError.status === 403 ? "status" : "alert"}>
          <p>{operationsError.message}</p>
          {operationsError.status !== 403 && operationsError.status !== 401 ? <button type="button" onClick={retryOperations}>重试</button> : null}
        </div>
          : operationsCatalogue ? <OperationsSOP catalogue={operationsCatalogue} selectedSlug={selectedSlug} onSelect={setSelectedSlug} />
            : null : null}
    </div>
  </main>;
}
