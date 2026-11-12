import { apiRequest } from "~/lib/api-client";

export interface TrainingMember {
  userId: number;
  name: string;
}

export interface TrainingGrade {
  id: number;
  groupId: number;
  assessmentName: string;
  userId: number;
  score: number | null;
  note: string;
  updatedAt: string;
}

export interface CapabilityDimension {
  id: number;
  groupId: number;
  name: string;
}

export interface CapabilityRating {
  id: number;
  dimensionId: number;
  userId: number;
  score: number;
  note: string;
  updatedAt: string;
}

export interface TrainingSnapshot {
  members: TrainingMember[];
  grades: TrainingGrade[];
  dimensions: CapabilityDimension[];
  ratings: CapabilityRating[];
}

export interface TrainingGradeInput {
  name: string;
  score: number | null;
  note: string;
}

export interface CapabilityRatingInput {
  dimensionId: number;
  score: number | null;
  note: string;
}

export const trainingAssessmentClient = {
  snapshot: (groupId: number) => apiRequest<TrainingSnapshot>(`/api/admin/training-assessments?groupId=${groupId}`),
  importGrades: (groupId: number, assessmentName: string, rows: TrainingGradeInput[]) =>
    apiRequest<{ imported: number; unmatched: string[] }>("/api/admin/training-assessments/import", {
      method: "POST", body: { groupId, assessmentName, rows },
    }),
  addDimension: (groupId: number, name: string) =>
    apiRequest<CapabilityDimension>("/api/admin/training-assessments/dimensions", {
      method: "POST", body: { groupId, name },
    }),
  removeDimension: (groupId: number, id: number) =>
    apiRequest<{ id: number }>(`/api/admin/training-assessments/dimensions/${id}?groupId=${groupId}`, { method: "DELETE" }),
  saveRatings: (groupId: number, userId: number, ratings: CapabilityRatingInput[]) =>
    apiRequest<{ userId: number }>("/api/admin/training-assessments/ratings", {
      method: "PUT", body: { groupId, userId, ratings },
    }),
};

export function parseTrainingGradeText(text: string) {
  const rows: TrainingGradeInput[] = [];
  const errors: string[] = [];
  const names = new Set<string>();

  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim().replace(/^\d+[.、．]\s*/, "");
    if (!line) continue;
    const match = line.match(/^(\S+)(?:\s+(.*))?$/);
    if (!match) { errors.push(`第 ${index + 1} 行无法识别`); continue; }
    const name = match[1];
    const value = match[2]?.trim() ?? "";
    if (names.has(name)) { errors.push(`第 ${index + 1} 行姓名重复：${name}`); continue; }
    names.add(name);
    if (/^\d+$/.test(value)) {
      const score = Number(value);
      if (score > 100) { errors.push(`第 ${index + 1} 行成绩超出 0–100`); continue; }
      rows.push({ name, score, note: "" });
    } else {
      rows.push({ name, score: null, note: value });
    }
  }

  return { rows, errors };
}
