import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useOutletContext } from "react-router";

import { BrandLoader } from "~/components/brand-loader";
import type { DashboardLayoutOutletContext } from "~/routes/dashboard/layout";
import { useAssignmentGroups } from "~/lib/use-assignment-groups";
import {
  trainingAssessmentClient,
  type CapabilityRatingInput, type TrainingSnapshot,
} from "~/lib/training-assessment-client";
import { parseTrainingGradeText } from "~/lib/training-grade-parser";

export function meta() {
  return [{ title: "培训成绩与能力评价 | TARSGO" }];
}

const LEVELS = [
  "0 · 未接触", "1 · 了解概念", "2 · 能完成简单任务",
  "3 · 可独立完成", "4 · 熟练可靠", "5 · 可带人或攻坚",
];

function Radar({ names, scores }: { names: string[]; scores: number[] }) {
  const point = (index: number, radius: number) => {
    const angle = 2 * Math.PI * index / names.length - Math.PI / 2;
    return [160 + Math.cos(angle) * radius, 160 + Math.sin(angle) * radius] as const;
  };
  const points = (radius: number) => names.map((_, i) => point(i, radius).join(",")).join(" ");
  const results = names.map((_, i) => point(i, 98 * scores[i] / 5).join(",")).join(" ");
  return (
    <svg className="mx-auto block h-auto w-full max-w-[400px]" viewBox="0 0 320 320" role="img" aria-label={`能力雷达：${names.map((name, i) => `${name} ${scores[i]} 分`).join("，")}`}>
      {Array.from({ length: 5 }, (_, i) => <polygon key={i} points={points(98 * (i + 1) / 5)} fill="none" stroke="var(--admin-border-subtle, #d1d5db)" strokeWidth="1" />)}
      {names.map((name, i) => {
        const [x, y] = point(i, 98);
        const [tx, ty] = point(i, 129);
        return <g key={name}><line x1="160" y1="160" x2={x} y2={y} stroke="var(--admin-border-subtle, #d1d5db)" /><text x={tx} y={ty} fontSize="10" textAnchor="middle" dominantBaseline="middle" fill="currentColor">{name.length > 8 ? name.slice(0, 8) + "…" : name}</text></g>;
      })}
      <polygon points={results} fill="rgba(220,38,38,0.13)" stroke="#dc2626" strokeWidth="2" />
      {names.map((name, i) => { const [x, y] = point(i, 98 * scores[i] / 5); return <circle key={name} cx={x} cy={y} r="3" fill="#dc2626" />; })}
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
  const [draftRatings, setDraftRatings] = useState<Record<number, CapabilityRatingInput>>({});
  const [assessmentName, setAssessmentName] = useState("第一次培训作业");
  const [rawGrades, setRawGrades] = useState("");
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
  const dimensions = snapshot?.dimensions ?? [];
  const memberGrades = useMemo(() => snapshot?.grades.filter((grade) => grade.userId === selectedMemberId) ?? [], [snapshot, selectedMemberId]);

  useEffect(() => {
    const ratings: Record<number, CapabilityRatingInput> = {};
    for (const dimension of dimensions) {
      const previous = snapshot?.ratings.find((value) => value.dimensionId === dimension.id && value.userId === selectedMemberId);
      ratings[dimension.id] = { dimensionId: dimension.id, score: previous?.score ?? null, note: previous?.note ?? "" };
    }
    setDraftRatings(ratings);
  }, [snapshot, selectedMemberId]);

  const gradePreview = useMemo(() => parseTrainingGradeText(rawGrades), [rawGrades]);
  const numericCount = gradePreview.rows.filter((row) => row.score !== null).length;
  const radarReady = dimensions.length >= 3 && dimensions.every((dimension) => draftRatings[dimension.id]?.score !== null && draftRatings[dimension.id]?.score !== undefined);

  async function refresh() {
    setSnapshot(await trainingAssessmentClient.snapshot(groupId));
  }

  async function importGrades(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!gradePreview.rows.length || gradePreview.errors.length || !assessmentName.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await trainingAssessmentClient.importGrades(groupId, assessmentName.trim(), gradePreview.rows);
      await refresh();
      setNotice(`已同步 ${result.imported} 条；${result.unmatched.length ? `未匹配 ${result.unmatched.length} 名：${result.unmatched.join("、")}` : "全部匹配"}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "成绩同步失败");
    } finally { setBusy(false); }
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
            <select className="admin-field" value={groupId} onChange={(event) => { setGroupId(Number(event.target.value)); setMemberId(0); setNotice(""); }}>
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
          <form className="space-y-3" onSubmit={(event) => void importGrades(event)}>
            <label className="admin-field-label block">作业名称
              <input className="admin-field w-full" value={assessmentName} maxLength={120} onChange={(event) => setAssessmentName(event.target.value)} required />
            </label>
            <label className="admin-field-label block">批量成绩（每行：姓名 分数或备注）
              <textarea className="admin-field w-full" rows={5} value={rawGrades} onChange={(event) => setRawGrades(event.target.value)} placeholder={"王新锐 100\n樊思毅 未来版本？\n朱侃然"} />
            </label>
            {rawGrades.trim() ? <p className="text-sm text-[var(--admin-muted)]">待匹配 {gradePreview.rows.length} 人，其中有分数 {numericCount} 人、待核实 {gradePreview.rows.length - numericCount} 人</p> : null}
            {gradePreview.errors.map((item) => <p key={item} className="text-sm text-[var(--admin-danger)]">{item}</p>)}
            <button className="admin-button admin-button--primary" type="submit" disabled={busy || !gradePreview.rows.length || !!gradePreview.errors.length}>同步成绩</button>
          </form>
          <div className="border-t border-[var(--admin-border-subtle)] pt-4">
            <label className="admin-field-label">选择成员
              <select className="admin-field w-full max-w-xs" value={selectedMemberId} onChange={(event) => setMemberId(Number(event.target.value))}>
                {members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
              </select>
            </label>
            {memberGrades.length ? <ul className="mt-3 space-y-2">{memberGrades.map((grade) =>
              <li key={grade.id} className="flex flex-wrap gap-3 text-sm">
                <span className="font-medium">{grade.assessmentName}</span>
                <span>{grade.score === null ? "未评分" : `${grade.score}/100`}</span>
                {grade.note ? <span className="text-[var(--admin-muted)]">{grade.note}</span> : null}
              </li>)}</ul> : <p className="mt-3 text-sm text-[var(--admin-muted)]">暂无培训成绩</p>}
          </div>
        </section>
        <section className="admin-panel space-y-4 p-5">
          <h2 className="text-lg font-semibold">能力雷达</h2>
          <form className="flex flex-wrap gap-2" onSubmit={(event) => void addDimension(event)}>
            <input className="admin-field min-w-40 flex-1" aria-label="新增能力维度" placeholder="能力维度，例如 CAD 建模" maxLength={100} value={dimensionName} onChange={(event) => setDimensionName(event.target.value)} disabled={busy || dimensions.length >= 8} />
            <button type="submit" className="admin-button admin-button--secondary" disabled={busy || !dimensionName.trim() || dimensions.length >= 8}>添加维度</button>
          </form>
          {dimensions.length === 0 ? <p className="text-sm text-[var(--admin-muted)]">尚未配置能力维度</p> : <>
            {radarReady ? <Radar names={dimensions.map((item) => item.name)} scores={dimensions.map((item) => draftRatings[item.id]!.score!)} /> : <p className="text-sm text-[var(--admin-muted)]">完成至少 3 个维度的评价后显示雷达图，未评价不等于 0 分。</p>}
            <form className="space-y-3" onSubmit={(event) => void saveRatings(event)}>
              {dimensions.map((dimension) => <div key={dimension.id} className="grid gap-2 border-t border-[var(--admin-border-subtle)] pt-3 md:grid-cols-[minmax(0,1fr)_10rem_1.5fr_auto] md:items-center">
                <label className="font-medium text-sm" htmlFor={`capability-${dimension.id}`}>{dimension.name}</label>
                <select className="admin-field" id={`capability-${dimension.id}`} value={draftRatings[dimension.id]?.score ?? ""} onChange={(event) => setDraftRatings((previous) => ({
                  ...previous, [dimension.id]: { dimensionId: dimension.id, score: event.target.value === "" ? null : Number(event.target.value), note: previous[dimension.id]?.note ?? "" },
                }))}>
                  <option value="">未评价</option>
                  {LEVELS.map((label, level) => <option key={level} value={level}>{label}</option>)}
                </select>
                <input className="admin-field" aria-label={`${dimension.name}评价依据`} maxLength={500} placeholder="评价依据" value={draftRatings[dimension.id]?.note ?? ""} onChange={(event) => setDraftRatings((previous) => ({
                  ...previous, [dimension.id]: { dimensionId: dimension.id, score: previous[dimension.id]?.score ?? null, note: event.target.value },
                }))} />
                <button type="button" className="admin-button admin-button--quiet admin-button--small" disabled={busy} onClick={() => void deleteDimension(dimension.id, dimension.name)}>删除</button>
              </div>)}
              <button type="submit" className="admin-button admin-button--primary" disabled={busy || !selectedMemberId}>保存该成员评价</button>
            </form>
          </>}
        </section>
      </> : null}
    </main>
  );
}
