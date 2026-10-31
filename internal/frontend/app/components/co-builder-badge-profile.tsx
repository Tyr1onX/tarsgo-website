import { useEffect, useState } from "react";

import { CoBuilderBadgeSummaryView } from "~/components/co-builder-badge-summary";
import { getMyCoBuilderBadge, type CoBuilderBadgeSummary } from "~/lib/co-builder-badge-client";

export function CoBuilderBadgeProfile() {
  const [summary, setSummary] = useState<CoBuilderBadgeSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void getMyCoBuilderBadge()
      .then((value) => { if (active) setSummary(value); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "共建者勋章读取失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <p role="status" className="text-xs text-[var(--admin-muted)]">正在读取共建者勋章…</p>;
  if (error) return <p role="alert" className="text-xs text-rose-500">{error}</p>;
  return summary ? <CoBuilderBadgeSummaryView summary={summary} /> : null;
}
