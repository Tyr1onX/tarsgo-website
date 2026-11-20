import { Link, useNavigate } from "react-router";
import { TarsgoHeroLogo } from "~/components/tarsgo-motion-marks";

export function meta() {
  return [{ title: "页面未找到 | TARSGO" }];
}

export function StatusPage({
  status,
  title,
  description,
  debugDetails,
}: {
  status: number;
  title: string;
  description: string;
  debugDetails?: string;
}) {
  const navigate = useNavigate();

  return (
    <main className="public-home flex min-h-screen items-center justify-center px-6 py-16">
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-border-subtle bg-surface-light/60 px-7 py-10 text-center shadow-sm backdrop-blur-sm sm:px-10 sm:py-12">
        <div className="mb-5 flex justify-center">
          <TarsgoHeroLogo className="w-[152px] opacity-90" />
        </div>
        <div aria-hidden="true" className="select-none font-mono text-[clamp(4.5rem,17vw,7.5rem)] font-semibold leading-none tracking-tight text-accent-primary">
          {status}
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-fg-primary sm:text-3xl">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-fg-muted sm:text-base">{description}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border-subtle px-5 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:border-accent-primary/50 hover:text-fg-primary"
          >
            返回上一页
          </button>
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent-primary px-6 py-2.5 text-sm font-semibold text-fg-inverse transition-colors hover:bg-[#dfbd7c]"
          >
            返回首页
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border-subtle px-5 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:border-accent-primary/50 hover:text-fg-primary"
          >
            进入工作台
          </Link>
        </div>
        {debugDetails ? (
          <pre className="mt-8 max-h-64 overflow-auto rounded-lg border border-border-subtle bg-surface-light p-4 text-left text-xs text-fg-muted">
            <code>{debugDetails}</code>
          </pre>
        ) : null}
      </div>
    </main>
  );
}

export default function NotFound() {
  return (
    <StatusPage
      status={404}
      title="页面未找到"
      description="你访问的页面不存在或已被移除，请检查链接或返回首页。"
    />
  );
}
