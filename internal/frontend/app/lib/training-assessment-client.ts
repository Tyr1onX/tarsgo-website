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

export interface ReviewedAssignmentGrade {
  assignmentId: number;
  assessmentName: string;
  userId: number;
  score: number;
  decision: "passed" | "needs_redo";
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
  assignmentGrades: ReviewedAssignmentGrade[];
  dimensions: CapabilityDimension[];
  ratings: CapabilityRating[];
}

export interface CapabilityRatingInput {
  dimensionId: number;
  score: number | null;
  note: string;
}

export const trainingAssessmentClient = {
  snapshot: (groupId: number) => apiRequest<TrainingSnapshot>(`/api/admin/training-assessments?groupId=${groupId}`),
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

