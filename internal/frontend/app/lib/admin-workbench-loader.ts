import type { AdminWorkbenchSummaryResponse } from "./registrations-client.ts";

export type AdminWorkbenchState = {
  recruitment: AdminWorkbenchSummaryResponse | null;
  assignmentReviewCount: number | null;
  errors: { recruitment?: string; assignments?: string };
};
export const emptyAdminWorkbenchState: AdminWorkbenchState = { recruitment: null, assignmentReviewCount: null, errors: {} };

// No cache or shared state: each account/permission generation owns its load.
// The component guards publication after navigation, retries and account changes.
export async function loadAdminWorkbench(
  recruitment: Promise<AdminWorkbenchSummaryResponse>,
  assignments: Promise<{ reviewCount: number }> | null,
  publish: (state: AdminWorkbenchState, pending: number) => void,
) {
  let state: AdminWorkbenchState = { ...emptyAdminWorkbenchState, errors: {} };
  let pending = assignments ? 2 : 1;
  const run = async <T>(key: keyof AdminWorkbenchState["errors"], request: Promise<T>, apply: (value: T) => Partial<AdminWorkbenchState>, fallback: string) => {
    try { const value = await request; state = { ...state, ...apply(value) }; }
    catch (cause) { state = { ...state, errors: { ...state.errors, [key]: cause instanceof Error ? cause.message : fallback } }; }
    publish(state, --pending);
  };
  await Promise.all([
    run("recruitment", recruitment, (value) => ({ recruitment: value }), "招新待办暂时无法读取。"),
    ...(assignments ? [run("assignments", assignments, (value) => ({ assignmentReviewCount: value.reviewCount }), "作业批改待办暂时无法读取。")] : []),
  ]);
}
