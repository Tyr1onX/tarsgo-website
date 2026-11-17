import { useEffect, useState } from "react";

import {
  getAuthUserName,
  getAuthUserRoleLabel,
  initializeAccountSessions,
  type AccountSessionAccount,
} from "~/lib/auth-client";

export function useAccountSessionChoices(open: boolean, currentUserId: number | undefined) {
  const [accounts, setAccounts] = useState<AccountSessionAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !currentUserId) return;
    let active = true;
    setLoading(true);
    setAccounts([]);
    setError("");
    void initializeAccountSessions()
      .then((items) => { if (active) setAccounts(items); })
      .catch((failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : "账号列表暂时无法读取。");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, currentUserId]);

  return { accounts, setAccounts, loading, error, setError };
}

export function AccountSessionChoices({
  accounts, currentUserId, loading, busy, error, onSwitch, onRemove, onReauthenticate, onAdd,
}: {
  accounts: AccountSessionAccount[];
  currentUserId: number;
  loading: boolean;
  busy: boolean;
  error: string;
  onSwitch: (accountId: number) => void;
  onRemove: (accountId: number) => void;
  onReauthenticate: (email: string) => void;
  onAdd: () => void;
}) {
  const otherAccounts = accounts.filter((account) => !account.current && account.user.id !== currentUserId);
  const canAddAccount = !loading && accounts.length === 1 && otherAccounts.length === 0;
  if (!loading && !error && otherAccounts.length === 0 && !canAddAccount) return null;

  return (
    <div className="account-session-choices" aria-label="切换账号" aria-busy={loading}>
      {loading || otherAccounts.length > 0 ? <div className="account-session-choices__heading">切换账号</div> : null}
      {loading ? <p className="account-session-choices__message" role="status">正在读取账号…</p> :
        otherAccounts.map((account) => {
          const available = account.status === "available";
          const status = account.status === "disabled" ? "账号已停用"
            : account.status === "expired" ? "会话已过期" : account.status === "revoked" ? "会话已撤销" : getAuthUserRoleLabel(account.user);
          const details = (
            <>
              <span className="account-session-choices__name">{getAuthUserName(account.user)}</span>
              <span className="account-session-choices__email">{account.user.email}</span>
              <span className="account-session-choices__status">{status}</span>
            </>
          );
          return (
            <div className="account-session-choices__row" key={account.id}>
              {!available ? (
                <div className="account-session-choices__identity">{details}</div>
              ) : (
                <button type="button" role="menuitem" disabled={busy} onClick={() => onSwitch(account.id)}
                  className="account-session-choices__identity account-session-choices__select"
                  aria-label={`切换到${getAuthUserName(account.user)}（${account.user.email}）`}>{details}</button>
              )}
              {!available && account.status !== "disabled" ? (
                <button type="button" role="menuitem" disabled={busy} className="account-session-choices__small-action"
                  onClick={() => onReauthenticate(account.user.email)}>重新验证</button>
              ) : null}
              <button type="button" role="menuitem" disabled={busy} onClick={() => onRemove(account.id)}
                className="account-session-choices__remove"
                aria-label={`移除${getAuthUserName(account.user)}（${account.user.email}）`} title="移除已保存账号">×</button>
            </div>
          );
        })}
      {error ? <p className="account-session-choices__error" role="alert">{error}</p> : null}
      {canAddAccount ? (
        <button type="button" role="menuitem" disabled={busy} onClick={onAdd} className="account-session-choices__add">
          登录其他账号
        </button>
      ) : null}
    </div>
  );
}
