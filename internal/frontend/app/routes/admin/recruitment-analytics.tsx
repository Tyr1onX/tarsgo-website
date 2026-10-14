import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router";

import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { getRecruitmentAnalytics, type RecruitmentAnalyticsCohort, type RecruitmentAnalyticsReport } from "~/lib/recruitment-analytics-client";

export function meta() {
  return [{ title: "招新数据分析 | TARS-GO" }, { name: "description", content: "按报名表查看招新届次、录取和组别意向变化" }];
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
    </>
  );
}

function CohortDetails({ cohort }: { cohort: RecruitmentAnalyticsCohort }) {
  const statusRows = [
    ["报名记录", cohort.registrationCount],
    ["录取记录", cohort.admittedCount],
    ["录取率", formatPercent(cohort.admissionRate)],
    ["未通过", cohort.rejectedCount],
    ["撤回", cohort.withdrawnCount],
    ["待处理", cohort.pendingCount],
    ["已匹配正式成员关系", cohort.matchedFormalMemberCount],
  ] as const;

  return (
    <section className="recruitment-analytics__panel" aria-labelledby="analytics-cohort-heading">
      <div className="recruitment-analytics__section-heading">
        <div>
          <p className="admin-eyebrow">届次详情</p>
          <h2 id="analytics-cohort-heading">{cohort.title}</h2>
        </div>
        <span className="recruitment-analytics__date">创建于 {formatDate(cohort.createdAt)}</span>
      </div>
      {!cohort.hasData ? (
        <p className="recruitment-analytics__empty">本届报名表暂无报名数据。</p>
      ) : (
        <>
          <div className="recruitment-analytics__table-wrap">
            <table className="admin-table recruitment-analytics__table">
              <caption className="sr-only">本届报名状态与入队关系统计</caption>
              <thead><tr><th scope="col">统计指标</th><th scope="col">记录数 / 比率</th></tr></thead>
              <tbody>
                {statusRows.map(([label, value]) => (
                  <tr key={label}><th scope="row">{label}</th><td>{typeof value === "number" ? formatCount(value, cohort.hasData) : value}</td></tr>
                ))}
                {cohort.otherStatusCount > 0 ? (
                  <tr><th scope="row">未归类历史状态</th><td>{formatCount(cohort.otherStatusCount, cohort.hasData)}</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="recruitment-analytics__note">
            “已匹配正式成员关系”仅统计已录取报名记录中，同一用户在目标组存在且加入时间不早于报名提交时间的成员关系；系统没有独立的入队事件与报名表关联，此项用于区分录取和成员关系，不代表单独登记的入队事件。
          </p>
          <div className="recruitment-analytics__group-detail">
            <h3>组别报名意向</h3>
            {cohort.groups.length === 0 ? (
              <p className="recruitment-analytics__empty">暂无可识别的组别意向数据。</p>
            ) : (
              <ul>
                {cohort.groups.map((group) => (
                  <li key={group.name}>
                    <span>{group.name}</span>
                    <span>{group.registrationCount.toLocaleString("zh-CN")} 条报名记录</span>
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
        <div>
          <p className="admin-eyebrow">跨届比较</p>
          <h2 id="analytics-groups-heading">各届组别意向变化</h2>
        </div>
      </div>
      {groupNames.length === 0 ? (
        <p className="recruitment-analytics__empty">暂无可比较的组别意向数据。</p>
      ) : (
        <>
          <div className="recruitment-analytics__table-wrap">
            <table className="admin-table recruitment-analytics__table recruitment-analytics__comparison">
              <caption className="sr-only">各组报名意向记录数跨届比较表</caption>
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
          <p className="recruitment-analytics__note">
            每条报名记录的历史双志愿字段和当前主意向字段按记录与组别去重；同一报名记录可计入多个组别，因此各组人数不可相加作为总报名人数。组别名称按当前组别档案显示。
          </p>
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
        <div className="admin-eyebrow">吉甲 · 招新数据</div>
        <h1 className="admin-page-title">招新数据分析</h1>
        <p className="admin-page-description">按每张招新报名表独立查看报名、录取、组别意向和成员关系变化。</p>
      </header>

      {loading ? <p className="recruitment-analytics__state" role="status">正在读取汇总统计…</p> : null}
      {error ? <div className="admin-alert admin-alert--error" role="alert">{error}</div> : null}

      {!loading && !error && report ? (
        <>
          <section className="recruitment-analytics__overview" aria-label="历届招新概况">
            <article className="recruitment-analytics__metric">
              <span>招新届次（独立报名表）</span>
              <strong>{report.hasCohorts ? report.cohortCount.toLocaleString("zh-CN") : "暂无数据"}</strong>
            </article>
            <article className="recruitment-analytics__metric">
              <span>累计报名记录</span>
              <strong>{formatCount(report.totalRegistrations, report.hasRecords)}</strong>
            </article>
            <article className="recruitment-analytics__metric">
              <span>累计录取记录</span>
              <strong>{formatCount(report.totalAdmitted, report.hasRecords)}</strong>
            </article>
          </section>

          <section className="recruitment-analytics__panel" aria-labelledby="analytics-trend-heading">
            <div className="recruitment-analytics__section-heading">
              <div>
                <p className="admin-eyebrow">招新变化</p>
                <h2 id="analytics-trend-heading">各届报名与录取趋势</h2>
              </div>
            </div>
            <TrendChart cohorts={report.cohorts} />
          </section>

          <section className="recruitment-analytics__selector" aria-label="选择招新届次">
            <label className="admin-field-label" htmlFor="analytics-cohort-select">查看具体招新届次</label>
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
            <p className="recruitment-analytics__empty">当前没有可分析的招新报名表，历史年份不会以模拟数据补齐。</p>
          )}
          <GroupTrendTable cohorts={report.cohorts} />

          <section className="recruitment-analytics__method" aria-labelledby="analytics-method-heading">
            <h2 id="analytics-method-heading">数据说明</h2>
            <ul>
              <li>统计届次以实际报名表为单位；同一年多个批次分别统计，不按年份合并。只纳入已发布、已关闭的报名表，以及仍为草稿但已有真实报名记录的表单。</li>
              <li>报名数是报名表中的记录数，跨届累计不做用户去重。录取、未通过、撤回及待处理按当前标准流程状态统计；录取率为录取记录除以本届报名记录，包含撤回记录在分母中。</li>
              <li>正式入队不是录取的同义词。由于系统没有独立入队事件和报名届次外键，详情中的成员关系数仅按同一用户、目标组及成员关系加入时间匹配已录取记录；不作为独立登记的入队人数。</li>
              <li>旧招新记录使用两个志愿组字段，当前记录使用主意向组字段；每条记录对同一组只计一次，可计入多个组。未能关联当前组别档案的历史组别会单列，不能将各组计数相加作为总人数。</li>
              <li>页面只接收数据库聚合后的届次、状态、组别和成员关系数量，不读取或传输姓名、邮箱、手机号或表单答案。未覆盖的年份不补造记录；无报名数据的表单显示“暂无数据”。</li>
            </ul>
            <p>数据覆盖：{report.hasCohorts ? formatDate(report.coverageStart) + " 至 " + formatDate(report.coverageEnd) + "（按报名表创建时间）" : "暂无已发布或有真实报名记录的报名表"}</p>
            <p>统计更新时间：{formatDate(report.generatedAt)} {report.generatedAt ? new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(report.generatedAt)) : ""}</p>
          </section>
        </>
      ) : null}
    </div>
  );
}
