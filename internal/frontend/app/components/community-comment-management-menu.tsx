import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { CommunityIcon } from "~/components/community-icons";

export function CommunityCommentManagementMenu({
  canManageSolution,
  acceptedSolution,
  onToggleSolution,
  canManageFeatured,
  featured,
  onToggleFeatured,
  busy = false,
}: {
  canManageSolution: boolean;
  acceptedSolution: boolean;
  onToggleSolution?: () => void;
  canManageFeatured: boolean;
  featured: boolean;
  onToggleFeatured?: () => void;
  busy?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const hasActions = (canManageSolution && Boolean(onToggleSolution)) || (canManageFeatured && Boolean(onToggleFeatured));

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  if (!hasActions) return null;

  function focusMenuItem(position: "first" | "last" | "next" | "previous", current?: HTMLElement) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (items.length === 0) return;
    const currentIndex = current ? items.indexOf(current as HTMLButtonElement) : -1;
    const targetIndex = position === "first" ? 0
      : position === "last" ? items.length - 1
        : position === "next" ? (currentIndex + 1 + items.length) % items.length
          : currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
    items[targetIndex]?.focus();
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusMenuItem(event.key === "Home" ? "first" : event.key === "End" ? "last" : event.key === "ArrowDown" ? "next" : "previous", event.target as HTMLElement);
    }
  }

  function openMenu() {
    setOpen(true);
    requestAnimationFrame(() => focusMenuItem("first"));
  }

  return <div className="community-post-menu community-comment-management-menu" ref={rootRef} onBlur={() => window.requestAnimationFrame(() => {
    if (!rootRef.current?.contains(document.activeElement)) setOpen(false);
  })}>
    <button
      ref={triggerRef}
      type="button"
      className="community-post-menu__trigger"
      aria-label="更多回复管理操作"
      aria-haspopup="menu"
      aria-expanded={open}
      disabled={busy}
      onClick={() => open ? setOpen(false) : openMenu()}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" && !open) {
          event.preventDefault();
          openMenu();
        }
      }}
    ><CommunityIcon name="moreVertical" /></button>
    {open ? <div className="community-post-menu__items" role="menu" aria-label="回复管理操作" ref={menuRef} onKeyDown={handleMenuKeyDown}>
      {canManageSolution && onToggleSolution ? <button type="button" role="menuitemcheckbox" aria-checked={acceptedSolution} disabled={busy} onClick={() => { setOpen(false); onToggleSolution(); }}>
        <CommunityIcon name="check" />{acceptedSolution ? "取消最佳答案" : "设为最佳答案"}
      </button> : null}
      {canManageFeatured && onToggleFeatured ? <button type="button" role="menuitemcheckbox" aria-checked={featured} disabled={busy} onClick={() => { setOpen(false); onToggleFeatured(); }}>
        <CommunityIcon name="star" />{featured ? "取消精华" : "设为精华"}
      </button> : null}
    </div> : null}
  </div>;
}
