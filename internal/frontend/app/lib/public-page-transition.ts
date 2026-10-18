export const PUBLIC_PAGE_TRANSITION_DURATION_MS = 200;
export const PUBLIC_PAGE_TRANSITION_OFFSET_PX = 5;

export function startPublicPageTransition(
  target: Pick<HTMLElement, "animate">,
  prefersReducedMotion: boolean,
): Animation | null {
  if (prefersReducedMotion) return null;

  return target.animate(
    [
      {
        opacity: 0,
        transform: `translate3d(0, ${PUBLIC_PAGE_TRANSITION_OFFSET_PX}px, 0)`,
      },
      { opacity: 1, transform: "translate3d(0, 0, 0)" },
    ],
    {
      duration: PUBLIC_PAGE_TRANSITION_DURATION_MS,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "both",
    },
  );
}
