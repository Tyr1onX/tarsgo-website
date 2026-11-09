import { BrandLoader } from "~/components/brand-loader";
import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router";

import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { getRecruitmentAnalytics, type RecruitmentAnalyticsCohort, type RecruitmentAnalyticsReport } from "~/lib/recruitment-analytics-client";

export function meta() {
  return [{ title: "招新数据分析 | TARSGO" }, { name: "description", content: "按报名表查看招新届次、录取和主要组别变化" }];
}

function formatCount(value: number, hasData: boolean) {
  return hasData ? value.toLocaleString("zh-CN") : "暂无数据";
}

function formatDate(value?: string) {
  if (!value) return "暂无数据";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无数据";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatPercent(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) + "%" : "暂无数据";
}

function findSelectedCohort(report: RecruitmentAnalyticsReport | null, selectedFormId: number | null) {
  if (!report?.cohorts.length) return null;
  if (selectedFormId !== null) {
    const selected = report.cohorts.find((cohort) => cohort.formId === selectedFormId);
    if (selected) return selected;
  }
  return report.cohorts[report.cohorts.length - 1] ?? null;
}

function TrendChart({ cohorts }: { cohorts: RecruitmentAnalyticsCohort[] }) {
  const maximum = Math.max(0, ...cohorts.map((cohort) => cohort.registrationCount));
  const chartWidth = Math.max(520, cohorts.length * 150);

  if (cohorts.length === 0 || !cohorts.some((cohort) => cohort.hasData)) {
    return <div className="recruitment-analytics__empty">暂无数据</div>;
  }

  return (
    <>
      <div
        className="recruitment-analytics__chart-scroll"
        role="img"
        aria-label="各届招新报名记录与录取记录对比柱状图"
      >
        <div className="recruitment-analytics__chart" style={{ minWidth: chartWidth + "px" }}>
          {cohorts.map((cohort) => {
            const registrationHeight = maximum > 0 ? (cohort.registrationCount / maximum) * 100 : 0;
            const admittedHeight = maximum > 0 ? (cohort.admittedCount / maximum) * 100 : 0;
            return (
              <div key={cohort.formId} className="recruitment-analytics__chart-column">
                <div className="recruitment-analytics__chart-bars" aria-hidden="true">
                  {cohort.hasData ? (
                    <>
                      <div className="recruitment-analytics__bar recruitment-analytics__bar--registrations" style={{ height: registrationHeight + "%" }} />
                      <div className="recruitment-analytics__bar recruitment-analytics__bar--admitted" style={{ height: admittedHeight + "%" }} />
                    </>
                  ) : (
                    <span className="recruitment-analytics__chart-no-data">暂无数据</span>
                  )}
                </div>
                <div className="recruitment-analytics__chart-values">
                  <span>{formatCount(cohort.registrationCount, cohort.hasData)}</span>
                  <span>{formatCount(cohort.admittedCount, cohort.hasData)}</span>
                </div>
                <span className="recruitment-analytics__chart-label" title={cohort.title}>{cohort.title}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="recruitment-analytics__legend" aria-hidden="true">
        <span><i className="recruitment-analytics__legend-swatch recruitment-analytics__legend-swatch--registrations" />报名记录</span>
        <span><i className="recruitment-analytics__legend-swatch recruitment-analytics__legend-swatch--admitted" />录取记录</span>
      </div>
      <details className="recruitment-analytics__trend-data">
        <summary>查看趋势数据表</summary>
        <div className="recruitment-analytics__table-wrap">
          <table className="admin-table recruitment-analytics__table">
            <caption className="sr-only">各届报名记录与录取记录数字表</caption>
            <thead>
              <tr><th scope="col">招新报名表</th><th scope="col">报名记录</th><th scope="col">录取记录</th></tr>
            </thead>
            <tbody>
              {cohorts.map((cohort) => (
                <tr key={cohort.formId}>
                  <th scope="row">{cohort.title}</th>
                  <td>{formatCount(cohort.registrationCount, cohort.hasData)}</td>
                  <td>{formatCount(cohort.admittedCount, cohort.hasData)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

function CohortDetails({ cohort }: { cohort: RecruitmentAnalyticsCohort }) {
  const statuses = [
    { label: "待处理", count: cohort.pendingCount, key: "pending" },
    { label: "已录取", count: cohort.admittedCount, key: "admitted" },
    { label: "未通过", count: cohort.rejectedCount, key: "rejected" },
    { label: "撤回", count: cohort.withdrawnCount, key: "withdrawn" },
    ...(cohort.otherStatusCount > 0 ? [{ label: "未归类", count: cohort.otherStatusCount, key: "other" }] : []),
  ];
  const metrics = [
    { label: "报名记录", value: cohort.registrationCount.toLocaleString("zh-CN") },
    { label: "待处理", value: cohort.pendingCount.toLocaleString("zh-CN") },
    { label: "录取记录", value: cohort.admittedCount.toLocaleString("zh-CN") },
    { label: "录取率", value: formatPercent(cohort.admissionRate) },
  ];

  return (
    <section className="recruitment-analytics__panel" aria-labelledby="analytics-cohort-heading">
      <div className="recruitment-analytics__section-heading">
        <h2 id="analytics-cohort-heading">{cohort.title}</h2>
        <span className="recruitment-analytics__date">创建于 {formatDate(cohort.createdAt)}</span>
      </div>
      {!cohort.hasData ? (
        <p className="recruitment-analytics__empty">本届报名表暂无报名数据。</p>
      ) : (
        <>
          <div className="recruitment-analytics__overview" aria-label="所选届次概况">
            {metrics.map((metric) => (
              <article key={metric.label} className="recruitment-analytics__metric">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </div>

          <div className="recruitment-analytics__breakdown">
            <h3>招新结果分布</h3>
            <div className="recruitment-analytics__status-track" aria-hidden="true">
              {statuses.filter((status) => status.count > 0).map((status) => (
                <span key={status.key} className={"recruitment-analytics__status--" + status.key} style={{ flexGrow: status.count }} />
              ))}
            </div>
            <ul className="recruitment-analytics__status-list">
              {statuses.map((status) => (
                <li key={status.key}>
                  <i className={"recruitment-analytics__status-key recruitment-analytics__status--" + status.key} aria-hidden="true" />
                  <span>{status.label}</span>
                  <strong>{status.count.toLocaleString("zh-CN")}</strong>
                </li>
              ))}
            </ul>
            <p className="recruitment-analytics__membership">已录取记录中匹配到正式成员关系：{cohort.matchedFormalMemberCount.toLocaleString("zh-CN")}</p>
          </div>

          <div className="recruitment-analytics__group-detail">
            <h3>各组报名分布</h3>
            {cohort.groups.length === 0 ? (
              <p className="recruitment-analytics__empty">暂无可识别的主要组别数据。</p>
            ) : (
              <ul>
                {cohort.groups.map((group) => (
                  <li key={group.name}>
                    <div className="recruitment-analytics__group-label">
                      <span>{group.name}</span>
                      <span>{group.registrationCount.toLocaleString("zh-CN")} · {formatPercent(group.registrationCount * 100 / cohort.registrationCount)}</span>
                    </div>
                    <div className="recruitment-analytics__group-track" aria-hidden="true">
                      <span style={{ width: group.registrationCount * 100 / cohort.registrationCount + "%" }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function GroupTrendTable({ cohorts }: { cohorts: RecruitmentAnalyticsCohort[] }) {
  const groupNames = useMemo(() => {
    const names = new Set<string>();
    cohorts.forEach((cohort) => cohort.groups.forEach((group) => names.add(group.name)));
    return Array.from(names).sort((left, right) => left.localeCompare(right, "zh-CN"));
  }, [cohorts]);

  return (
    <section className="recruitment-analytics__panel" aria-labelledby="analytics-groups-heading">
      <div className="recruitment-analytics__section-heading">
        <h2 id="analytics-groups-heading">各届主要组别变化</h2>
      </div>
      {groupNames.length === 0 ? (
        <p className="recruitment-analytics__empty">暂无可比较的主要组别数据。</p>
      ) : (
        <>
          <div className="recruitment-analytics__table-wrap">
            <table className="admin-table recruitment-analytics__table recruitment-analytics__comparison">
              <caption className="sr-only">各组主要组别记录数跨届比较表</caption>
              <thead>
                <tr><th scope="col">组别</th>{cohorts.map((cohort) => <th scope="col" key={cohort.formId}>{cohort.title}</th>)}</tr>
              </thead>
              <tbody>
                {groupNames.map((name) => (
                  <tr key={name}>
                    <th scope="row">{name}</th>
                    {cohorts.map((cohort) => {
                      const group = cohort.groups.find((item) => item.name === name);
                      return <td key={cohort.formId}>{cohort.hasData ? (group?.registrationCount ?? 0).toLocaleString("zh-CN") : "暂无数据"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export default function RecruitmentAnalytics() {
  const { currentUser } = useOutletContext<DashboardLayoutOutletContext>();
  const [report, setReport] = useState<RecruitmentAnalyticsReport | null>(null);
  const [selectedFormId, setSelectedFormId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (currentUser.role.name !== "super_admin") {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    getRecruitmentAnalytics(controller.signal).then((result) => {
      setReport(result);
      setError("");
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "招新分析数据加载失败");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [currentUser.role.name]);

  const selectedCohort = findSelectedCohort(report, selectedFormId);

  if (currentUser.role.name !== "super_admin") {
    return <div className="admin-design"><p className="admin-alert admin-alert--error">仅超级管理员可查看招新数据分析。</p></div>;
  }

  return (
    <div className="admin-design recruitment-analytics">
      <header className="admin-page-header">
        <h1 className="admin-page-title">招新数据</h1>
      </header>

      {loading ? <BrandLoader label="正在读取汇总统计" /> : null}
      {error ? <div className="admin-alert admin-alert--error" role="alert">{error}</div> : null}

      {!loading && !error && report ? (
        <>
          <section className="recruitment-analytics__selector" aria-label="选择招新届次">
            <label className="admin-field-label" htmlFor="analytics-cohort-select">招新届次</label>
            <select
              id="analytics-cohort-select"
              className="admin-field recruitment-analytics__select"
              value={selectedCohort?.formId ?? ""}
              onChange={(event) => setSelectedFormId(Number(event.currentTarget.value))}
            >
              {report.cohorts.length === 0 ? <option value="">暂无招新报名表</option> : null}
              {report.cohorts.map((cohort) => (
                <option key={cohort.formId} value={cohort.formId}>
                  {cohort.title}{cohort.hasData ? "" : "（暂无数据）"}
                </option>
              ))}
            </select>
          </section>

          {selectedCohort ? <CohortDetails cohort={selectedCohort} /> : (
            <p className="recruitment-analytics__empty">暂无可分析的招新报名表。</p>
          )}

          {report.hasCohorts ? <details className="recruitment-analytics__panel recruitment-analytics__history">
            <summary>历届招新比较</summary>
            <div className="recruitment-analytics__history-content">
              <p className="recruitment-analytics__history-overview">
                共 {report.cohortCount.toLocaleString("zh-CN")} 届 · 累计报名 {formatCount(report.totalRegistrations, report.hasRecords)} · 累计录取 {formatCount(report.totalAdmitted, report.hasRecords)}
              </p>
              <section aria-labelledby="analytics-trend-heading">
                <h2 id="analytics-trend-heading">报名与录取趋势</h2>
                <TrendChart cohorts={report.cohorts} />
              </section>
              <GroupTrendTable cohorts={report.cohorts} />
            </div>
          </details> : null}

          <details className="recruitment-analytics__method">
            <summary>统计口径</summary>
            <div className="recruitment-analytics__method-content">
              <ul>
                <li>以报名表为独立届次，同一年多个批次分别统计。仅包含已发布、已关闭的报名表，以及有真实报名记录的草稿表单。</li>
                <li>报名数是记录数，跨届累计不对用户去重；录取率以全部报名记录为分母，包含撤回记录。</li>
                <li>状态分布按各报名记录的当前状态统计，包含待处理、录取、未通过、撤回及未归类历史状态。</li>
                <li>“匹配到正式成员关系”是已录取记录中，按同一用户、目标组及加入时间关联到的成员记录数，不代表单独登记的入队事件。</li>
                <li>各组报名按照主要组别统计：历史报名使用保留的组别快照，当前报名使用意向组。每条记录最多计入一个组别，缺失组别的记录不计入分布及对比；各组百分比以该届全部报名记录为分母。</li>
                <li>页面仅使用数据库聚合统计，不读取或传输报名者姓名、联系方式及表单答案。没有记录的年份不补造数据。</li>
              </ul>
              <p>数据覆盖：{report.hasCohorts ? formatDate(report.coverageStart) + " 至 " + formatDate(report.coverageEnd) + "（按报名表创建时间）" : "暂无招新报名表"}</p>
              <p>统计更新时间：{formatDate(report.generatedAt)} {report.generatedAt ? new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(report.generatedAt)) : ""}</p>
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}
