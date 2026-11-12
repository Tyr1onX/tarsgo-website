import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";

import { BrandLoader } from "~/components/brand-loader";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { useAssignmentGroups } from "~/lib/use-assignment-groups";
import {
  trainingAssessmentClient,
  type CapabilityRatingInput, type TrainingSnapshot,
} from "~/lib/training-assessment-client";
import { MECHANICAL_TRAINING_GROUP_ID, buildTrainingGradebook, mechanicalTrainingSkills, sortGradebookMembers } from "~/lib/training-assessment-summary";

export function meta() {
  return [{ title: "培训成绩与能力评价 | TARSGO" }];
}

const LEVELS = [
  "0 · 未接触", "1 · 了解概念", "2 · 能完成简单任务",
  "3 · 可独立完成", "4 · 熟练可靠", "5 · 可带人或攻坚",
];

function Radar({ names, scores, maxScore = 5, label = "能力雷达" }: { names: string[]; scores: (number | null)[]; maxScore?: number; label?: string }) {
  const point = (index: number, radius: number) => {
    const angle = 2 * Math.PI * index / names.length - Math.PI / 2;
    return [160 + Math.cos(angle) * radius, 160 + Math.sin(angle) * radius] as const;
  };
  const points = (radius: number) => names.map((_, i) => point(i, radius).join(",")).join(" ");
  const complete = scores.every((score) => score !== null);
  const results = names.map((_, i) => point(i, 98 * (scores[i] ?? 0) / maxScore).join(",")).join(" ");
  const evaluatedPoints = names.flatMap((_, i) => scores[i] === null ? [] : [point(i, 98 * scores[i]! / maxScore).join(",")]);
  return (
    <svg className="mx-auto block h-auto w-full max-w-[400px]" viewBox="0 0 320 320" role="img" aria-label={`${label}：${names.map((name, i) => `${name} ${scores[i] === null ? (maxScore === 5 ? "未评价" : "无有效评分") : `${scores[i]} 分`}`).join("，")}`}>
      {Array.from({ length: 5 }, (_, i) => <polygon key={i} points={points(98 * (i + 1) / 5)} fill="none" stroke="var(--admin-border-subtle, #d1d5db)" strokeWidth="1" />)}
      {names.map((name, i) => {
        const [x, y] = point(i, 98);
        const [tx, ty] = point(i, 129);
        return <g key={name}><line x1="160" y1="160" x2={x} y2={y} stroke="var(--admin-border-subtle, #d1d5db)" /><text x={tx} y={ty} fontSize="10" textAnchor="middle" dominantBaseline="middle" fill="currentColor">{name.length > 8 ? name.slice(0, 8) + "…" : name}</text></g>;
      })}
      {complete ? <polygon points={results} fill="rgba(220,38,38,0.13)" stroke="#dc2626" strokeWidth="2" /> :
        evaluatedPoints.length > 1 ? <polyline points={evaluatedPoints.join(" ")} fill="none" stroke="#dc2626" strokeWidth="2" /> : null}
      {names.map((name, i) => {
        if (scores[i] === null) return null;
        const [x, y] = point(i, 98 * scores[i]! / maxScore);
        return <circle key={name} cx={x} cy={y} r="4" fill="#dc2626" />;
      })}
    </svg>
  );
}

