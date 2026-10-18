import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";

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
import { formatWeekLabel, isoWeekFromStart, weekStartFromISOWeek } from "~/lib/weekly-report-calendar";
import "./weekly-reports.css";

export function meta() {
  return [{ title: "工作周报 | TARSGO" }];
}

const emptyReport: WeeklyReportInput = { completed: "", blockers: "", nextPlan: "" };

function describeError(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function reportSection(label: string, content: string) {
  return (
    <div className="weekly-report__content-section">
      <h4>{label}</h4>
      <p>{content}</p>
    </div>
  );
}

export default function WeeklyReportsRoute() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [dashboard, setDashboard] = useState<WeeklyReportDashboard | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState("");
  const [form, setForm] = useState<WeeklyReportInput>(emptyReport);
  const [teamWeek, setTeamWeek] = useState<WeeklyReportTeamWeek | null>(null);
  const [teamWeekValue, setTeamWeekValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [teamLoading, setTeamLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [teamError, setTeamError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const dashboardRequestId = useRef(0);
  const teamRequestId = useRef(0);
  const selectedReport = useMemo(
    () => dashboard?.reports.find((report) => report.weekStart === selectedWeekStart) ?? null,
    [dashboard?.reports, selectedWeekStart],
  );
  const isCurrentWeek = Boolean(dashboard && selectedWeekStart === dashboard.currentWeekStart);

  const loadTeamWeek = useCallback(async (weekStart: string) => {
    const requestId = ++teamRequestId.current;
    setTeamLoading(true);
    setTeamError("");
    setTeamWeek(null);
    try {
      const result = await getWeeklyReportTeamWeek(weekStart);
      if (requestId === teamRequestId.current) setTeamWeek(result);
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
        setSelectedWeekStart((current) => current || result.currentWeekStart);
        setTeamWeekValue(isoWeekFromStart(result.currentWeekStart));
      }
    } catch (cause) {
      if (requestId === dashboardRequestId.current) setLoadError(describeError(cause, "工作周报加载失败"));
    } finally {
      if (requestId === dashboardRequestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    teamRequestId.current++;
    setDashboard(null);
    setSelectedWeekStart("");
    setTeamWeek(null);
    setTeamWeekValue("");
    setTeamLoading(false);
    setTeamError("");
    void loadDashboard();
  }, [currentUser.id, loadDashboard]);

  useEffect(() => {
    setForm(selectedReport
      ? { completed: selectedReport.completed, blockers: selectedReport.blockers, nextPlan: selectedReport.nextPlan }
      : emptyReport);
    setSaveError("");
  }, [selectedWeekStart, selectedReport?.id, selectedReport?.completed, selectedReport?.blockers, selectedReport?.nextPlan]);

  useEffect(() => {
    if (dashboard?.canViewTeam && dashboard.currentWeekStart) {
      void loadTeamWeek(dashboard.currentWeekStart);
    }
  }, [dashboard?.canViewTeam, dashboard?.currentWeekStart, loadTeamWeek]);

  const updateForm = (field: keyof WeeklyReportInput, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setSaveError("");
    setSuccessMessage("");
  };

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dashboard || !selectedWeekStart) return;
    const missingSection = Object.values(form).some((value) => !value.trim());
    if (missingSection) {
      setSaveError("请填写全部三个部分；如暂无内容，请填写“无”。");
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
      const saved = isCurrentWeek
        ? await saveCurrentWeeklyReport(form)
        : await updateWeeklyReport(selectedReport!.id, form);
      setDashboard((current) => {
        if (!current) return current;
        const reports = [saved, ...current.reports.filter((report) => report.weekStart !== saved.weekStart)]
          .sort((left, right) => right.weekStart.localeCompare(left.weekStart));
        return { ...current, reports };
      });
      setSuccessMessage("周报已保存。");
      if (dashboard.canViewTeam && teamWeek?.weekStart === saved.weekStart) {
        void loadTeamWeek(saved.weekStart);
      }
    } catch (cause) {
      setSaveError(describeError(cause, "周报保存失败"));
    } finally {
      setSaving(false);
    }
  }

  function changeTeamWeek(value: string) {
    setTeamWeekValue(value);
    setTeamError("");
    try {
      void loadTeamWeek(weekStartFromISOWeek(value));
    } catch (cause) {
      teamRequestId.current++;
      setTeamWeek(null);
      setTeamLoading(false);
      setTeamError(describeError(cause, "周次无效"));
    }
  }

  return (
    <section className="weekly-report-page admin-design" aria-labelledby="weekly-report-title">
      <header className="weekly-report__header">
        <div>
          <p className="weekly-report__eyebrow">运营组</p>
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
                <h2 id="my-weekly-report-title">{selectedWeekStart ? formatWeekLabel(selectedWeekStart) : "选择周次"}</h2>
              </div>
              <label className="weekly-report__week-select">
                <span>周次</span>
                <select
                  aria-label="选择要查看的周报"
                  value={selectedWeekStart || dashboard.currentWeekStart}
                  onChange={(event) => {
                    setSelectedWeekStart(event.target.value);
                    setSuccessMessage("");
                  }}
                >
                  <option value={dashboard.currentWeekStart}>本周 · {formatWeekLabel(dashboard.currentWeekStart)}</option>
                  {dashboard.reports
                    .filter((report) => report.weekStart !== dashboard.currentWeekStart)
                    .map((report) => <option key={report.id} value={report.weekStart}>{formatWeekLabel(report.weekStart)}</option>)}
                </select>
              </label>
            </div>

            <form className="weekly-report__form" onSubmit={submitReport}>
              <label className="weekly-report__field">
                <span>本周完成</span>
                <textarea
                  required
                  maxLength={5000}
                  value={form.completed}
                  onChange={(event) => updateForm("completed", event.target.value)}
                  placeholder="本周完成的事项"
                />
              </label>
              <label className="weekly-report__field">
                <span>问题与阻塞</span>
                <textarea
                  required
                  maxLength={5000}
                  value={form.blockers}
                  onChange={(event) => updateForm("blockers", event.target.value)}
                  placeholder="如暂无，请填写“无”"
                />
              </label>
              <label className="weekly-report__field">
                <span>下周计划</span>
                <textarea
                  required
                  maxLength={5000}
                  value={form.nextPlan}
                  onChange={(event) => updateForm("nextPlan", event.target.value)}
                  placeholder="下周计划的事项"
                />
              </label>
              <div className="weekly-report__form-footer">
                <div aria-live="polite">
                  {saveError ? <p className="weekly-report__inline-error">{saveError}</p> : null}
                  {successMessage ? <p className="weekly-report__inline-success">{successMessage}</p> : null}
                </div>
                <button className="admin-button admin-button--primary" type="submit" disabled={saving}>
                  {saving ? "保存中…" : isCurrentWeek ? (selectedReport ? "保存周报" : "提交周报") : "保存修改"}
                </button>
              </div>
            </form>
          </section>

          {dashboard.canViewTeam ? (
            <section className="weekly-report__panel" aria-labelledby="team-weekly-reports-title">
              <div className="weekly-report__panel-heading">
                <div>
                  <h2 id="team-weekly-reports-title">成员提交情况</h2>
                </div>
                <label className="weekly-report__week-select">
                  <span>查看周次</span>
                  <input
                    type="week"
                    aria-label="选择组内周报周次"
                    max={isoWeekFromStart(dashboard.currentWeekStart)}
                    value={teamWeekValue}
                    onChange={(event) => changeTeamWeek(event.target.value)}
                  />
                </label>
              </div>
              {teamLoading ? <div className="weekly-report__notice" role="status">正在加载组内周报…</div> : null}
              {teamError ? <div className="weekly-report__notice weekly-report__notice--error" role="alert">{teamError}</div> : null}
              {!teamLoading && teamWeek ? (
                <>
                  <p className="weekly-report__submission-count">
                    {teamWeek.submittedCount}/{teamWeek.totalCount} 人已提交 · {formatWeekLabel(teamWeek.weekStart)}
                  </p>
                  {teamWeek.members.length === 0 ? <p className="weekly-report__empty">运营组暂无成员。</p> : (
                    <div className="weekly-report__member-list">
                      {teamWeek.members.map((member) => (
                        <article className="weekly-report__member" key={member.userId}>
                          <div className="weekly-report__member-heading">
                            <h3>{member.name}</h3>
                            <span className={member.submitted ? "weekly-report__status weekly-report__status--submitted" : "weekly-report__status"}>
                              {member.submitted ? "已提交" : "未提交"}
                            </span>
                          </div>
                          {member.report ? (
                            <details className="weekly-report__details">
                              <summary>查看周报内容</summary>
                              <div className="weekly-report__content">
                                {reportSection("本周完成", member.report.completed)}
                                {reportSection("问题与阻塞", member.report.blockers)}
                                {reportSection("下周计划", member.report.nextPlan)}
                              </div>
                            </details>
                          ) : null}
                        </article>
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
