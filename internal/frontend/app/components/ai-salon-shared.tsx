import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Navbar } from "~/components/navbar";
import { FooterCoordinateSandTrace } from "~/components/footer-coordinate-sand-trace";
import {
  getCachedCurrentUser,
  getOptionalCurrentUser,
  subscribeAuthStateChange,
  subscribeAccountSessionChange,
  type AuthUser,
} from "~/lib/auth-client";
import { type AcademicInfo } from "~/lib/ai-salon-client";
import { type CollegeOption } from "~/lib/leave-client";

export const salonPanel =
  "rounded-2xl border border-border-subtle bg-surface-secondary p-5 sm:p-8";
export const salonButton =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-border-subtle px-5 py-2 text-sm font-medium text-fg-primary transition hover:bg-surface-dark disabled:cursor-not-allowed disabled:opacity-50";
export const salonPrimaryButton = `${salonButton} bg-accent-primary text-[var(--color-surface-primary)] hover:opacity-90`;
export const salonField =
  "min-h-11 w-full rounded-lg border border-border-subtle bg-surface-primary px-3 py-2 text-base text-fg-primary";
export function useSalonIdentity() {
  const [user, setUser] = useState<AuthUser | null | undefined>(
    () => getCachedCurrentUser() ?? undefined,
  );
  const [authError, setAuthError] = useState("");
  useEffect(() => {
    let active = true;
    let version = 0;
    async function load(force = false) {
      const current = ++version;
      try {
        const next = await getOptionalCurrentUser({ force });
        if (active && current === version) {
          setUser(next);
          setAuthError("");
        }
      } catch {
        if (active && current === version)
          setAuthError("登录状态读取失败，请刷新重试");
      }
    }
    const offAuth = subscribeAuthStateChange((next) => {
      version++;
      setUser(next);
    });
    const offAccount = subscribeAccountSessionChange(() => {
      setUser(undefined);
      void load(true);
    });
    void load();
    return () => {
      active = false;
      version++;
      offAuth();
      offAccount();
    };
  }, []);
  return { user, authError };
}
export function SalonShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-primary text-fg-primary">
      <Navbar />
      <main className="public-route-content mx-auto min-h-[70vh] max-w-6xl px-5 pb-20 pt-32 sm:px-8 lg:pt-36">
        {children}
      </main>
      <FooterCoordinateSandTrace />
    </div>
  );
}
export function SalonBackLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="mb-8 inline-flex min-h-10 items-center gap-2 text-sm text-fg-muted hover:text-fg-primary"
    >
      ← {children}
    </Link>
  );
}
export function AcademicFields({
  value,
  onChange,
  colleges,
  disabled = false,
}: {
  value: AcademicInfo;
  onChange: (value: AcademicInfo) => void;
  colleges: CollegeOption[];
  disabled?: boolean;
}) {
  const knownCollege = colleges.some((c) => c.name === value.college);
  const [custom, setCustom] = useState(Boolean(value.college && !knownCollege));
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-4 sm:grid-cols-2">
      <label className="min-w-0 space-y-2">
        <span className="block text-sm">真实姓名</span>
        <input
          required
          maxLength={100}
          autoComplete="name"
          className={salonField}
          value={value.realName}
          onChange={(e) => onChange({ ...value, realName: e.target.value })}
        />
      </label>
      <div className="min-w-0 space-y-2">
        <label className="block space-y-2">
          <span className="block text-sm">学院</span>
          <select
            aria-label="学院"
            required
            className={salonField}
            value={
              custom || (value.college && !knownCollege)
                ? "__custom"
                : value.college
            }
            onChange={(e) => {
              setCustom(e.target.value === "__custom");
              onChange({
                ...value,
                college: e.target.value === "__custom" ? "" : e.target.value,
              });
            }}
          >
            <option value="">请选择学院</option>
            {colleges.map((c) => (
              <option key={c.code} value={c.name}>
                {c.name}
              </option>
            ))}
            <option value="__custom">其他学院</option>
          </select>
        </label>
        {custom || (value.college && !knownCollege) ? (
          <label className="block">
            <span className="sr-only">学院名称</span>
            <input
              required
              maxLength={100}
              placeholder="学院名称"
              className={salonField}
              value={value.college}
              onChange={(e) => onChange({ ...value, college: e.target.value })}
            />
          </label>
        ) : null}
      </div>
      <label className="min-w-0 space-y-2">
        <span className="block text-sm">年级</span>
        <input
          required
          maxLength={40}
          placeholder="如 2026 级"
          className={salonField}
          value={value.grade}
          onChange={(e) => onChange({ ...value, grade: e.target.value })}
        />
      </label>
      <label className="min-w-0 space-y-2">
        <span className="block text-sm">学号</span>
        <input
          required
          maxLength={40}
          pattern="[A-Za-z0-9]+"
          autoComplete="off"
          className={salonField}
          value={value.studentId}
          onChange={(e) => onChange({ ...value, studentId: e.target.value })}
        />
      </label>
      <label className="min-w-0 space-y-2">
        <span className="block text-sm">校区</span>
        <input
          required
          maxLength={40}
          placeholder="如 南岭校区"
          className={salonField}
          value={value.campus}
          onChange={(e) => onChange({ ...value, campus: e.target.value })}
        />
      </label>
      <label className="min-w-0 space-y-2">
        <span className="block text-sm">性别</span>
        <select
          aria-label="性别"
          required
          className={salonField}
          value={value.gender || ""}
          onChange={(e) =>
            onChange({ ...value, gender: Number(e.target.value) })
          }
        >
          <option value="">请选择性别</option>
          <option value={1}>男</option>
          <option value={2}>女</option>
        </select>
      </label>
    </fieldset>
  );
}
export function AcademicSummary({
  value,
}: {
  value: AcademicInfo & { email: string };
}) {
  return (
    <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
      {[
        ["真实姓名", value.realName],
        ["学院", value.college],
        ["年级", value.grade],
        ["学号", value.studentId],
        ["校区", value.campus],
        ["性别", value.gender === 1 ? "男" : "女"],
        ["邮箱", value.email],
      ].map(([label, text]) => (
        <div key={label} className="min-w-0">
          <dt className="text-fg-muted">{label}</dt>
          <dd className="mt-1 break-words">{text}</dd>
        </div>
      ))}
    </dl>
  );
}
