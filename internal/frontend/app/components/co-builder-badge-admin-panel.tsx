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
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSummary(null);
    setError("");
    void getAdminCoBuilderBadge(userId)
      .then((value) => { if (active) setSummary(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "共建者勋章读取失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  async function grant() {
    const text = description.trim();
    if (saving) return;
    if (!text) {
      setError("请填写本次具体贡献。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      setSummary(await grantCoBuilderContribution(userId, text));
      setDescription("");
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
    <section aria-label="吉甲共建者勋章管理" className="space-y-3 border-t border-[var(--admin-border-subtle)] pt-4">
      <h3 className="text-sm font-semibold text-[var(--admin-text)]">勋章管理</h3>
      {loading ? <p role="status" className="text-xs text-[var(--admin-muted)]">正在读取贡献记录…</p> : null}
      {!loading && summary ? <CoBuilderBadgeSummaryView summary={summary} onRevoke={(id) => void revoke(id)} /> : null}
      {!loading ? (
        <div className="space-y-2">
          <label className="block text-xs text-[var(--admin-muted)]">
            本次贡献说明
            <textarea required maxLength={500} rows={2} value={description} onChange={(event) => { setDescription(event.target.value); setError(""); }} className="admin-field mt-1 min-h-20 resize-y" placeholder="填写已完成的具体贡献" />
          </label>
          <button type="button" onClick={() => void grant()} disabled={saving || !description.trim()} className="admin-button admin-button--secondary admin-button--small">
            {saving ? "处理中…" : "授予贡献 +1"}
          </button>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-xs text-[var(--theme-danger)]">{error}</p> : null}
    </section>
  );
}
