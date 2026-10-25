import { Link } from "react-router";

import { getWorkbenchAdminAction, getWorkbenchFeaturesForMember, GROUP_ACCESS_HELP } from "~/lib/workbench-feature-announcement";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { WorkbenchFeatureStatus } from "~/components/workbench-feature-status";
import "./workbench-feature-guide.css";

export function WorkbenchFeatureGuide({ currentUser, groupResolution, groupResolutionError }: Pick<DashboardLayoutOutletContext, "currentUser" | "groupResolution" | "groupResolutionError">) {
  const groupNames = groupResolution?.groups.map((group) => group.name) ?? [];
  const features = getWorkbenchFeaturesForMember(currentUser.role.name, groupNames);
  const isTechnicalMember = features.some((feature) => feature.key === "assignments");
  const isOperationsMember = groupNames.includes("运营组");

  return (
    <section className="workbench-feature-guide" aria-label="新人培养与 TARS BASE 功能使用指南">
      <header className="workbench-feature-guide__header">
        <div>
          <p className="workbench-feature-guide__eyebrow">功能更新 · 2026.10.22</p>
          <h1>吉甲大师官网更新｜新人培养与 TARS BASE 使用指南</h1>
          <p>查看当前对你开放的功能、使用方式和开放状态。</p>
        </div>
        <Link className="workbench-feature-guide__back" to="/dashboard">返回个人工作台 <span aria-hidden="true">↗</span></Link>
      </header>

      <section className="workbench-feature-guide__start" aria-labelledby="workbench-feature-guide-start">
        <div>
          <p className="workbench-feature-guide__eyebrow">从这里开始</p>
          <h2 id="workbench-feature-guide-start">{isTechnicalMember ? "训练、交流，再回看成长" : isOperationsMember ? "记录工作，探索成长" : "先从个人工作台开始"}</h2>
        </div>
        {groupResolutionError ? <p role="status">暂时无法确认所属组别。{GROUP_ACCESS_HELP}</p> : isTechnicalMember ? (
          <ol>
            <li><Link to="/dashboard">登录后进入个人工作台</Link></li>
            <li><Link to="/dashboard/assignments">打开“我的作业”，下载资料并提交文件</Link></li>
            <li><Link to="/dashboard/assignments">查看批改结果；需要重做时重新提交</Link></li>
            <li><Link to="/dashboard/questions">使用提问答疑，再到我的成长回看真实记录</Link></li>
            <li><Link to="/dashboard/expedition">进入 TARS BASE 探索所属区域</Link></li>
          </ol>
        ) : isOperationsMember ? (
          <ol>
            <li><Link to="/dashboard">登录后进入个人工作台</Link></li>
            <li><Link to="/dashboard/weekly-reports">通过工作周报记录学习与运营工作</Link></li>
            <li><Link to="/dashboard/growth">在我的成长查看真实周报记录</Link></li>
            <li><Link to="/dashboard/expedition">进入 TARS BASE 探索战队指挥室</Link></li>
          </ol>
        ) : (
          <p>确认所属组别后，工作台会显示适用的训练与成长入口。你可以先填写工作周报，记录学习和工作进展。</p>
        )}
        {!groupResolutionError && isOperationsMember ? <p className="workbench-feature-guide__scope-note">运营组暂不开放技术组作业和提问答疑。</p> : null}
        {!groupResolutionError ? <p className="workbench-feature-guide__scope-note">{GROUP_ACCESS_HELP}</p> : null}
        {currentUser.role.name === "admin" || currentUser.role.name === "super_admin" ? <p className="workbench-feature-guide__scope-note">管理入口仅对有相应权限的管理员显示；管理员按已授权组别管理，不会扩大成员功能权限。</p> : null}
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
