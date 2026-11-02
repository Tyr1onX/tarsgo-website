import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { CommunityIcon } from "~/components/community-icons";

export function CommunityReplyFeatureMenu({
  featured,
  busy = false,
  onToggle,
}: {
  featured: boolean;
  busy?: boolean;
  onToggle?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!onToggle) return null;

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }

  return <div className="community-post-menu community-reply-feature-menu" ref={rootRef} onBlur={() => window.requestAnimationFrame(() => {
    if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
  })}>
    <button
      ref={triggerRef}
      type="button"
      className="community-post-menu__trigger"
      aria-label="更多回复操作"
      aria-haspopup="menu"
      aria-expanded={open}
      disabled={busy}
      onClick={() => setOpen((value) => !value)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" && !open) {
          event.preventDefault();
          setOpen(true);
          requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
        }
      }}
    ><CommunityIcon name="moreVertical" /></button>
    {open ? <div className="community-post-menu__items" role="menu" aria-label="回复操作" ref={menuRef} onKeyDown={handleMenuKeyDown}>
      <button type="button" role="menuitem" disabled={busy} aria-pressed={featured} onClick={() => { setOpen(false); onToggle(); }}>
        <CommunityIcon name="star" />{featured ? "取消精华回复" : "设为精华回复"}
      </button>
    </div> : null}
  </div>;
}
