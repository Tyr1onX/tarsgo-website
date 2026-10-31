import { CoBuilderBadgeMark } from "~/components/co-builder-badge-mark";
import type { CoBuilderBadgeLevel, CoBuilderBadgeSummary } from "~/lib/co-builder-badge-client";

const badgeTiers: Array<{ level: CoBuilderBadgeLevel; label: string; threshold: number }> = [
  { level: "bronze", label: "青铜 I", threshold: 1 },
  { level: "silver", label: "白银 II", threshold: 3 },
  { level: "gold", label: "黄金 III", threshold: 10 },
];

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
}

export function CoBuilderBadgeSummaryView({
  summary,
  onRevoke,
  onReplay,
}: {
  summary: CoBuilderBadgeSummary;
  onRevoke?: (contributionId: number) => void;
  onReplay?: (level: CoBuilderBadgeLevel) => void;
}) {
  const nextLevelCount = summary.nextLevelCount ?? 0;
  const progressLabel = summary.nextLevelLabel
    ? `距${summary.nextLevelLabel}还差 ${Math.max(nextLevelCount - summary.contributionCount, 0)} 次（${summary.progressCount} / ${nextLevelCount}）`
    : "已达到最高等级";

  return (
    <section aria-labelledby="co-builder-badge-heading" className="min-w-0 space-y-3 border-t border-[var(--admin-border-subtle)] pt-4">
      <div className="flex min-w-0 items-center gap-3">
        {!onReplay ? <CoBuilderBadgeMark level={summary.levelCode} size={48} className="h-12 w-12 shrink-0" /> : null}
        <div className="min-w-0">
          <h3 id="co-builder-badge-heading" className="text-sm font-semibold text-[var(--admin-text)]">{summary.name}</h3>
          <p className="text-xs text-[var(--admin-muted)]">当前等级：{summary.levelLabel}</p>
        </div>
        <strong className="ml-auto shrink-0 text-sm text-[var(--admin-text)]">{summary.contributionCount} 次</strong>
      </div>
      {onReplay ? (
        <div className="co-builder-badge-tiers" aria-label="吉甲共建者勋章等级">
          {badgeTiers.map(({ level, label, threshold }) => {
            const earned = summary.contributionCount >= threshold;
            return (
              <button
                key={level}
                type="button"
                disabled={!earned}
                onClick={() => onReplay(level)}
                className={`co-builder-badge-tier${earned ? " co-builder-badge-tier--earned" : " co-builder-badge-tier--locked"}`}
                aria-label={`${label}勋章，已有 ${summary.awardCounts[level]} 人获得${earned ? "，点击重播解锁动画" : "，尚未解锁"}`}
              >
                <CoBuilderBadgeMark level={level} size={44} className="co-builder-badge-tier__mark" />
                <strong>{label}</strong>
                <span>已有 {summary.awardCounts[level]} 人获得</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="space-y-1.5">
        <div className="flex justify-between gap-3 text-xs text-[var(--admin-muted)]">
          <span>累计有效贡献</span>
          <span>{progressLabel}</span>
        </div>
        <div
          role="progressbar"
          aria-label="勋章升级进度"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={summary.progressPercent}
          className="h-1.5 overflow-hidden rounded-full bg-[var(--admin-border-subtle)]"
        >
          <div className="h-full rounded-full bg-[var(--admin-accent)]" style={{ width: `${summary.progressPercent}%` }} />
        </div>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-[var(--admin-text)]">贡献记录</h4>
        {summary.contributions.length === 0 ? (
          <p className="mt-2 text-xs text-[var(--admin-muted)]">暂无贡献记录。</p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--admin-border-subtle)]">
            {summary.contributions.map((record) => (
              <li key={record.id} className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[var(--admin-text)]">{record.description}</p>
                  <time className="text-[var(--admin-muted)]" dateTime={record.createdAt}>{formatDate(record.createdAt)}</time>
                  {record.revokedAt ? <span className="ml-2 text-[var(--admin-muted)]">已撤销 · {formatDate(record.revokedAt)}</span> : null}
                </div>
                {onRevoke && !record.revokedAt ? (
                  <button type="button" onClick={() => onRevoke(record.id)} className="shrink-0 text-[var(--admin-muted)] underline underline-offset-2 hover:text-[var(--admin-text)]">
                    撤销
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
