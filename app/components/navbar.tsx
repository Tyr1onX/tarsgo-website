import { useEffect, useState } from "react";
import { Link } from "react-router";

const navLinks = [
  { label: "首页", href: "/#hero", active: true },
  { label: "关于我们", href: "/#about", active: false },
  { label: "团队历程", href: "/#achievements", active: false },
  { label: "机器人展示", href: "/#robots", active: false },
  { label: "成就展示", href: "/#certificates", active: false },
  { label: "加入我们", href: "/#join", active: false },
];

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 24);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <nav className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div
        className={`pointer-events-auto w-full overflow-hidden border-b transition-all duration-300 ${
          isScrolled
            ? "border-white/10 bg-surface-primary/88 shadow-[0_20px_60px_-30px_rgba(2,6,23,0.9)] backdrop-blur-2xl"
            : "border-white/12 bg-black/28 shadow-[0_24px_70px_-38px_rgba(2,6,23,0.85)] backdrop-blur-xl"
        }`}
      >
        <div className="mx-auto flex h-[68px] max-w-[1440px] items-center justify-between px-6 sm:px-10 lg:px-20">
          <Link
            to="/"
            aria-label="TARS-GO 首页"
            className="motion-button flex shrink-0 items-center"
          >
            <img
              src="/assets/images/Logo/TARS-GO.png"
              alt="TARS-GO"
              className="h-[48px] w-auto object-contain sm:h-[54px]"
            />
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`motion-nav-link text-base font-semibold transition-colors ${
                  link.active
                    ? "text-accent-primary"
                    : "text-fg-primary hover:text-accent-primary"
                }`}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              to="/login"
              className="motion-button rounded-full border border-white/16 bg-white/4 px-5 py-2 text-[15px] font-semibold text-fg-primary transition-colors hover:bg-white/10"
            >
              登录
            </Link>
            <Link
              to="/register"
              className="motion-button rounded-full bg-accent-primary px-5 py-2 text-[15px] font-semibold text-fg-inverse shadow-[0_18px_40px_-24px_rgba(0,98,255,0.85)] transition-colors hover:bg-accent-primary/90"
            >
              注册
            </Link>
          </div>

          <button
            type="button"
            className="motion-button p-2 text-fg-muted hover:text-fg-primary md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            <svg
              className="h-6 w-6"
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

        {menuOpen && (
          <div className="motion-fade-down border-t border-white/10 px-6 pb-5 pt-4 md:hidden sm:px-10">
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className={`motion-button motion-nav-link rounded-2xl px-3 py-3 text-base font-semibold transition-colors ${
                    link.active
                      ? "bg-white/6 text-accent-primary"
                      : "text-fg-primary hover:bg-white/5 hover:text-accent-primary"
                  }`}
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </a>
              ))}
            </div>
            <div className="mt-4 flex gap-3">
              <Link
                to="/login"
                className="motion-button flex-1 rounded-full border border-white/16 bg-white/4 px-4 py-2 text-center text-[15px] font-semibold text-fg-primary"
                onClick={() => setMenuOpen(false)}
              >
                登录
              </Link>
              <Link
                to="/register"
                className="motion-button flex-1 rounded-full bg-accent-primary px-4 py-2 text-center text-[15px] font-semibold text-fg-inverse"
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
