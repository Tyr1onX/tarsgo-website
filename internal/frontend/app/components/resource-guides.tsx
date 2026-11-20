import { BrandLoader } from "~/components/brand-loader";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";

import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { WorkManualDocument } from "~/components/work-manual-document";
import { ApiError, apiRequest } from "~/lib/api-client";
import { hasAssignmentGroupAccess, hasWorkbenchAccess } from "~/lib/dashboard-navigation";
import { resolveManualDocument, type OperationsCatalogue } from "~/lib/work-manual-content";
import "~/routes/dashboard/work-manual.css";

function GuideLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="text-[var(--admin-accent-text)] underline underline-offset-2" to={to}>{children}</Link>;
}

export function WebsiteGuide({ currentUser, groupResolution }: Pick<DashboardLayoutOutletContext, "currentUser" | "groupResolution">) {
  const hasWorkbench = hasWorkbenchAccess(currentUser);
  const canManage = hasWorkbench && ["admin", "super_admin"].includes(currentUser.role.name);
  const canUseAssignments = currentUser.role.name === "super_admin" || hasAssignmentGroupAccess(groupResolution?.groups);

  return <section className="admin-design mx-auto w-full max-w-4xl space-y-5" aria-labelledby="website-guide-title">
    <header>
      <h2 id="website-guide-title" className="text-xl font-semibold">网站使用指南</h2>
      {!hasWorkbench ? <p className="mt-2 text-sm text-[var(--admin-muted)]">工作台功能按账号权限开放。</p> : null}
    </header>

    {hasWorkbench ? <section className="space-y-4 rounded-xl border border-[var(--admin-border-subtle)] p-4 sm:p-5" aria-labelledby="daily-guide-title">
      <h3 id="daily-guide-title" className="text-lg font-semibold">日常事务</h3>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
        <li>在 <GuideLink to="/dashboard/weekly-reports">工作周报</GuideLink> 记录和维护自己的工作进展。</li>
        <li>在 <GuideLink to="/dashboard/leave">请假工作台</GuideLink> 提交、查询和管理自己的请假申请。</li>
        {canManage ? <li>在「日常事务」下的「请假」中处理自己有权限管理的申请；授权审批仍仅限超级管理员。</li> : null}
        <li>成员可在 <GuideLink to="/dashboard/timetable">课程时间</GuideLink> 上传或更新教务系统导出的 Excel 课表；工作台仅使用课表计算空闲情况。</li>
      </ol>
    </section> : null}

    {!canManage && hasWorkbench ? <section className="space-y-4 rounded-xl border border-[var(--admin-border-subtle)] p-4 sm:p-5" aria-labelledby="member-guide-title">
      <h3 id="member-guide-title" className="text-lg font-semibold">成员使用</h3>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
        <li>登录后打开左下角账号菜单中的“我的主页”，点击姓名、头像或个人介绍即可直接编辑；组别和战队职务由管理员维护。</li>
        {canUseAssignments ? <li>机械组、电控组、视觉组、AI 组和运营组成员可在 <GuideLink to="/dashboard/assignments">我的作业</GuideLink> 查看作业要求、提交成果并查看批改反馈。</li> : null}
        <li>入门与技术学习资料统一在 <GuideLink to="/dashboard/training-materials">资料中心</GuideLink> 查阅。</li>
      </ol>
    </section> : null}

    {canManage ? <section className="space-y-4 rounded-xl border border-[var(--admin-border-subtle)] p-4 sm:p-5" aria-labelledby="admin-guide-title">
      <h3 id="admin-guide-title" className="text-lg font-semibold">管理员使用</h3>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
        {currentUser.role.name === "super_admin" ? <li>在 <GuideLink to="/dashboard/admin/users">账号与权限</GuideLink> 管理账号和组别。</li> : null}
        {canUseAssignments ? <li>对已授权的五个组别之一，在 <GuideLink to="/dashboard/admin/training/assignments">作业管理</GuideLink> 发布作业、查看进度并批改提交。</li> : null}
        <li>在 <GuideLink to="/dashboard/admin/timetable-availability">时间协调</GuideLink> 查看全组空闲人数、具体成员及个人时段。</li>
        <li>学习资料在 <GuideLink to="/dashboard/training-materials">资料中心</GuideLink>，作业管理与评分仍在管理页面处理。</li>
      </ol>
    </section> : null}
  </section>;
}

function OperationsSOP({ catalogue }: { catalogue: OperationsCatalogue }) {
  const [selectedSlug, setSelectedSlug] = useState(catalogue.documents[0]?.slug ?? "");
  const document = resolveManualDocument(catalogue.documents, selectedSlug);
  if (!document) return <p className="work-manual__empty">暂无已发布的运营组 SOP。</p>;

  return <div className="work-manual__reading-layout">
    <nav className="work-manual__directory" aria-label="运营组 SOP 目录">
      <p className="work-manual__directory-label">运营组 SOP</p>
      <ul className="work-manual__document-list">
        {catalogue.documents.map((item) => <li key={item.slug}><button
          type="button"
          className="work-manual__directory-item"
          aria-current={item.slug === document.slug ? "page" : undefined}
          onClick={() => setSelectedSlug(item.slug)}
        >{item.title}</button></li>)}
      </ul>
    </nav>
    <WorkManualDocument document={document} titleLevel={2} />
  </div>;
}


export function CommonQuestions() {
  return <section className="admin-design mx-auto w-full max-w-4xl space-y-5" aria-labelledby="common-questions-title">
    <h1 id="common-questions-title" className="text-xl font-semibold">常见问题</h1>
    <dl className="space-y-4 text-sm leading-6">
      <div className="rounded-xl border border-[var(--admin-border-subtle)] p-4">
        <dt className="font-semibold">如何修改个人资料？</dt>
        <dd className="mt-2 text-[var(--admin-muted)]">打开账号菜单的“我的主页”，点击姓名、头像或个人介绍即可编辑；组别和职务由管理员维护。</dd>
      </div>
      <div className="rounded-xl border border-[var(--admin-border-subtle)] p-4">
        <dt className="font-semibold">为什么看不到部分工作台或作业入口？</dt>
        <dd className="mt-2 text-[var(--admin-muted)]">入口根据账号权限和所属组别显示。作业功能还需要所在组具备相应权限。</dd>
      </div>
      <div className="rounded-xl border border-[var(--admin-border-subtle)] p-4">
        <dt className="font-semibold">如何查找学习资料或提问？</dt>
        <dd className="mt-2 text-[var(--admin-muted)]">从左侧目录查看入门和技术资料；需要讨论的问题可以前往 <GuideLink to="/dashboard">社区</GuideLink>。</dd>
      </div>
    </dl>
  </section>;
}

export function OperationsGuide() {
  const [revision, setRevision] = useState(0);
  const [catalogue, setCatalogue] = useState<OperationsCatalogue | null>(null);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<OperationsCatalogue>("/api/work-manual/operations", { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setCatalogue(result); })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError({
          message: failure instanceof ApiError ? failure.message : "工作流程暂时无法加载，请稍后重试。",
          status: failure instanceof ApiError ? failure.status : 0,
        });
      });
    return () => controller.abort();
  }, [revision]);

  if (error) return <div className="work-manual__status" role={error.status === 403 ? "status" : "alert"}>
    <p>{error.message}</p>
    {error.status !== 401 && error.status !== 403
      ? <button type="button" onClick={() => { setError(null); setRevision((value) => value + 1); }}>重试</button> : null}
  </div>;
  if (!catalogue) return <BrandLoader label="正在加载 SOP" />;
  return <OperationsSOP catalogue={catalogue} />;
}