export default function TrainingAssessmentRoute() {
  const { currentUser, groupResolution } = useOutletContext<DashboardLayoutOutletContext>();
  const { assignmentGroups, loading: groupsLoading, error: groupsError } = useAssignmentGroups(currentUser.id, currentUser.role.name, groupResolution?.groups);
  const [groupId, setGroupId] = useState(0);
  const [snapshot, setSnapshot] = useState<TrainingSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [memberId, setMemberId] = useState(0);
  const [memberQuery, setMemberQuery] = useState("");
  const [sortKey, setSortKey] = useState("");
  const [draftRatings, setDraftRatings] = useState<Record<number, CapabilityRatingInput>>({});
  const [dimensionName, setDimensionName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setGroupId((previous) => assignmentGroups.some((group) => group.groupId === previous) ? previous : assignmentGroups[0]?.groupId ?? 0);
  }, [assignmentGroups]);

  useEffect(() => {
    if (!groupId) { setSnapshot(null); return; }
    let active = true;
    setSnapshot(null);
    setLoading(true);
    setError("");
    trainingAssessmentClient.snapshot(groupId)
      .then((data) => { if (active) setSnapshot(data); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "读取失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [groupId, currentUser.id]);

  const gradebook = useMemo(() => snapshot ? buildTrainingGradebook(snapshot) : { assessments: [], members: [] }, [snapshot]);
  const summaries = gradebook.assessments;
  const selectedMember = gradebook.members.find((member) => member.userId === memberId);
  const selectedMemberId = selectedMember?.userId ?? 0;
  const visibleRows = useMemo(() => sortGradebookMembers(gradebook.members, sortKey).filter((member) =>
    member.name.toLowerCase().includes(memberQuery.trim().toLowerCase()) || String(member.userId).includes(memberQuery.trim())
  ), [gradebook, sortKey, memberQuery]);
  const dimensions = snapshot?.dimensions ?? [];

  function selectMember(userId: number) {
    setMemberId(userId);
    setNotice("");
    window.scrollTo(0, 0);
  }

  useEffect(() => {
    const ratings: Record<number, CapabilityRatingInput> = {};
    for (const dimension of dimensions) {
      const previous = snapshot?.ratings.find((value) => value.dimensionId === dimension.id && value.userId === selectedMemberId);
      ratings[dimension.id] = { dimensionId: dimension.id, score: previous?.score ?? null, note: previous?.note ?? "" };
    }
    setDraftRatings(ratings);
  }, [snapshot, selectedMemberId]);

  const savedRatings = dimensions.map((dimension) => snapshot?.ratings.find((rating) =>
    rating.userId === selectedMemberId && rating.dimensionId === dimension.id,
  ));
  const radarScores = savedRatings.map((rating) => rating?.score ?? null);
  const radarReady = dimensions.length >= 3 && radarScores.some((score) => score !== null);
  const trainingSkills = useMemo(() => groupId === MECHANICAL_TRAINING_GROUP_ID && snapshot && selectedMemberId
    ? mechanicalTrainingSkills(snapshot, selectedMemberId) : [], [groupId, snapshot, selectedMemberId]);

  async function refresh() {
    setSnapshot(await trainingAssessmentClient.snapshot(groupId));
  }

  async function addDimension(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dimensionName.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await trainingAssessmentClient.addDimension(groupId, dimensionName.trim());
      setDimensionName("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "添加维度失败");
    } finally { setBusy(false); }
  }

  async function deleteDimension(id: number, name: string) {
    if (!window.confirm(`确定删除“${name}”及其所有成员评分吗？`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await trainingAssessmentClient.removeDimension(groupId, id);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除维度失败");
    } finally { setBusy(false); }
  }

  async function saveRatings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMemberId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await trainingAssessmentClient.saveRatings(groupId, selectedMemberId, dimensions.map((dimension) =>
        draftRatings[dimension.id] ?? { dimensionId: dimension.id, score: null, note: "" },
      ));
      await refresh();
      setNotice("能力评价已保存");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "能力评价保存失败");
    } finally { setBusy(false); }
  }

  return (
    <main className="admin-design space-y-5 p-4 md:p-6">
      <header className="admin-page-header flex flex-wrap items-center justify-between gap-3">
        <h1 className="admin-page-title">培训成绩与能力评价</h1>
        {groupsLoading ? <BrandLoader size="sm" label="正在加载组别" /> : assignmentGroups.length > 1 ?
          <label className="admin-field-label">技术组
            <select className="admin-field" value={groupId} onChange={(event) => { setGroupId(Number(event.target.value)); setMemberId(0); setMemberQuery(""); setSortKey(""); setNotice(""); }}>
              {assignmentGroups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
            </select>
          </label> : <span>{assignmentGroups[0]?.name ?? ""}</span>}
      </header>
      {groupsError ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{groupsError}</p> : null}
      {error ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-[var(--admin-text)]">{notice}</p> : null}
      {loading ? <BrandLoader label="正在读取评价" /> : null}
      {snapshot ? selectedMember ? (
        <section className="admin-panel space-y-5 p-5">
          <button type="button" className="admin-button admin-button--quiet admin-button--small"
            onClick={() => { setMemberId(0); window.scrollTo(0, 0); }}>返回成绩总览</button>
          <header className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold">{selectedMember.name}</h2>
            <span className="text-sm text-[var(--admin-muted)]">成员 #{selectedMember.userId}</span>
          </header>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
            <section className="space-y-3" aria-label="个人能力画像">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">{trainingSkills.length ? "能力雷达" : "能力评价"}</h3>
                {trainingSkills.length ? <span className="text-xs text-[var(--admin-muted)]">作业成绩 · 百分制</span> : null}
              </div>
              {trainingSkills.length ? <>
                <Radar names={trainingSkills.map((skill) => skill.name)} scores={trainingSkills.map((skill) => skill.score)}
                  maxScore={100} label="个人作业能力雷达" />
                <div className="space-y-2">
                  {trainingSkills.map((skill) => <div key={skill.name}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--admin-border-subtle)] p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{skill.name}</div>
                      <div className="mt-1 text-xs text-[var(--admin-muted)]">
                        {skill.sources.map((source) => source.name).join("、")}{skill.total > 1 ? "平均" : ""}
                        {skill.graded < skill.total ? ` · 已评分 ${skill.graded}/${skill.total}` : ""}
                      </div>
                    </div>
                    <strong className="tabular-nums">{skill.score === null ? "未评分" : `${skill.score}/100`}</strong>
                  </div>)}
                </div>
              </> : radarReady ? <Radar names={dimensions.map((item) => item.name)} scores={radarScores} /> :
                <p className="text-sm text-[var(--admin-muted)]">{dimensions.length < 3 ? "能力维度不足 3 项" : "暂无能力评价"}</p>}
            </section>
            <section className="space-y-3" aria-label="个人历次成绩">
              <h3 className="text-lg font-semibold">历次成绩</h3>
              {summaries.length ? <ul className="divide-y divide-[var(--admin-border-subtle)]">
                {summaries.map((assessment, index) => {
                  const result = selectedMember.results[index];
                  return <li key={assessment.key} className="flex flex-wrap justify-between gap-x-4 gap-y-2 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{assessment.name}</div>
                      {assessment.source === "assignment" ? <div className="mt-1 text-xs text-[var(--admin-muted)]">站内批改{result.decision ? ` · ${result.decision === "passed" ? "通过" : "退回重做"}` : ""}</div> : null}
                      {result.note ? <p className="mt-1 text-sm text-[var(--admin-muted)]">{result.note}</p> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <strong className="block text-base tabular-nums">{result.status === "graded" ? `${result.score}/100` : result.status === "missing" ? "成绩缺失" : "无记录"}</strong>
                      {result.rank !== null ? <div className="mt-1 text-xs text-[var(--admin-muted)]">第 {result.rank} 名{assessment.average !== null ? ` · 组均 ${assessment.average}` : ""}</div> : null}
                    </div>
                  </li>;
                })}
              </ul> : <p className="text-sm text-[var(--admin-muted)]">暂无成绩记录</p>}
            </section>
          </div>
          {dimensions.length ? <section className="space-y-3 border-t border-[var(--admin-border-subtle)] pt-4" aria-label="人工能力评价">
                {trainingSkills.length ? <>
                  <h3 className="font-semibold">{trainingSkills.length ? "人工能力评价" : "能力评价"}</h3>
                  {radarReady ? <Radar names={dimensions.map((dimension) => dimension.name)} scores={radarScores} /> :
                    <p className="text-sm text-[var(--admin-muted)]">{dimensions.length < 3 ? "能力维度不足 3 项" : "暂无能力评价"}</p>}
                </> : null}
                {dimensions.length ? <div className="grid gap-2 sm:grid-cols-2">
                  {dimensions.map((dimension, index) => <div key={dimension.id} className="rounded-lg border border-[var(--admin-border-subtle)] p-3">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{dimension.name}</span>
                      <strong className="tabular-nums">{radarScores[index] === null ? "未评价" : `${radarScores[index]}/5`}</strong>
                    </div>
                    {savedRatings[index]?.note ? <p className="mt-1 text-xs text-[var(--admin-muted)]">{savedRatings[index]?.note}</p> : null}
                  </div>)}
                </div> : null}
                {dimensions.length ? <details key={selectedMemberId} className="border-t border-[var(--admin-border-subtle)] pt-3">
                  <summary className="cursor-pointer text-sm font-medium">评价当前成员</summary>
                  <form className="mt-4 space-y-3" onSubmit={(event) => void saveRatings(event)}>
                    {dimensions.map((dimension) => <div key={dimension.id} className="grid gap-2 border-t border-[var(--admin-border-subtle)] pt-3 md:grid-cols-[minmax(0,1fr)_10rem_1.5fr] md:items-center">
                      <label className="text-sm font-medium" htmlFor={`capability-${dimension.id}`}>{dimension.name}</label>
                      <select className="admin-field" id={`capability-${dimension.id}`} value={draftRatings[dimension.id]?.score ?? ""} onChange={(event) => setDraftRatings((previous) => ({
                        ...previous, [dimension.id]: { dimensionId: dimension.id, score: event.target.value === "" ? null : Number(event.target.value), note: previous[dimension.id]?.note ?? "" },
                      }))}>
                        <option value="">未评价</option>
                        {LEVELS.map((label, level) => <option key={level} value={level}>{label}</option>)}
                      </select>
                      <input className="admin-field" aria-label={`${dimension.name}评价依据`} maxLength={500} placeholder="评价依据"
                        value={draftRatings[dimension.id]?.note ?? ""} onChange={(event) => setDraftRatings((previous) => ({
                          ...previous, [dimension.id]: { dimensionId: dimension.id, score: previous[dimension.id]?.score ?? null, note: event.target.value },
                        }))} />
                    </div>)}
                    <button type="submit" className="admin-button admin-button--primary" disabled={busy}>保存成员评价</button>
                  </form>
                </details> : null}
          </section> : null}
        </section>
      ) : (
        <>
          <section className="admin-panel space-y-4 p-5" aria-label="全组考核概览">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">全组考核</h2>
              <span className="text-sm text-[var(--admin-muted)]">{gradebook.members.length} 位成员 · {summaries.length} 次考核</span>
            </div>
            {summaries.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {summaries.map((item) => <div key={item.key} className="rounded-xl border border-[var(--admin-border-subtle)] p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold">{item.name}</h3>
                  {item.source === "assignment" ? <span className="shrink-0 text-xs text-[var(--admin-muted)]">站内作业</span> : null}
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <span className="text-xs text-[var(--admin-muted)]">平均分</span>
                  <strong className="text-2xl tabular-nums">{item.average === null ? "—" : item.average}</strong>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--admin-border-subtle)]">
                  <div className="h-full bg-[var(--admin-accent-text)]" style={{ width: `${item.average ?? 0}%` }} />
                </div>
                <p className="mt-3 text-xs text-[var(--admin-muted)]">
                  {item.source === "assignment" ? `已批改 ${item.scored} 人` : `已评分 ${item.scored}/${item.total} 人`}
                  {item.missing ? ` · 缺失 ${item.missing}` : ""}
                </p>
              </div>)}
            </div> : <p className="text-sm text-[var(--admin-muted)]">暂无培训成绩</p>}
          </section>
          <section className="admin-panel space-y-4 p-5" aria-label="全组成绩对照">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">成员成绩与排名</h2>
              <input type="search" className="admin-field w-full sm:max-w-xs" aria-label="搜索成员" placeholder="搜索姓名或编号"
                value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} />
            </div>
            {visibleRows.length ? <div className="max-h-[40rem] overflow-auto">
              <table className="w-full min-w-[740px] border-collapse text-sm">
                <thead className="sticky top-0 z-20 bg-[var(--admin-surface)]">
                  <tr className="border-b border-[var(--admin-border-subtle)]">
                    <th scope="col" className="sticky left-0 z-20 min-w-40 bg-[var(--admin-surface)] px-3 py-3 text-left font-semibold">成员</th>
                    {summaries.map((item) => <th scope="col" key={item.key} className="min-w-36 px-2 py-3 text-center">
                      <button type="button" className={`w-full rounded-md px-1 py-1 text-center text-sm font-semibold hover:bg-[var(--admin-surface-subtle)] focus-visible:outline-2 ${sortKey === item.key ? "text-[var(--admin-accent-text)]" : ""}`}
                        aria-pressed={sortKey === item.key} title={`按${item.name}成绩排序`}
                        onClick={() => setSortKey((previous) => previous === item.key ? "" : item.key)}>
                        {item.name}{sortKey === item.key ? " ↓" : ""}
                      </button>
                      {item.source === "assignment" ? <div className="text-xs font-normal text-[var(--admin-muted)]">站内作业</div> : null}
                    </th>)}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((member) => <tr key={member.userId} className="border-b border-[var(--admin-border-subtle)]">
                    <th scope="row" className="sticky left-0 z-10 bg-[var(--admin-surface)] px-3 py-2 text-left">
                      <button type="button" className="rounded-md text-left font-semibold text-[var(--admin-accent-text)] underline-offset-2 hover:underline focus-visible:outline-2"
                        onClick={() => selectMember(member.userId)}>{member.name}</button>
                      <div className="text-xs font-normal text-[var(--admin-muted)]">#{member.userId}</div>
                    </th>
                    {member.results.map((result) => <td key={result.key} className="px-2 py-2 text-center tabular-nums">
                      {result.status === "graded" ? <>
                        <strong className="block">{result.score}</strong>
                        <span className="block text-xs text-[var(--admin-muted)]">第 {result.rank} 名</span>
                      </> : <span className="text-xs text-[var(--admin-muted)]">{result.status === "missing" ? "成绩缺失" : "无记录"}</span>}
                    </td>)}
                  </tr>)}
                </tbody>
              </table>
            </div> : <p className="text-sm text-[var(--admin-muted)]">{memberQuery.trim() ? "没有匹配的成员" : "暂无成员"}</p>}
          </section>
                <details key={groupId} className="admin-panel p-5">
                  <summary className="cursor-pointer text-sm font-medium">设置人工评价维度</summary>
                  <div className="mt-4 space-y-3">
                    <form className="flex flex-wrap gap-2" onSubmit={(event) => void addDimension(event)}>
                      <input className="admin-field min-w-40 flex-1" aria-label="新增能力维度" maxLength={100} value={dimensionName}
                        onChange={(event) => setDimensionName(event.target.value)} disabled={busy || dimensions.length >= 8} />
                      <button type="submit" className="admin-button admin-button--secondary"
                        disabled={busy || !dimensionName.trim() || dimensions.length >= 8}>添加维度</button>
                    </form>
                    {dimensions.map((dimension) => <div key={dimension.id} className="flex items-center justify-between gap-3">
                      <span className="text-sm">{dimension.name}</span>
                      <button type="button" className="admin-button admin-button--quiet admin-button--small"
                        disabled={busy} onClick={() => void deleteDimension(dimension.id, dimension.name)}>删除</button>
                    </div>)}
                  </div>
                </details>
        </>
      ) : null}
    </main>
  );
}
