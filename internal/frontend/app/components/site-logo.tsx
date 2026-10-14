export function SiteLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`site-logo ${className}`.trim()}>
      <img
        src="/assets/images/Logo/tarsgo-logo-v5.svg"
        alt="TARSGO"
        className="site-logo__image site-logo__image--dark"
      />
      <img
        src="/assets/images/Logo/tarsgo-logo-v5-light.svg"
        alt=""
        aria-hidden="true"
        className="site-logo__image site-logo__image--light"
      />
    </span>
  );
}
