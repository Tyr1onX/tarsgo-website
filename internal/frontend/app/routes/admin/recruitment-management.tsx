import { useOutletContext, useSearchParams } from "react-router";

import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { AdmissionQRCodeSettings } from "~/routes/admin/admission-qr-settings";
import { FormConfigPage } from "~/routes/admin/form-config";
import { InterviewSessions } from "~/routes/admin/interview-sessions";
import { UserGroups } from "~/routes/admin/user-groups";

type RecruitmentTab = "form" | "sessions" | "groups" | "admission-notifications";

const baseTabs: Array<{ key: RecruitmentTab; label: string; description: string }> = [
  { key: "form", label: "当前届与历史届次", description: "报名表、报名字段、开放时间与届次状态" },
  { key: "sessions", label: "面试场次", description: "管理当前届候选人可预约的面试时段" },
  { key: "groups", label: "招新组别", description: "维护报名意向可选的招新组别" },
  { key: "admission-notifications", label: "录取通知设置", description: "配置各组录取通知使用的群二维码" },
];

export function meta() {
  return [{ title: "招新管理 | TARSGO" }, { name: "description", content: "管理当前届招新与历史届次" }];
}

export default function RecruitmentManagement() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = currentUser.role.name === "super_admin" ? baseTabs : baseTabs.filter((tab) => tab.key !== "admission-notifications");
  const requestedTab = searchParams.get("tab");
  const activeTab: RecruitmentTab = tabs.some((tab) => tab.key === requestedTab)
    ? requestedTab as RecruitmentTab
    : "form";

  return (
    <div className="admin-design space-y-5">
      <header className="admin-page-header">
        <div className="admin-eyebrow">吉甲 · 招新配置</div>
        <h1 className="admin-page-title">招新管理</h1>
        <p className="admin-page-description">在同一入口管理当前招新、报名字段、面试安排、组别和历史届次。</p>
      </header>

      <nav aria-label="招新管理分类" className="flex flex-wrap gap-2 border-b border-[var(--admin-border-subtle)] pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-current={activeTab === tab.key ? "page" : undefined}
            onClick={() => setSearchParams(tab.key === "form" ? {} : { tab: tab.key }, { replace: true })}
            className={`admin-button admin-button--small ${activeTab === tab.key ? "admin-button--primary" : "admin-button--secondary"}`}
            title={tab.description}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "form" ? <FormConfigPage /> : null}
      {activeTab === "sessions" ? <InterviewSessions /> : null}
      {activeTab === "groups" ? <UserGroups /> : null}
      {activeTab === "admission-notifications" && currentUser.role.name === "super_admin" ? <AdmissionQRCodeSettings /> : null}
    </div>
  );
}
