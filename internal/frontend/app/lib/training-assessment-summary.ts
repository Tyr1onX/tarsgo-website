import type { TrainingSnapshot } from "./training-assessment-client";

export interface TrainingScoreSummary {
  key: string;
  name: string;
  source: "training" | "assignment";
  total: number;
  scored: number;
  missing: number;
  average: number | null;
}

export function summarizeTrainingScores(snapshot: TrainingSnapshot): TrainingScoreSummary[] {
  const memberIDs = new Set(snapshot.members.map((member) => member.userId));
  const rows = new Map<string, TrainingScoreSummary & { sum: number }>();

  function add(key: string, name: string, source: TrainingScoreSummary["source"], score: number | null) {
    let item = rows.get(key);
    if (!item) {
      item = { key, name, source, total: 0, scored: 0, missing: 0, average: null, sum: 0 };
      rows.set(key, item);
    }
    item.total++;
    if (score === null) item.missing++;
    else {
      item.scored++;
      item.sum += score;
    }
  }

  for (const grade of snapshot.grades) {
    if (memberIDs.has(grade.userId)) add("training:" + grade.assessmentName, grade.assessmentName, "training", grade.score);
  }
  for (const grade of snapshot.assignmentGrades) {
    if (memberIDs.has(grade.userId)) add("assignment:" + grade.assignmentId, grade.assessmentName, "assignment", grade.score);
  }

  return [...rows.values()].map(({ sum, ...item }) => ({
    ...item,
    average: item.scored ? Math.round(sum / item.scored * 10) / 10 : null,
  }));
}

export const MECHANICAL_TRAINING_GROUP_ID = 4;

// Mapping to the actual training records. A dimension score is a percentage,
// not an independently verified proficiency level.
const MECHANICAL_SKILL_SOURCES = [
  { name: "SolidWorks", assessments: [
    { kind: "training", key: "第一次培训作业", label: "第一次培训作业" },
    { kind: "training", key: "第二次装配体作业", label: "第二次装配体作业" },
  ] },
  { name: "零件设计", assessments: [
    { kind: "assignment", key: 8, label: "第三次作业" },
  ] },
  { name: "轴系设计", assessments: [
    { kind: "assignment", key: 16, label: "轴系设计作业" },
  ] },
] as const;

export function mechanicalTrainingSkills(snapshot: TrainingSnapshot, userId: number) {
  return MECHANICAL_SKILL_SOURCES.map((dimension) => {
    const sources = dimension.assessments.map((assessment) => {
      const grade = assessment.kind === "training"
        ? snapshot.grades.find((item) => item.userId === userId && item.assessmentName === assessment.key)
        : snapshot.assignmentGrades.find((item) => item.userId === userId && item.assignmentId === assessment.key);
      return { name: assessment.label, score: grade?.score ?? null, recorded: grade !== undefined };
    });
    const scores = sources.flatMap((source) => source.score === null ? [] : [source.score]);
    return {
      name: dimension.name,
      score: scores.length ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length * 10) / 10 : null,
      graded: scores.length,
      total: sources.length,
      sources,
    };
  });
}

export interface RankedTrainingMember {
  userId: number;
  name: string;
  score: number | null;
  note: string;
  rank: number | null;
}

export function rankTrainingAssessment(snapshot: TrainingSnapshot, key: string): RankedTrainingMember[] {
  const names = new Map(snapshot.members.map((member) => [member.userId, member.name]));
  const entries = key.startsWith("training:")
    ? snapshot.grades
      .filter((grade) => "training:" + grade.assessmentName === key)
      .map((grade) => ({ userId: grade.userId, score: grade.score, note: grade.note }))
    : snapshot.assignmentGrades
      .filter((grade) => "assignment:" + grade.assignmentId === key)
      .map((grade) => ({ userId: grade.userId, score: grade.score, note: "" }));

  const sorted = entries
    .filter((entry) => names.has(entry.userId))
    .map((entry) => ({ ...entry, name: names.get(entry.userId)!, rank: null as number | null }))
    .sort((a, b) => {
      if (a.score === null) return b.score === null ? a.name.localeCompare(b.name, "zh") || a.userId - b.userId : 1;
      if (b.score === null) return -1;
      return b.score - a.score || a.name.localeCompare(b.name, "zh") || a.userId - b.userId;
    });

  let lastScore: number | null = null;
  let rank = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].score === null) break;
    if (sorted[i].score !== lastScore) {
      rank = i + 1;
      lastScore = sorted[i].score;
    }
    sorted[i].rank = rank;
  }
  return sorted;
}

export type GradebookResult = {
  key: string;
  score: number | null;
  rank: number | null;
  status: "graded" | "missing" | "unrecorded";
  note: string;
  decision?: "passed" | "needs_redo";
};

export type GradebookMember = {
  userId: number;
  name: string;
  results: GradebookResult[];
};

export function buildTrainingGradebook(snapshot: TrainingSnapshot) {
  const assessments = summarizeTrainingScores(snapshot);
  const rankings = assessments.map((assessment) =>
    new Map(rankTrainingAssessment(snapshot, assessment.key).map((entry) => [entry.userId, entry]))
  );
  const reviews = new Map(snapshot.assignmentGrades.map((item) => [item.userId + ":assignment:" + item.assignmentId, item] as const));
  const members: GradebookMember[] = snapshot.members.map((member) => ({
    ...member,
    results: assessments.map((assessment, index) => {
      const ranked = rankings[index].get(member.userId);
      const review = assessment.source === "assignment"
        ? reviews.get(member.userId + ":" + assessment.key) : undefined;
      return {
        key: assessment.key,
        score: ranked?.score ?? null,
        rank: ranked?.rank ?? null,
        status: !ranked ? "unrecorded" as const : ranked.score === null ? "missing" as const : "graded" as const,
        note: ranked?.note ?? "",
        decision: review?.decision,
      };
    }),
  }));
  return { assessments, members };
}

export function sortGradebookMembers(members: GradebookMember[], assessmentKey: string) {
  return [...members].sort((a, b) => {
    const resultA = a.results.find((item) => item.key === assessmentKey);
    const resultB = b.results.find((item) => item.key === assessmentKey);
    const order = (result: GradebookResult | undefined) =>
      result?.status === "graded" ? 0 : result?.status === "missing" ? 1 : 2;
    const difference = order(resultA) - order(resultB);
    if (assessmentKey && difference) return difference;
    if (assessmentKey && resultA?.rank != null && resultB?.rank != null && resultA.rank !== resultB.rank) {
      return resultA.rank - resultB.rank;
    }
    return a.name.localeCompare(b.name, "zh") || a.userId - b.userId;
  });
}
