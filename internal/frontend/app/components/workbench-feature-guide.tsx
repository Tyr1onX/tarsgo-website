import { Link } from "react-router";

import { FEATURE_GUIDE_DATE, FEATURE_GUIDE_TITLE, getWorkbenchAdminAction, getWorkbenchFeaturesForMember, GROUP_ACCESS_HELP } from "~/lib/workbench-feature-announcement";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { WorkbenchFeatureStatus } from "~/components/workbench-feature-status";
import "./workbench-feature-guide.css";

export function WorkbenchFeatureGuide({ currentUser, groupResolution, groupResolutionError }: Pick<DashboardLayoutOutletContext, "currentUser" | "groupResolution" | "groupResolutionError">) {
  const groupNames = groupResolution?.groups.map((group) => group.name) ?? [];
  const features = getWorkbenchFeaturesForMember(currentUser.role.name, groupNames);
  const hasAssignmentAccess = features.some((feature) => feature.key === "assignments");

  return (
    <section className="workbench-feature-guide" aria-label="工作台功能公告与工作手册">
      <header className="workbench-feature-guide__header">
        <div>
          <p className="workbench-feature-guide__eyebrow">功能更新 · {FEATURE_GUIDE_DATE}</p>
          <h1>{FEATURE_GUIDE_TITLE}</h1>
          <p>工作周报、请假自助和网站使用指南对所有角色开放；运营组 SOP 按组别权限开放。</p>
        </div>
        <Link className="workbench-feature-guide__back" to="/dashboard">返回个人工作台 <span aria-hidden="true">↗</span></Link>
      </header>

      <section className="workbench-feature-guide__start" aria-labelledby="workbench-feature-guide-start">
        <div>
          <p className="workbench-feature-guide__eyebrow">从这里开始</p>
          <h2 id="workbench-feature-guide-start">{hasAssignmentAccess ? "先处理日常事务，再完成本组作业" : "先从日常事务开始"}</h2>
        </div>
        {groupResolutionError ? <p role="status">暂时无法确认所属组别。{GROUP_ACCESS_HELP}</p> : hasAssignmentAccess ? (
          <ol>
            <li><Link to="/dashboard/weekly-reports">使用工作周报记录工作进展</Link></li>
            <li><Link to="/dashboard/leave">提交、查询和管理自己的请假申请</Link></li>
            <li>在个人资料的“课程时间”上传教务系统导出的 Excel 课表。</li>
            <li><Link to="/dashboard/assignments">打开“我的作业”，提交成果并查看批改反馈</Link></li>
          </ol>
        ) : (
          <ol>
            <li><Link to="/dashboard/weekly-reports">使用工作周报记录工作进展</Link></li>
            <li><Link to="/dashboard/leave">提交、查询和管理自己的请假申请</Link></li>
            <li><Link to="/dashboard/guide">查看工作手册</Link>；成员上传课表可在个人资料的“课程时间”完成。</li>
          </ol>
        )}
        {!groupResolutionError ? <p className="workbench-feature-guide__scope-note">{GROUP_ACCESS_HELP}</p> : null}
        <p className="workbench-feature-guide__scope-note">新人培养目前只开放作业发布、提交和批改；其他培养入口暂未开放，历史记录继续保留。</p>
        {currentUser.role.name === "admin" || currentUser.role.name === "super_admin" ? <p className="workbench-feature-guide__scope-note">管理入口遵循现有组别权限与请假审批规则。</p> : null}
      </section>

      <div className="workbench-feature-guide__grid">
        {features.map((feature) => {
          const adminAction = getWorkbenchAdminAction(feature, currentUser.role.name, groupNames);
          return (
            <article className="workbench-feature-guide__item" key={feature.key}>
              <div className="workbench-feature-guide__item-top">
                <div><p>{feature.audienceLabel}</p><h2>{feature.title}</h2></div>
                <WorkbenchFeatureStatus feature={feature.key} />
              </div>
              <p className="workbench-feature-guide__description">{feature.description}</p>
              <div className="workbench-feature-guide__actions">
                <Link to={feature.href}>{feature.action} <span aria-hidden="true">↗</span></Link>
                {adminAction ? <Link className="workbench-feature-guide__admin-action" to={adminAction.href}>{adminAction.label} <span aria-hidden="true">↗</span></Link> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
