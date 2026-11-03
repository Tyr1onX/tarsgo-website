import { useEffect, useState } from "react";

import { CoBuilderBadgeSummaryView } from "~/components/co-builder-badge-summary";
import {
  getAdminCoBuilderBadge,
  grantCoBuilderContribution,
  revokeCoBuilderContribution,
  type CoBuilderBadgeSummary,
} from "~/lib/co-builder-badge-client";

export function CoBuilderBadgeAdminPanel({ userId, onUpdated }: { userId: number; onUpdated?: () => void }) {
  const [summary, setSummary] = useState<CoBuilderBadgeSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSummary(null);
    setError("");
    setEditing(false);
    void getAdminCoBuilderBadge(userId)
      .then((value) => { if (active) setSummary(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "共建者勋章读取失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  async function grant() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      setSummary(await grantCoBuilderContribution(userId));
      onUpdated?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登记贡献失败");
    } finally {
      setSaving(false);
    }
  }

  async function revoke(contributionId: number) {
    if (saving || !window.confirm("确定撤销这条贡献记录吗？撤销后仍会保留记录，但不再计入勋章等级。")) return;
    setSaving(true);
    setError("");
    try {
      setSummary(await revokeCoBuilderContribution(userId, contributionId));
      onUpdated?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "撤销贡献失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="吉甲共建者勋章管理" className="space-y-3">
      <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-[var(--admin-text)]">吉甲共建者</h3>
        {!loading && summary ? <button type="button" disabled={saving} onClick={() => setEditing((value) => !value)} className="admin-button admin-button--quiet admin-button--small">{editing ? "完成" : "管理贡献"}</button> : null}
      </div>
      {loading ? <p role="status" className="text-xs text-[var(--admin-muted)]">正在读取贡献记录…</p> : null}
      {!loading && summary ? <CoBuilderBadgeSummaryView summary={summary} onRevoke={editing ? (id) => void revoke(id) : undefined} /> : null}
      {!loading && editing ? (
        <div className="space-y-2">
          <button type="button" onClick={() => void grant()} disabled={saving} className="admin-button admin-button--secondary admin-button--small">
            {saving ? "处理中…" : "授予贡献 +1"}
          </button>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-xs text-[var(--theme-danger)]">{error}</p> : null}
    </section>
  );
}
