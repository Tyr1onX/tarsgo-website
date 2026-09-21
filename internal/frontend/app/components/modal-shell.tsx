import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
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
  backdropClassName?: string;
  zIndexClass?: string;
};

export function ModalShell({
  title,
  description,
  headerAccent,
  open = true,
  onClose,
  children,
  widthClass = "max-w-2xl",
  roundedClassName = "rounded-2xl",
  panelClassName = "glass-panel glass-panel-strong shadow-2xl shadow-black/40",
  bodyClassName = "px-6 py-5",
  backdropClassName = "bg-black/60 backdrop-blur-sm",
  zIndexClass = "z-[70]",
}: ModalShellProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose, open]);

  function handleOverlayMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className={`motion-overlay fixed inset-0 ${zIndexClass} flex items-center justify-center ${backdropClassName} p-4`}
      data-state={open ? "open" : "closed"}
      onMouseDown={handleOverlayMouseDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`motion-dialog motion-dialog-surface w-full ${widthClass} ${roundedClassName} ${panelClassName}`}
        data-state={open ? "open" : "closed"}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-6 py-5">
          <div className="flex min-w-0 items-start gap-3">
            {headerAccent ? <div className="shrink-0">{headerAccent}</div> : null}
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold text-white">
                {title}
              </h2>
              {description ? <p className="mt-1 text-sm text-gray-400">{description}</p> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-glass rounded-xl px-3 py-1.5 text-sm text-gray-300 hover:text-white"
          >
            关闭
          </button>
        </div>
        <div className={bodyClassName}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
