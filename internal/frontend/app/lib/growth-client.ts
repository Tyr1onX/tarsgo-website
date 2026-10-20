import { apiRequest } from "~/lib/api-client";
export { formatGrowthDate, growthEventLabel, growthEventTone } from "~/lib/growth-presentation";

export interface GrowthEvent {
  key: string;
  kind: string;
  title: string;
  description?: string;
  groupName?: string;
  occurredAt: string;
  href?: string;
}

export interface GrowthProfile {
  displayName: string;
  groups: string[];
  stats: {
    completedChallenges: number;
    firstSubmissions: number;
    questionsAsked: number;
    discussionThreads: number;
    resolvedQuestions: number;
    faqContributions: number;
    weeklyReports: number;
  };
  events: GrowthEvent[];
  nextAction?: {
    title: string;
    detail?: string;
    dueAt?: string;
    status?: string;
    href: string;
  };
}

export function getGrowthProfile() {
  return apiRequest<GrowthProfile>("/api/growth/me");
}
