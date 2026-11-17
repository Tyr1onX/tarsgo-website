import { useEffect, useState } from "react";
import { Link } from "react-router";

import { BrandLoader } from "~/components/brand-loader";
import { assignmentClient, type Assignment } from "~/lib/assignment-client";
import { buildAssignmentOverview } from "~/lib/assignment-overview";

type Props = {
  accountId: number;
  groups: readonly { groupId: number; name: string }[];
  selectedGroupId: number;
};

export function AssignmentOverview({ accountId, groups, selectedGroupId }: Props) {
  const [snapshot, setSnapshot] = useState<{
    accountId: number;
    assignments: Assignment[];
    pending: { groupId: number; reviewCount: number }[];
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setSnapshot(null);
    setError("");
    void Promise.all([assignmentClient.listAdmin(), assignmentClient.adminTodos()])
      .then(([assignments, todos]) => {
        if (active) setSnapshot({ accountId, assignments, pending: todos.groups });
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "作业进度加载失败");
      });
    return () => { active = false; };
  }, [accountId]);

  if (error) return <p role="alert" className="admin-notice admin-notice--error">{error}</p>;
  if (!snapshot || snapshot.accountId !== accountId) return <BrandLoader label="正在加载作业进度" />;

  const overview = buildAssignmentOverview(groups, snapshot.assignments, snapshot.pending, selectedGroupId);
  return <section className="admin-panel space-y-4 p-4 sm:p-5" aria-label="跨组作业进度">
    <h2 className="text-lg font-semibold">作业进度</h2>
    <dl className="grid grid-cols-3 gap-3 border-b border-[var(--admin-border-subtle)] pb-4">
      <div><dt className="text-xs text-[var(--admin-muted)]">已发布作业</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{overview.totals.assignments}</dd></div>
      <div><dt className="text-xs text-[var(--admin-muted)]">已交 / 应交人次</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{overview.totals.submitted} / {overview.totals.targets}</dd></div>
      <div><dt className="text-xs text-[var(--admin-muted)]">待批改</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{overview.totals.pendingReviews}</dd></div>
    </dl>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-[var(--admin-muted)]">
          <tr className="border-b border-[var(--admin-border-subtle)]">
            <th scope="col" className="pb-3 pr-4 font-medium">技术组</th>
            <th scope="col" className="pb-3 pr-4 font-medium">作业</th>
            <th scope="col" className="pb-3 pr-4 font-medium">已交 / 应交人次</th>
            <th scope="col" className="pb-3 pr-4 font-medium">已通过人次</th>
            <th scope="col" className="pb-3 pr-4 font-medium">待批改</th>
            <th scope="col" className="pb-3 font-medium"><span className="sr-only">操作</span></th>
          </tr>
        </thead>
        <tbody>
          {overview.groups.map((group) => <tr key={group.groupId} className="border-b border-[var(--admin-border-subtle)] last:border-0">
            <th scope="row" className="py-3 pr-4 font-medium">{group.name}</th>
            <td className="py-3 pr-4 tabular-nums">{group.assignments}</td>
            <td className="py-3 pr-4 tabular-nums">{group.submitted} / {group.targets}</td>
            <td className="py-3 pr-4 tabular-nums">{group.passed}</td>
            <td className="py-3 pr-4 tabular-nums">{group.pendingReviews}</td>
            <td className="py-3 text-right"><Link className="text-[var(--admin-accent-text)] hover:underline"
              to={`/dashboard/admin/training/assignments?view=list&groupId=${group.groupId}`}>查看作业</Link></td>
          </tr>)}
        </tbody>
      </table>
    </div>
    {overview.groups.length === 0 ? <p className="text-sm text-[var(--admin-muted)]">当前没有可查看的技术组。</p> : null}
  </section>;
}
