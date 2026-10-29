import type { ReactNode } from "react";
import { Link, useOutletContext } from "react-router";

import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";

export function meta() {
  return [{ title: "使用指南 | TARSGO" }];
}

function GuideLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="text-[var(--admin-accent-text)] underline underline-offset-2" to={to}>{children}</Link>;
}

export default function GuideRoute() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const canManage = ["admin", "super_admin"].includes(currentUser.role.name);

  return <main className="admin-design mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6">
    <header>
      <h1 className="text-2xl font-semibold">使用指南</h1>
      <p className="mt-2 text-sm text-[var(--admin-muted)]">按工作台现有功能整理；你能看到的入口由账号权限和所属组别决定。</p>
    </header>

    <section className="space-y-4 rounded-xl border border-[var(--admin-border-subtle)] p-4 sm:p-5" aria-labelledby="member-guide-title">
      <h2 id="member-guide-title" className="text-lg font-semibold">成员使用</h2>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
        <li>在官网点击“登录”进入工作台后，点右上角“个人资料”核对姓名、联系方式和组别；组别不正确时联系管理员确认。</li>
        <li>在 <GuideLink to="/dashboard/timetable">我的课表</GuideLink> 上传教务系统导出的 .xlsx 文件；导入后核对学期和教学周。重复导入同一学期会替换原课表。</li>
        <li>在 <GuideLink to="/dashboard/assignments">我的作业</GuideLink> 查看要求、上传附件并提交；批改意见和完成状态可在提交记录中查看。</li>
        <li>在 <GuideLink to="/dashboard/practice-projects">实践项目</GuideLink> 选择开放项目自主报名，完成后提交进展、心得和成果附件；验收后查看管理员反馈。</li>
        <li>在 <GuideLink to="/dashboard/capabilities">能力雷达</GuideLink> 查看已有评价，在 <GuideLink to="/dashboard/growth">我的成长</GuideLink> 查看作业、项目与成长记录。没有评价数据的能力项会显示“暂无评价”。</li>
      </ol>
    </section>

    {canManage ? <section className="space-y-4 rounded-xl border border-[var(--admin-border-subtle)] p-4 sm:p-5" aria-labelledby="admin-guide-title">
      <h2 id="admin-guide-title" className="text-lg font-semibold">管理员使用</h2>
      <ol className="list-decimal space-y-3 pl-5 text-sm leading-6">
        <li>账号与组别分配在 <GuideLink to="/dashboard/admin/users">账号与权限</GuideLink> 完成，仅超级管理员可操作；普通管理员在工作台中处理自己有权限的组别。</li>
        <li>在 <GuideLink to="/dashboard/admin/training/assignments">作业管理</GuideLink> 发布本组作业，在 <GuideLink to="/dashboard/admin/training/submissions">提交记录</GuideLink> 查看提交并批改。</li>
        <li>在 <GuideLink to="/dashboard/admin/timetable-availability">组内空闲分析</GuideLink> 查看成员已导入课表的可用时间。</li>
        <li>在 <GuideLink to="/dashboard/admin/training/practice-projects">实践项目管理</GuideLink> 建立本组项目、查看成果并验收反馈。</li>
        <li>在 <GuideLink to="/dashboard/admin/training/capabilities">能力评价管理</GuideLink> 配置本组能力维度、关联作业或项目来源，并按实际情况补充评价。</li>
        <li>在 <GuideLink to="/dashboard/admin/cultivation">人员培养</GuideLink> 查看本组成员成长记录与能力表现，记录培养进展和内部备注。</li>
      </ol>
    </section> : null}
  </main>;
}
