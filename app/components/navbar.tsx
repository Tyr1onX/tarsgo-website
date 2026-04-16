import { Link } from "react-router";
import { useState } from "react";

const navLinks = [
  { label: "首页", href: "/#hero", active: true },
  { label: "关于我们", href: "/#about", active: false },
  { label: "赛事成就", href: "/#achievements", active: false },
  { label: "加入我们", href: "/#join", active: false },
];

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-surface-primary border-b border-border-subtle">
      <div className="max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-20 flex items-center justify-between h-16">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <svg
            className="w-8 h-8 text-accent-primary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 8V4H8" />
            <rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M2 14h2" />
            <path d="M20 14h2" />
            <path d="M15 13v2" />
            <path d="M9 13v2" />
          </svg>
          <span className="font-display text-fg-primary text-2xl">
            TARS-Go
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`text-[15px] font-medium transition-colors ${
                link.active
                  ? "text-accent-primary"
                  : "text-fg-primary hover:text-accent-primary"
              }`}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Auth buttons */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            to="/login"
            className="px-5 py-2 text-sm font-medium text-accent-primary border-[1.5px] border-accent-primary rounded-full transition-colors hover:bg-accent-primary/10"
          >
            登录
          </Link>
          <Link
            to="/register"
            className="px-5 py-2 text-sm font-medium text-fg-inverse bg-accent-primary rounded-full transition-colors hover:bg-accent-primary/90"
          >
            注册
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          className="md:hidden p-2 text-fg-muted hover:text-fg-primary"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            {menuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden px-6 pb-4 border-t border-border-subtle pt-4">
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                  link.active
                    ? "text-accent-primary"
                    : "text-fg-primary hover:text-accent-primary hover:bg-white/5"
                }`}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
          </div>
          <div className="flex gap-3 mt-4 px-3">
            <Link
              to="/login"
              className="flex-1 text-center px-4 py-2 text-sm font-medium text-accent-primary border-[1.5px] border-accent-primary rounded-full"
              onClick={() => setMenuOpen(false)}
            >
              登录
            </Link>
            <Link
              to="/register"
              className="flex-1 text-center px-4 py-2 text-sm font-medium text-fg-inverse bg-accent-primary rounded-full"
              onClick={() => setMenuOpen(false)}
            >
              注册
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
