import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export const MODAL_TRANSITION_MS = 260;

export function useModalPresence(open: boolean, duration = MODAL_TRANSITION_MS) {
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) {
      setVisible(true);
      return;
    }

    if (!visible) {
      return;
    }

    const timer = window.setTimeout(() => {
      setVisible(false);
    }, duration);

    return () => window.clearTimeout(timer);
  }, [duration, open, visible]);

  return visible;
}

export function useModalPresenceValue<T>(
  value: T | null | undefined,
  duration = MODAL_TRANSITION_MS,
) {
  const [visibleValue, setVisibleValue] = useState<T | null>(value ?? null);

  useEffect(() => {
    if (value != null) {
      setVisibleValue(value);
      return;
    }

    if (visibleValue == null) {
      return;
    }

    const timer = window.setTimeout(() => {
      setVisibleValue(null);
    }, duration);

    return () => window.clearTimeout(timer);
  }, [duration, value, visibleValue]);

  return visibleValue;
}

type ModalShellProps = {
  title: string;
  description?: string;
  headerAccent?: ReactNode;
  open?: boolean;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
  roundedClassName?: string;
  panelClassName?: string;
  bodyClassName?: string;
  footer?: ReactNode;
  footerClassName?: string;
  backdropClassName?: string;
  zIndexClass?: string;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useModalAccessibility(
  open: boolean,
  containerRef: { current: HTMLElement | null },
  onClose: () => void,
) {
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const container = containerRef.current;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    container?.focus({ preventScroll: true });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !container) {
        return;
      }

      const focusableElements = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);

      if (focusableElements.length === 0) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (!container.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (activeElement === first || activeElement === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [containerRef, open]);
}

export function ModalShell({
  title,
  description,
  headerAccent,
  open = true,
  onClose,
  children,
  widthClass = "max-w-2xl",
  roundedClassName = "rounded-2xl",
  panelClassName = "admin-modal-panel",
  bodyClassName = "px-6 py-5",
  footer,
  footerClassName = "",
  backdropClassName = "bg-black/60",
  zIndexClass = "z-[70]",
}: ModalShellProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);

  useModalAccessibility(open, panelRef, onClose);

  function handleOverlayPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className={`admin-design motion-overlay fixed inset-0 ${zIndexClass} flex items-center justify-center overflow-y-auto overscroll-contain ${backdropClassName} p-3 sm:p-4`}
      data-state={open ? "open" : "closed"}
      aria-hidden={!open}
      inert={!open}
      onPointerDown={handleOverlayPointerDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`modal-shell-panel motion-dialog motion-dialog-surface w-full ${widthClass} ${roundedClassName} ${panelClassName}`}
        data-state={open ? "open" : "closed"}
      >
        <div className="modal-shell-header flex items-start justify-between gap-4 border-b border-[var(--admin-border-subtle)] px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex min-w-0 items-start gap-3">
            {headerAccent ? <div className="shrink-0">{headerAccent}</div> : null}
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold text-[var(--admin-text)]">
                {title}
              </h2>
              {description ? <p id={descriptionId} className="mt-1 text-sm text-[var(--admin-muted)]">{description}</p> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭弹窗"
            className="admin-button admin-button--secondary admin-button--small"
          >
            关闭
          </button>
        </div>
        <div className={`modal-shell-body ${bodyClassName}`}>{children}</div>
        {footer ? (
          <div className={`modal-shell-footer border-t border-[var(--admin-border-subtle)] px-4 py-4 sm:px-6 ${footerClassName}`}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
