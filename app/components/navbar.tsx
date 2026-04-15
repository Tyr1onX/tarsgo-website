import { Link } from "react-router";
import { useState } from "react";

const navLinks = [
  { label: "首页", href: "/#hero" },
  { label: "关于我们", href: "/#about" },
  { label: "机器人", href: "/#robots" },
  { label: "荣誉成就", href: "/#achievements" },
  { label: "团队架构", href: "/#team" },
];

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            to="/"
            className="motion-button flex items-center gap-3 shrink-0"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500 shadow-lg shadow-primary-500/20">
              <span className="text-white font-bold text-sm">T</span>
            </div>
            <span className="text-white font-bold text-lg tracking-wide">
              TARS-GO
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="motion-button motion-nav-link rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Auth buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/login"
              className="motion-button px-4 py-2 text-sm text-gray-300 hover:text-white"
            >
              登录
            </Link>
            <Link
              to="/register"
              className="motion-button rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
            >
              注册
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            className="motion-button md:hidden rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-white"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <svg
              className={`h-6 w-6 transition-transform duration-300 ease-out ${
                menuOpen ? "rotate-90" : "rotate-0"
              }`}
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
          <div className="motion-fade-down mt-2 border-t border-gray-800 pb-4 pt-4 md:hidden">
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="motion-button rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white"
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </a>
              ))}
            </div>
            <div className="flex gap-3 mt-4 px-3">
              <Link
                to="/login"
                className="motion-button flex-1 rounded-lg border border-gray-700 px-4 py-2 text-center text-sm text-gray-300 hover:bg-white/5"
                onClick={() => setMenuOpen(false)}
              >
                登录
              </Link>
              <Link
                to="/register"
                className="motion-button flex-1 rounded-lg bg-primary-500 px-4 py-2 text-center text-sm font-medium text-white hover:bg-primary-600"
                onClick={() => setMenuOpen(false)}
              >
                注册
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
