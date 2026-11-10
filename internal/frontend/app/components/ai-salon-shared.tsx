import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Navbar } from "~/components/navbar";
import { PublicFooter } from "~/components/public-footer";
import {
  getCachedCurrentUser,
  getOptionalCurrentUser,
  subscribeAuthStateChange,
  subscribeAccountSessionChange,
  type AuthUser,
} from "~/lib/auth-client";
import { type AcademicInfo } from "~/lib/ai-salon-client";

export const salonPanel =
  "rounded-2xl border border-border-subtle bg-surface-light p-5 sm:p-8";
export const salonButton =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-border-subtle px-5 py-2 text-sm font-medium text-fg-primary transition hover:bg-surface-dark disabled:cursor-not-allowed disabled:opacity-50";
export const salonPrimaryButton = `${salonButton.replace("text-fg-primary", "text-fg-inverse").replace("hover:bg-surface-dark", "hover:bg-[var(--theme-accent-button-hover)]")} bg-[var(--theme-accent-button)]`;
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
      <main className="public-route-content mx-auto min-h-[70vh] max-w-6xl px-5 pb-20 pt-32 sm:px-8 lg:pt-36 min-[1920px]:max-w-[min(80vw,120rem)]">
        {children}
      </main>
      <PublicFooter />
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
export function AcademicSummary({
  value,
}: {
  value: Pick<AcademicInfo, "realName" | "college" | "grade" | "studentId" | "isStudent"> & { email: string };
}) {
  return (
    <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
      {[
        ["真实姓名", value.realName],
        ["学院", value.college],
        ["年级", value.grade],
        ["学号", value.studentId],
        ["学生身份", value.isStudent == null ? "历史资料" : value.isStudent ? "在校学生" : "非在校学生"],
        ["邮箱", value.email],
      ].filter(([, text]) => Boolean(text)).map(([label, text]) => (
        <div key={label} className="min-w-0">
          <dt className="text-fg-muted">{label}</dt>
          <dd className="mt-1 break-words">{text}</dd>
        </div>
      ))}
    </dl>
  );
}
