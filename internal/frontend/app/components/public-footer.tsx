import { Link } from "react-router";
import { FooterCoordinateSandTrace } from "~/components/footer-coordinate-sand-trace";
import { SiteLogo } from "~/components/site-logo";

export function PublicFooter({ compactMobile = false }: { compactMobile?: boolean } = {}) {
  return (
    <footer className={`public-site-footer border-t border-[var(--theme-border-subtle)] py-6 sm:py-8${compactMobile ? " public-site-footer--compact" : ""}`}>
      <div className="public-home-container">
        <div className="public-footer-main flex flex-col gap-5 border-b border-[var(--theme-border-subtle)] pb-5 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" aria-label="TARSGO 首页" className="inline-flex self-start sm:self-auto focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-primary">
            <SiteLogo className="h-10 max-w-[180px]" />
          </Link>
          <nav aria-label="官方社交账号" className="flex flex-wrap gap-2">
            <a
              href="https://www.douyin.com/user/MS4wLjABAAAAZJcCtp6uwKt4wKUwa_STi1GadztAmwBwHKN0jjjDj2MNjgOclLsim387ZDtRPjvW"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-social-link"
            >
              <DouyinIcon />
              抖音
            </a>
            <a
              href="https://space.bilibili.com/488284486"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-social-link"
            >
              <BilibiliIcon />
              B站
            </a>
          </nav>
        </div>

        <div className="public-footer-signature">
          <p className="text-xs text-fg-dim">
            &copy; {new Date().getFullYear()} TARSGO 战队 · 吉林大学吉甲大师双创基地
          </p>
          <FooterCoordinateSandTrace />
        </div>
      </div>
    </footer>
  );
}

function DouyinIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-current">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

function BilibiliIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 fill-current">
      <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.658.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.391.129-.707.4-.96.249-.249.56-.373.933-.373z" />
    </svg>
  );
}
