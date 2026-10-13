import { Link } from "react-router";

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
  return (
    <main className="public-home flex min-h-screen items-center justify-center px-6 py-16">
      <div className="mx-auto w-full max-w-lg text-center">
        <div aria-hidden="true" className="select-none text-[clamp(6rem,21vw,10rem)] font-semibold leading-none tracking-tight text-accent-primary">
          {status}
        </div>
        <h1 className="mt-6 text-2xl font-semibold text-fg-primary sm:text-3xl">{title}</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-fg-muted sm:text-base">{description}</p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-accent-primary px-6 py-3 text-sm font-semibold text-fg-inverse transition-colors hover:bg-[#dfbd7c]"
          >
            返回首页
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border-subtle px-6 py-3 text-sm font-medium text-fg-muted transition-colors hover:border-accent-primary/50 hover:text-fg-primary"
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
