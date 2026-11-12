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
