import type { ReactNode } from "react";
import { Link, useOutletContext } from "react-router";

import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { hasAssignmentGroupAccess } from "~/lib/dashboard-navigation";

export function meta() {
  return [{ title: "使用指南 | TARSGO" }];
}

function GuideLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="text-[var(--admin-accent-text)] underline underline-offset-2" to={to}>{children}</Link>;
}

export default function GuideRoute() {
  const { currentUser, groupResolution } = useOutletContext<DashboardLayoutOutletContext>();
  const canManage = ["admin", "super_admin"].includes(currentUser.role.name);
  const canUseAssignments = currentUser.role.name === "super_admin" || hasAssignmentGroupAccess(groupResolution?.groups);

  return <main className="admin-design mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6">
    <header>
      <h1 className="text-2xl font-semibold">使用指南</h1>
      <p className="mt-2 text-sm text-[var(--admin-muted)]">工作台按当前开放的日常事务和作业流程整理；入口仍由账号权限和所属组别决定。</p>
    </header>

    <section className="space-y-4 rounded-xl border border-[var(--admin-border-subtle)] p-4 sm:p-5" aria-labelledby="daily-guide-title">
      <h2 id="daily-guide-title" className="text-lg font-semibold">日常事务</h2>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
        <li>在 <GuideLink to="/dashboard/weekly-reports">工作周报</GuideLink> 记录和维护自己的工作进展。</li>
        <li>在 <GuideLink to="/dashboard/leave">请假工作台</GuideLink> 提交、查询和管理自己的请假申请。</li>
        {canManage ? <li>在「日常事务」下的「请假管理」处理自己有权限管理的申请；授权审批仍仅限超级管理员。</li> : null}
        <li>成员可在「个人资料 → 课程时间」上传或更新教务系统导出的 Excel 课表；工作台仅使用课表计算空闲情况。</li>
      </ol>
    </section>

    {!canManage ? <section className="space-y-4 rounded-xl border border-[var(--admin-border-subtle)] p-4 sm:p-5" aria-labelledby="member-guide-title">
      <h2 id="member-guide-title" className="text-lg font-semibold">成员使用</h2>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
        <li>登录后点右上角“个人资料”核对姓名、联系方式和组别；组别有误时联系管理员。</li>
        {canUseAssignments ? <li>机械组、电控组、视觉组、AI 组和运营组成员可在 <GuideLink to="/dashboard/assignments">我的作业</GuideLink> 查看作业要求、提交成果并查看批改反馈。</li> : null}
        <li>目前新人培养只开放作业流程；其他培养入口和 TARS BASE 暂未开放。</li>
      </ol>
    </section> : null}

    {canManage ? <section className="space-y-4 rounded-xl border border-[var(--admin-border-subtle)] p-4 sm:p-5" aria-labelledby="admin-guide-title">
      <h2 id="admin-guide-title" className="text-lg font-semibold">管理员使用</h2>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
        {currentUser.role.name === "super_admin" ? <li>在 <GuideLink to="/dashboard/admin/users">账号与权限</GuideLink> 管理账号和组别。</li> : null}
        {canUseAssignments ? <li>对已授权的五个组别之一，在 <GuideLink to="/dashboard/admin/training/assignments">作业管理</GuideLink> 发布和管理本组作业，在 <GuideLink to="/dashboard/admin/training/submissions">提交记录</GuideLink> 查看提交并批改。</li> : null}
        <li>在 <GuideLink to="/dashboard/admin/timetable-availability">时间协调</GuideLink> 查看全组空闲人数、具体成员及个人时段。</li>
        <li>新人培养当前仅开放作业管理和提交批改；其他培养入口暂未开放，历史记录保留。</li>
      </ol>
    </section> : null}
  </main>;
}
