import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";

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
  open?: boolean;
  onClose: () => void;
  children: ReactNode;
  widthClass?: string;
  roundedClassName?: string;
};

export function ModalShell({
  title,
  description,
  open = true,
  onClose,
  children,
  widthClass = "max-w-2xl",
  roundedClassName = "rounded-xl",
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

  return (
    <div
      className="motion-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      data-state={open ? "open" : "closed"}
      onMouseDown={handleOverlayMouseDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`motion-dialog motion-dialog-surface w-full ${widthClass} ${roundedClassName} border border-gray-800 bg-gray-900 shadow-2xl`}
        data-state={open ? "open" : "closed"}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-800 px-6 py-5">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-white">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm text-gray-400">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="motion-button rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/5"
          >
            关闭
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
