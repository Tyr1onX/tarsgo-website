import { useEffect, useState } from "react";

import {
  getAuthUserName,
  getAuthUserRoleLabel,
  initializeAccountSessions,
  type AccountSessionAccount,
  type AuthUser,
} from "~/lib/auth-client";
import { GroupAnimatedMark } from "./tarsgo-motion-marks";

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

export function AccountMenuIdentity({
  user,
  groups = [],
}: {
  user: AuthUser;
  groups?: Array<{ groupId: number; name: string; role: number }>;
}) {
  const name = getAuthUserName(user);
  const role = getAuthUserRoleLabel(user);
  const avatarUrl = user.avatarUrl?.trim();

  return (
    <div className="account-menu-identity" aria-label="当前账号">
      <span className="account-menu-identity__avatar" aria-hidden="true">
        {name.charAt(0)}
        {avatarUrl ? <img src={avatarUrl} alt="" referrerPolicy="no-referrer"
          onError={(event) => { event.currentTarget.hidden = true; }} /> : null}
      </span>
      <span className="account-menu-identity__info">
        <strong className="account-menu-identity__name">{name}</strong>
        <span className="account-menu-identity__email">{user.email}</span>
        {name !== role ? <span className="account-menu-identity__role">{role}</span> : null}
        {groups.length > 0 ? (
          <span className="account-menu-identity__groups">
            {groups.map((group, idx) => (
              <span key={group.groupId} className="account-menu-identity__group-chip">
                <span className="account-menu-identity__group-icon" aria-hidden="true">
                  <GroupAnimatedMark groupName={group.name} play={idx === 0} />
                </span>
                <span>{group.name}</span>
              </span>
            ))}
          </span>
        ) : null}
      </span>
      <svg className="account-menu-identity__check" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.7 2.7L16.5 9" />
      </svg>
    </div>
  );
}

export function AccountMenuActionIcon({ name }: { name: "my-profile" | "community" | "logout" }) {
  const paths = {
    "my-profile": "M20 21v-2a7 7 0 0 0-14 0v2 M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
    community: "M20 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-4 2 1.5-4A8.5 8.5 0 1 1 20 11.5Z",
    logout: "M9 3H4v18h5 M14 7l5 5-5 5 M8 12h11",
  };
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d={paths[name]} />
  </svg>;
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
              <span className="account-session-choices__avatar" aria-hidden="true">
                {getAuthUserName(account.user).charAt(0)}
                {account.user.avatarUrl ? <img src={account.user.avatarUrl} alt="" referrerPolicy="no-referrer"
                  onError={(event) => { event.currentTarget.hidden = true; }} /> : null}
              </span>
              <span className="account-session-choices__details">
                <span className="account-session-choices__name">{getAuthUserName(account.user)}</span>
                <span className="account-session-choices__meta">{account.user.email} · {status}</span>
              </span>
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
                aria-label={`移除${getAuthUserName(account.user)}（${account.user.email}）`} title="移除已保存账号">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
                </svg>
              </button>
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
