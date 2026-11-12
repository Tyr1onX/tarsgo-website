import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";

import { BrandLoader } from "~/components/brand-loader";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { useAssignmentGroups } from "~/lib/use-assignment-groups";
import {
  trainingAssessmentClient,
  type CapabilityRatingInput, type TrainingSnapshot,
} from "~/lib/training-assessment-client";
import { summarizeTrainingScores } from "~/lib/training-assessment-summary";

export function meta() {
  return [{ title: "培训成绩与能力评价 | TARSGO" }];
}

const LEVELS = [
  "0 · 未接触", "1 · 了解概念", "2 · 能完成简单任务",
  "3 · 可独立完成", "4 · 熟练可靠", "5 · 可带人或攻坚",
];

function Radar({ names, scores }: { names: string[]; scores: (number | null)[] }) {
  const point = (index: number, radius: number) => {
    const angle = 2 * Math.PI * index / names.length - Math.PI / 2;
    return [160 + Math.cos(angle) * radius, 160 + Math.sin(angle) * radius] as const;
  };
  const points = (radius: number) => names.map((_, i) => point(i, radius).join(",")).join(" ");
  const complete = scores.every((score) => score !== null);
  const results = names.map((_, i) => point(i, 98 * (scores[i] ?? 0) / 5).join(",")).join(" ");
  return (
    <svg className="mx-auto block h-auto w-full max-w-[400px]" viewBox="0 0 320 320" role="img" aria-label={`能力雷达：${names.map((name, i) => `${name} ${scores[i] === null ? "未评价" : `${scores[i]} 分`}`).join("，")}`}>
      {Array.from({ length: 5 }, (_, i) => <polygon key={i} points={points(98 * (i + 1) / 5)} fill="none" stroke="var(--admin-border-subtle, #d1d5db)" strokeWidth="1" />)}
      {names.map((name, i) => {
        const [x, y] = point(i, 98);
        const [tx, ty] = point(i, 129);
        return <g key={name}><line x1="160" y1="160" x2={x} y2={y} stroke="var(--admin-border-subtle, #d1d5db)" /><text x={tx} y={ty} fontSize="10" textAnchor="middle" dominantBaseline="middle" fill="currentColor">{name.length > 8 ? name.slice(0, 8) + "…" : name}</text></g>;
      })}
      {complete ? <polygon points={results} fill="rgba(220,38,38,0.13)" stroke="#dc2626" strokeWidth="2" /> : null}
      {names.map((name, i) => {
        if (scores[i] === null) return null;
        const [x, y] = point(i, 98 * scores[i]! / 5);
        return <circle key={name} cx={x} cy={y} r="4" fill="#dc2626" />;
      })}
    </svg>
  );
}

function GradeRow({ name, score, note, detail }: { name: string; score: number | null; note?: string; detail?: string }) {
  return <li className="rounded-xl border border-[var(--admin-border-subtle)] p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--admin-text)]">{name}</span>
        {detail ? <span className="text-xs text-[var(--admin-muted)]">{detail}</span> : null}
      </div>
      <strong className="shrink-0 text-lg tabular-nums text-[var(--admin-text)]">{score === null ? "成绩缺失" : score + "/100"}</strong>
    </div>
    {score !== null ? <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--admin-surface-subtle)]" role="meter" aria-label={name + "成绩"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}>
      <div className="h-full rounded-full bg-[var(--admin-accent-text)]" style={{ width: score + "%" }} />
    </div> : null}
    {note ? <p className="mt-3 text-sm text-[var(--admin-muted)]">{note}</p> : null}
  </li>;
}

