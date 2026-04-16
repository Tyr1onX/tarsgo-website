import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface-primary flex items-center justify-center px-6 py-20 overflow-hidden relative">
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-accent-primary/5 blur-[120px] animate-notfound-glow" />
      <div className="absolute top-1/3 left-1/3 w-[300px] h-[300px] rounded-full bg-accent-secondary/5 blur-[80px] animate-notfound-glow-delayed" />

      <div className="relative z-10 text-center max-w-lg mx-auto">
        {/* Large 404 number */}
        <div className="animate-notfound-number select-none">
          <h1 className="text-[160px] sm:text-[200px] font-display font-bold leading-none tracking-tight bg-gradient-to-b from-fg-primary via-fg-muted to-transparent bg-clip-text text-transparent">
            404
          </h1>
        </div>

        {/* Decorative line */}
        <div className="animate-notfound-line flex items-center justify-center gap-3 -mt-4 mb-8">
          <span className="h-px w-12 bg-gradient-to-r from-transparent to-accent-primary/60" />
          <span className="h-1.5 w-1.5 rounded-full bg-accent-primary animate-pulse" />
          <span className="h-px w-20 bg-accent-primary/40" />
          <span className="h-1.5 w-1.5 rounded-full bg-accent-secondary animate-pulse" />
          <span className="h-px w-12 bg-gradient-to-l from-transparent to-accent-secondary/60" />
        </div>

        {/* Message */}
        <div className="animate-notfound-content space-y-3 mb-10">
          <h2 className="text-xl sm:text-2xl font-semibold text-fg-primary">
            页面未找到
          </h2>
          <p className="text-fg-muted text-sm sm:text-base leading-relaxed max-w-md mx-auto">
            你访问的页面不存在或已被移除。请检查链接是否正确，或返回首页继续浏览。
          </p>
        </div>

        {/* Action buttons */}
        <div className="animate-notfound-buttons flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/"
            className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent-primary text-white font-medium text-sm transition-all duration-300 hover:bg-accent-primary/90 hover:shadow-lg hover:shadow-accent-primary/25 hover:-translate-y-0.5"
          >
            <svg
              className="w-4 h-4 transition-transform duration-300 group-hover:-translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            返回首页
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border-subtle text-fg-muted font-medium text-sm transition-all duration-300 hover:border-fg-dim hover:text-fg-primary hover:bg-white/5 hover:-translate-y-0.5"
          >
            进入控制台
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </Link>
        </div>

        {/* Bottom hint */}
        <p className="animate-notfound-hint mt-12 text-xs text-fg-dim">
          TARS-Go &middot; 吉林大学吉甲大师战队
        </p>
      </div>
    </div>
  );
}
