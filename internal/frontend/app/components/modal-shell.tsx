import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@iconify/react";
import x from "@iconify-icons/lucide/x";

const EXIT_DURATION_MS = 200;

type ModalShellProps = {
  open: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
  zIndexClass?: string;
  closeOnBackdrop?: boolean;
  hideCloseButton?: boolean;
  headerAccent?: ReactNode;
  panelClassName?: string;
  bodyClassName?: string;
  backdropClassName?: string;
};

export function ModalShell({
  open,
  title,
  description,
  onClose,
  children,
  widthClass = "max-w-2xl",
  zIndexClass = "z-50",
  closeOnBackdrop = true,
  hideCloseButton = false,
  headerAccent,
  panelClassName = "rounded-2xl border border-border-subtle bg-surface-card shadow-2xl shadow-black/40 ring-1 ring-white/[0.05]",
  bodyClassName = "px-6 py-5",
  backdropClassName = "bg-black/70 backdrop-blur-md",
}: ModalShellProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  const snapshotRef = useRef<{
    title?: string;
    description?: string;
    children: ReactNode;
    headerAccent?: ReactNode;
  }>({ title, description, children, headerAccent });

  if (open) {
    snapshotRef.current = { title, description, children, headerAccent };
  }

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(raf);
    }
    if (!mounted) {
      return;
    }
    setVisible(false);
    const id = window.setTimeout(() => setMounted(false), EXIT_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [open, mounted]);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  const state = visible ? "open" : "closed";
  const snap = snapshotRef.current;
  const hasHeader = Boolean(snap.title || snap.description || snap.headerAccent);

  return createPortal(
    <div
      data-state={state}
      className={`modal-backdrop fixed inset-0 ${zIndexClass} flex items-center justify-center p-4 ${backdropClassName}`}
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (closeOnBackdrop) {
          onClose();
        }
      }}
    >
      <div
        data-state={state}
        className={`modal-panel w-full ${widthClass} transform-gpu overflow-hidden ${panelClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        {hasHeader ? (
          <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 py-5">
            <div className="flex items-start gap-3">
              {snap.headerAccent}
              <div>
                {snap.title ? (
                  <h2 className="text-lg font-semibold text-fg-primary">{snap.title}</h2>
                ) : null}
                {snap.description ? (
                  <p className="mt-1 text-sm text-fg-muted">{snap.description}</p>
                ) : null}
              </div>
            </div>
            {!hideCloseButton ? (
              <button
                type="button"
                onClick={onClose}
                title="关闭"
                aria-label="关闭"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-fg-dim transition hover:bg-white/5 hover:text-fg-primary"
              >
                <Icon icon={x} className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : null}
        <div className={bodyClassName}>{snap.children}</div>
      </div>
    </div>,
    document.body,
  );
}

export default ModalShell;
