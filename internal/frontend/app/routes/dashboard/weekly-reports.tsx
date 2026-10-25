import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useOutletContext, useSearchParams } from "react-router";

import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import {
  getWeeklyReportDashboard,
  getWeeklyReportTeamWeek,
  saveCurrentWeeklyReport,
  updateWeeklyReport,
  type WeeklyReportDashboard,
  type WeeklyReportInput,
  type WeeklyReportTeamWeek,
} from "~/lib/weekly-report-client";
import { formatWeekLabel } from "~/lib/weekly-report-calendar";
import "./weekly-reports.css";

export function meta() {
  return [{ title: "工作周报 | TARSGO" }];
}

const emptyReport: WeeklyReportInput = { completed: "", gains: "", blockers: "", nextPlan: "" };

function describeError(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function reportSection(label: string, content: string) {
  return (
    <div className="weekly-report__content-section">
      <h4>{label}</h4>
      <p>{content || "此前未单独记录"}</p>
    </div>
  );
}

export default function WeeklyReportsRoute() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [searchParams] = useSearchParams();
  const requestedWeekStart = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get("weekStart") ?? "") ? searchParams.get("weekStart") ?? "" : "";
  const [dashboard, setDashboard] = useState<WeeklyReportDashboard | null>(null);
  const [selectedReportKey, setSelectedReportKey] = useState("current");
  const [reportGroupId, setReportGroupId] = useState("");
  const [form, setForm] = useState<WeeklyReportInput>(emptyReport);
  const [teamWeek, setTeamWeek] = useState<WeeklyReportTeamWeek | null>(null);
  const [teamAvailableWeeks, setTeamAvailableWeeks] = useState<string[]>([]);
  const [teamWeekStart, setTeamWeekStart] = useState("");
  const [teamGroupId, setTeamGroupId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [teamError, setTeamError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const dashboardRequestId = useRef(0);
  const teamRequestId = useRef(0);
  const selectedReport = useMemo(() => {
    if (!dashboard) return null;
    if (selectedReportKey === "current") return dashboard.reports.find((report) => report.weekStart === dashboard.currentWeekStart) ?? null;
    return dashboard.reports.find((report) => String(report.id) === selectedReportKey) ?? null;
  }, [dashboard, selectedReportKey]);
  const currentWeekReportID = dashboard?.reports.find((report) => report.weekStart === dashboard.currentWeekStart)?.id;
  const isCurrentEntry = selectedReportKey === "current";
  const isCurrentWeek = isCurrentEntry || Boolean(selectedReport && selectedReport.weekStart === dashboard?.currentWeekStart);
  const selectedWeekStart = selectedReport?.weekStart ?? dashboard?.currentWeekStart ?? "";

  const loadTeamWeek = useCallback(async (groupId: number, weekStart: string) => {
    const requestId = ++teamRequestId.current;
    setTeamLoading(true);
    setTeamError("");
    setTeamWeek(null);
    try {
      const result = await getWeeklyReportTeamWeek(groupId, weekStart);
      if (requestId === teamRequestId.current) {
        setTeamWeek(result);
        setTeamAvailableWeeks(result.availableWeeks);
      }
    } catch (cause) {
      if (requestId === teamRequestId.current) setTeamError(describeError(cause, "组内周报加载失败"));
    } finally {
      if (requestId === teamRequestId.current) setTeamLoading(false);
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    const requestId = ++dashboardRequestId.current;
    setLoading(true);
    setLoadError("");
    try {
      const result = await getWeeklyReportDashboard();
      if (requestId === dashboardRequestId.current) {
        setDashboard(result);
        const requestedReport = result.reports.find((report) => report.weekStart === requestedWeekStart);
        setSelectedReportKey(requestedReport && requestedReport.weekStart !== result.currentWeekStart ? String(requestedReport.id) : "current");
        setTeamGroupId(result.teamGroups[0] ? String(result.teamGroups[0].groupId) : "");
        setTeamWeekStart(result.currentWeekStart);
        setTeamAvailableWeeks([result.currentWeekStart]);
      }
    } catch (cause) {
      if (requestId === dashboardRequestId.current) setLoadError(describeError(cause, "工作周报加载失败"));
    } finally {
      if (requestId === dashboardRequestId.current) setLoading(false);
    }
  }, [requestedWeekStart]);

  useEffect(() => {
    teamRequestId.current++;
    setDashboard(null);
    setSelectedReportKey("current");
    setTeamWeek(null);
    setTeamAvailableWeeks([]);
    setTeamWeekStart("");
    setTeamGroupId("");
    setTeamLoading(false);
    setTeamError("");
    void loadDashboard();
  }, [currentUser.id, loadDashboard]);

  useEffect(() => {
    setForm(selectedReport
      ? { completed: selectedReport.completed, gains: selectedReport.gains ?? "", blockers: selectedReport.blockers, nextPlan: selectedReport.nextPlan }
      : emptyReport);
    const reportGroup = selectedReport?.groupId;
    const defaultGroup = dashboard?.groups.length === 1 ? dashboard.groups[0]?.groupId : undefined;
    setReportGroupId(reportGroup ? String(reportGroup) : defaultGroup ? String(defaultGroup) : "");
    setSaveError("");
  }, [dashboard?.groups, selectedReport?.id, selectedReport?.completed, selectedReport?.gains, selectedReport?.blockers, selectedReport?.nextPlan, selectedReport?.groupId]);

  useEffect(() => {
    const groupId = Number(teamGroupId);
    if (dashboard?.canViewTeam && groupId > 0 && teamWeekStart) {
      void loadTeamWeek(groupId, teamWeekStart);
    }
  }, [dashboard?.canViewTeam, loadTeamWeek, teamGroupId, teamWeekStart]);

  const updateForm = (field: "completed" | "gains" | "blockers" | "nextPlan", value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setSaveError("");
    setSuccessMessage("");
  };

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dashboard || !selectedWeekStart) return;
    const requiredSections = [form.completed, form.gains, form.blockers, form.nextPlan]
      .filter((_, index) => !(selectedReport && !selectedReport.gains?.trim() && index === 1));
    if (requiredSections.some((value) => !value.trim())) {
      setSaveError("请填写本周进展、本周收获、下周计划和需要帮助；如暂无内容，请填写“无”。历史周报未单独记录的收获可保持为空。");
      return;
    }
    if (isCurrentEntry && !selectedReport && dashboard.groups.length > 1 && !reportGroupId) {
      setSaveError("请选择本周周报归属的组别。");
      return;
    }
    if (!isCurrentWeek && !selectedReport) {
      setSaveError("只能编辑已提交的历史周报。");
      return;
    }

    setSaving(true);
    setSaveError("");
    setSuccessMessage("");
    try {
      const input: WeeklyReportInput = { ...form };
      if (isCurrentWeek && !selectedReport && reportGroupId) input.groupId = Number(reportGroupId);
      const saved = isCurrentEntry
        ? await saveCurrentWeeklyReport(input)
        : await updateWeeklyReport(selectedReport!.id, input);
      setDashboard((current) => {
        if (!current) return current;
        const hasSavedReport = current.reports.some((report) => report.id === saved.id);
        const reports = hasSavedReport
          ? current.reports.map((report) => report.id === saved.id ? saved : report)
          : [saved, ...current.reports];
        return { ...current, reports: reports.sort((left, right) => right.weekStart.localeCompare(left.weekStart) || right.updatedAt.localeCompare(left.updatedAt)) };
      });
      setSelectedReportKey(saved.weekStart === dashboard.currentWeekStart && (isCurrentEntry || saved.id === currentWeekReportID) ? "current" : String(saved.id));
      setSuccessMessage("周报已保存。");
      if (dashboard.canViewTeam && teamWeek?.weekStart === saved.weekStart && teamWeek.groupId) {
        void loadTeamWeek(teamWeek.groupId, saved.weekStart);
      }
    } catch (cause) {
      setSaveError(describeError(cause, "周报保存失败"));
    } finally {
      setSaving(false);
    }
  }

  function changeTeamWeek(value: string) {
    setTeamWeekStart(value);
    setTeamWeek(null);
    setTeamLoading(true);
    setTeamError("");
  }

  function changeTeamGroup(value: string) {
    setTeamGroupId(value);
    setTeamWeekStart(dashboard?.currentWeekStart ?? "");
    setTeamAvailableWeeks(dashboard?.currentWeekStart ? [dashboard.currentWeekStart] : []);
    setTeamWeek(null);
    setTeamLoading(true);
    setTeamError("");
  }

  return (
    <section className="weekly-report-page admin-design" aria-labelledby="weekly-report-title">
      <header className="weekly-report__header">
        <div>
          <p className="weekly-report__eyebrow">全员周报</p>
          <h1 id="weekly-report-title">工作周报</h1>
        </div>
      </header>

      {loading ? <div className="weekly-report__notice" role="status">正在加载周报…</div> : null}
      {!loading && loadError ? <div className="weekly-report__notice weekly-report__notice--error" role="alert">{loadError}</div> : null}

      {dashboard ? (
        <>
          <section className="weekly-report__panel" aria-labelledby="my-weekly-report-title">
            <div className="weekly-report__panel-heading">
              <div>
                <p className="weekly-report__eyebrow">{isCurrentWeek ? "本周" : "历史周报"}</p>
                <h2 id="my-weekly-report-title">{selectedWeekStart ? formatWeekLabel(selectedWeekStart) : "本周"}</h2>
              </div>
              {!isCurrentWeek ? <button className="weekly-report__back-current" type="button" onClick={() => {
                setSelectedReportKey("current");
                setSuccessMessage("");
              }}>返回本周</button> : null}
            </div>

            {selectedReport?.groupName ? <p className="weekly-report__scope">记录归属：{selectedReport.groupName}</p> : isCurrentWeek && dashboard.groups.length > 1 && !selectedReport ? (
              <label className="weekly-report__week-select weekly-report__scope-select">
                <span>本周归属组别</span>
                <select value={reportGroupId} onChange={(event) => setReportGroupId(event.target.value)} aria-label="选择本周周报归属组别">
                  <option value="">请选择组别</option>
                  {dashboard.groups.map((group) => <option key={group.groupId} value={String(group.groupId)}>{group.name}</option>)}
                </select>
              </label>
            ) : isCurrentWeek && dashboard.groups.length === 0 ? <p className="weekly-report__scope">当前账号尚未确认组别；周报将作为个人记录保存。</p> : null}

            <form className="weekly-report__form" onSubmit={submitReport}>
              <label className="weekly-report__field">
                <span>本周进展</span>
                <textarea required maxLength={5000} value={form.completed} onChange={(event) => updateForm("completed", event.target.value)} placeholder="学习了什么、参与了什么、完成了什么" />
              </label>
              <label className="weekly-report__field">
                <span>本周收获</span>
                <textarea required={!(selectedReport && !selectedReport.gains?.trim())} maxLength={5000} value={form.gains} onChange={(event) => updateForm("gains", event.target.value)} placeholder={selectedReport && !selectedReport.gains?.trim() ? "历史记录未单独记录；可补充，也可保持为空" : "掌握的知识、取得的成果或经验"} />
              </label>
              <label className="weekly-report__field">
                <span>下周计划</span>
                <textarea required maxLength={5000} value={form.nextPlan} onChange={(event) => updateForm("nextPlan", event.target.value)} placeholder="准备学习、练习或推进哪些事项" />
              </label>
              <label className="weekly-report__field">
                <span>需要帮助</span>
                <textarea required maxLength={5000} value={form.blockers} onChange={(event) => updateForm("blockers", event.target.value)} placeholder="遇到的问题、需要的指导或协作支持；如暂无请填写“无”" />
              </label>
              <div className="weekly-report__form-footer">
                <div aria-live="polite">
                  {saveError ? <p className="weekly-report__inline-error">{saveError}</p> : null}
                  {successMessage ? <p className="weekly-report__inline-success">{successMessage}</p> : null}
                </div>
                <button className="admin-button admin-button--primary" type="submit" disabled={saving}>
                  {saving ? "保存中…" : isCurrentEntry ? (selectedReport ? "保存周报" : "提交周报") : selectedReport ? "保存修改" : "提交周报"}
                </button>
              </div>
            </form>
            {dashboard.reports.length > 0 ? <section className="weekly-report__history" aria-labelledby="weekly-report-history-title">
              <div className="weekly-report__history-heading">
                <h3 id="weekly-report-history-title">已有周报</h3>
                <span>仅显示已保存的记录</span>
              </div>
              <div className="weekly-report__history-list">
                {dashboard.reports.map((report) => {
                  const isSelected = report.id === selectedReport?.id;
                  return <button
                    className="weekly-report__history-item"
                    type="button"
                    key={report.id}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSelectedReportKey(report.id === currentWeekReportID ? "current" : String(report.id));
                      setSuccessMessage("");
                    }}
                  >
                    <span>{report.weekStart === dashboard.currentWeekStart ? (report.id === currentWeekReportID ? "本周记录" : "本周其他记录") : formatWeekLabel(report.weekStart)}{report.groupName ? ` · ${report.groupName}` : ""}</span>
                    <span>{isSelected ? "正在编辑" : "查看 / 编辑"}</span>
                  </button>;
                })}
              </div>
            </section> : null}
          </section>

          {dashboard.canViewTeam ? (
            <section className="weekly-report__panel" aria-labelledby="team-weekly-reports-title">
              <div className="weekly-report__panel-heading">
                <div><h2 id="team-weekly-reports-title">成员提交情况</h2></div>
                <div className="weekly-report__team-filters">
                  {dashboard.teamGroups.length > 1 ? <label className="weekly-report__week-select">
                    <span>组别</span>
                    <select value={teamGroupId} aria-label="选择要查看的组别" onChange={(event) => changeTeamGroup(event.target.value)}>
                      {dashboard.teamGroups.map((group) => <option key={group.groupId} value={String(group.groupId)}>{group.name}</option>)}
                    </select>
                  </label> : null}
                  <label className="weekly-report__week-select">
                    <span>查看周次</span>
                    <select aria-label="选择组内周报周次" value={teamWeekStart || dashboard.currentWeekStart} onChange={(event) => changeTeamWeek(event.target.value)}>
                      {teamAvailableWeeks.map((weekStart) => <option key={weekStart} value={weekStart}>{weekStart === dashboard.currentWeekStart ? `本周 · ${formatWeekLabel(weekStart)}` : formatWeekLabel(weekStart)}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              {dashboard.teamGroups.length === 0 ? <p className="weekly-report__empty">当前账号没有可查看的组别周报。</p> : null}
              {teamLoading ? <div className="weekly-report__notice" role="status">正在加载组内周报…</div> : null}
              {teamError ? <div className="weekly-report__notice weekly-report__notice--error" role="alert">{teamError}</div> : null}
              {!teamLoading && teamWeek ? (
                <>
                  <p className="weekly-report__submission-count">{teamWeek.groupName} · {teamWeek.submittedCount}/{teamWeek.totalCount} 人已提交 · {formatWeekLabel(teamWeek.weekStart)}</p>
                  {teamWeek.members.length === 0 ? <p className="weekly-report__empty">该组暂无有效成员。</p> : (
                    <div className="weekly-report__member-list">
                      {teamWeek.members.map((member) => (
                        member.report ? <details className="weekly-report__member weekly-report__member--submitted" key={member.userId}>
                          <summary className="weekly-report__member-heading">
                            <h3>{member.name}</h3>
                            <span className="weekly-report__status weekly-report__status--submitted">已提交</span>
                            <span className="weekly-report__member-toggle"><span>展开周报</span><span>收起周报</span></span>
                          </summary>
                            <div className="weekly-report__content">
                              {reportSection("本周进展", member.report.completed)}
                              {reportSection("本周收获", member.report.gains)}
                              {reportSection("下周计划", member.report.nextPlan)}
                              {reportSection("需要帮助", member.report.blockers)}
                            </div>
                        </details> : <div className="weekly-report__member" key={member.userId}>
                          <div className="weekly-report__member-heading">
                            <h3>{member.name}</h3>
                            <span className="weekly-report__status">未提交</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