export default function TrainingAssessmentRoute() {
  const { currentUser, groupResolution } = useOutletContext<DashboardLayoutOutletContext>();
  const { assignmentGroups, loading: groupsLoading, error: groupsError } = useAssignmentGroups(currentUser.id, currentUser.role.name, groupResolution?.groups);
  const [groupId, setGroupId] = useState(0);
  const [snapshot, setSnapshot] = useState<TrainingSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [memberId, setMemberId] = useState(0);
  const [memberQuery, setMemberQuery] = useState("");
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

  const members = snapshot?.members ?? [];
  const selectedMemberId = members.some((member) => member.userId === memberId) ? memberId : members[0]?.userId ?? 0;
  const matchingMembers = members.filter((member) => member.name.toLowerCase().includes(memberQuery.trim().toLowerCase()) || String(member.userId).includes(memberQuery.trim()));
  const memberOptions = matchingMembers.some((member) => member.userId === selectedMemberId) ? matchingMembers : members.filter((member) => member.userId === selectedMemberId).concat(matchingMembers);
  const dimensions = snapshot?.dimensions ?? [];
  const memberGrades = useMemo(() => snapshot?.grades.filter((grade) => grade.userId === selectedMemberId) ?? [], [snapshot, selectedMemberId]);
  const memberAssignmentGrades = useMemo(() => snapshot?.assignmentGrades.filter((grade) => grade.userId === selectedMemberId) ?? [], [snapshot, selectedMemberId]);

  useEffect(() => {
    const ratings: Record<number, CapabilityRatingInput> = {};
    for (const dimension of dimensions) {
      const previous = snapshot?.ratings.find((value) => value.dimensionId === dimension.id && value.userId === selectedMemberId);
      ratings[dimension.id] = { dimensionId: dimension.id, score: previous?.score ?? null, note: previous?.note ?? "" };
    }
    setDraftRatings(ratings);
  }, [snapshot, selectedMemberId]);

  const summaries = useMemo(() => snapshot ? summarizeTrainingScores(snapshot) : [], [snapshot]);
  const savedRatings = dimensions.map((dimension) => snapshot?.ratings.find((rating) =>
    rating.userId === selectedMemberId && rating.dimensionId === dimension.id,
  ));
  const radarScores = savedRatings.map((rating) => rating?.score ?? null);
  const radarReady = dimensions.length >= 3 && radarScores.some((score) => score !== null);

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
            <select className="admin-field" value={groupId} onChange={(event) => { setGroupId(Number(event.target.value)); setMemberId(0); setMemberQuery(""); setNotice(""); }}>
              {assignmentGroups.map((group) => <option key={group.groupId} value={group.groupId}>{group.name}</option>)}
            </select>
          </label> : <span>{assignmentGroups[0]?.name ?? ""}</span>}
      </header>
      {groupsError ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{groupsError}</p> : null}
      {error ? <p role="alert" className="text-sm text-[var(--admin-danger)]">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-[var(--admin-text)]">{notice}</p> : null}
      {loading ? <BrandLoader label="正在读取评价" /> : null}
      {snapshot ? <>
        <section className="admin-panel space-y-4 p-5">
          <h2 className="text-lg font-semibold">培训成绩</h2>
          {summaries.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {summaries.map((item) => <article key={item.key} className="rounded-xl border border-[var(--admin-border-subtle)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--admin-text)]">{item.name}</h3>
                {item.source === "assignment" ? <span className="text-xs text-[var(--admin-muted)]">站内作业</span> : null}
              </div>
              <div className="mt-4 flex items-baseline justify-between gap-2">
                <span className="text-sm text-[var(--admin-muted)]">平均分</span>
                <strong className="text-2xl tabular-nums text-[var(--admin-text)]">{item.average === null ? "—" : item.average}</strong>
              </div>
              {item.average !== null ? <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--admin-surface-subtle)]" role="meter" aria-label={item.name + "平均分"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.average}>
                <div className="h-full rounded-full bg-[var(--admin-accent-text)]" style={{ width: item.average + "%" }} />
              </div> : null}
              <p className="mt-3 text-sm text-[var(--admin-muted)]">{item.source === "assignment" ? "已批改 " + item.scored + " 条" : <>已评分 {item.scored} / {item.total} 条{item.missing ? " · 缺失 " + item.missing : ""}</>}</p>
            </article>)}
          </div> : <p className="text-sm text-[var(--admin-muted)]">暂无培训成绩</p>}
        </section>
        <section className="admin-panel space-y-4 p-5">
          <h2 className="text-lg font-semibold">成员成绩</h2>
          {members.length ? <>
            {members.length > 8 ? <input type="search" className="admin-field w-full max-w-xs" aria-label="搜索成员姓名或编号" placeholder="搜索成员" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} /> : null}
            <label className="admin-field-label block max-w-xs">选择成员
              <select className="admin-field w-full" value={selectedMemberId} onChange={(event) => { setMemberId(Number(event.target.value)); setMemberQuery(""); }}>
                {memberOptions.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
              </select>
            </label>
            {memberQuery.trim() && !matchingMembers.length ? <p className="text-sm text-[var(--admin-muted)]">没有匹配的成员</p> : null}
            {memberGrades.length || memberAssignmentGrades.length ? <ul className="grid gap-3 lg:grid-cols-2">
              {memberGrades.map((grade) => <GradeRow key={"training-" + grade.id} name={grade.assessmentName} score={grade.score} note={grade.note} />)}
              {memberAssignmentGrades.map((grade) => <GradeRow key={"assignment-" + grade.assignmentId} name={grade.assessmentName} score={grade.score}
                detail={"站内批改 · " + (grade.decision === "passed" ? "通过" : "退回重做")} />)}
            </ul> : <p className="text-sm text-[var(--admin-muted)]">该成员暂无成绩记录</p>}
          </> : <p className="text-sm text-[var(--admin-muted)]">暂无成员</p>}
        </section>
        <section className="admin-panel space-y-4 p-5">
          <h2 className="text-lg font-semibold">能力雷达</h2>
          {radarReady ? <Radar names={dimensions.map((item) => item.name)} scores={radarScores} /> :
            <p className="text-sm text-[var(--admin-muted)]">{dimensions.length < 3 ? "能力维度不足 3 项" : "暂无能力评价"}</p>}
          {dimensions.length ? <div className="grid gap-2 md:grid-cols-2">
            {dimensions.map((dimension, index) => <div key={dimension.id} className="rounded-lg border border-[var(--admin-border-subtle)] p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{dimension.name}</span>
                <strong className="tabular-nums">{radarScores[index] === null ? "未评价" : radarScores[index] + "/5"}</strong>
              </div>
              {savedRatings[index]?.note ? <p className="mt-1 text-xs text-[var(--admin-muted)]">{savedRatings[index]?.note}</p> : null}
            </div>)}
          </div> : null}
          <details className="border-t border-[var(--admin-border-subtle)] pt-4">
            <summary className="cursor-pointer text-sm font-medium text-[var(--admin-text)]">维护能力评价</summary>
            <div className="mt-4 space-y-4">
              <form className="flex flex-wrap gap-2" onSubmit={(event) => void addDimension(event)}>
                <input className="admin-field min-w-40 flex-1" aria-label="新增能力维度" maxLength={100} value={dimensionName} onChange={(event) => setDimensionName(event.target.value)} disabled={busy || dimensions.length >= 8} />
                <button type="submit" className="admin-button admin-button--secondary" disabled={busy || !dimensionName.trim() || dimensions.length >= 8}>添加维度</button>
              </form>
              {dimensions.length ? <form className="space-y-3" onSubmit={(event) => void saveRatings(event)}>
                {dimensions.map((dimension) => <div key={dimension.id} className="grid gap-2 border-t border-[var(--admin-border-subtle)] pt-3 md:grid-cols-[minmax(0,1fr)_10rem_1.5fr_auto] md:items-center">
                  <label className="font-medium text-sm" htmlFor={"capability-" + dimension.id}>{dimension.name}</label>
                  <select className="admin-field" id={"capability-" + dimension.id} value={draftRatings[dimension.id]?.score ?? ""} onChange={(event) => setDraftRatings((previous) => ({
                    ...previous, [dimension.id]: { dimensionId: dimension.id, score: event.target.value === "" ? null : Number(event.target.value), note: previous[dimension.id]?.note ?? "" },
                  }))}>
                    <option value="">未评价</option>
                    {LEVELS.map((label, level) => <option key={level} value={level}>{label}</option>)}
                  </select>
                  <input className="admin-field" aria-label={dimension.name + "评价依据"} maxLength={500} placeholder="评价依据" value={draftRatings[dimension.id]?.note ?? ""} onChange={(event) => setDraftRatings((previous) => ({
                    ...previous, [dimension.id]: { dimensionId: dimension.id, score: previous[dimension.id]?.score ?? null, note: event.target.value },
                  }))} />
                  <button type="button" className="admin-button admin-button--quiet admin-button--small" disabled={busy} onClick={() => void deleteDimension(dimension.id, dimension.name)}>删除</button>
                </div>)}
                <button type="submit" className="admin-button admin-button--primary" disabled={busy || !selectedMemberId}>保存该成员评价</button>
              </form> : null}
            </div>
          </details>
        </section>
      </> : null}
    </main>
  );
}
