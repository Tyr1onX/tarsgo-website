import x from "@iconify-icons/lucide/x";
import { Icon } from "@iconify/react";
import { type ReactNode } from "react";
import { createPortal } from "react-dom";

export type NotifyTone = "success" | "error";
export type NotifyPlacement = "top-right" | "bottom-right" | "center";

export function Notify({
  tone,
  title,
  message,
  open = true,
  onClose,
  placement = "bottom-right",
}: {
  tone: NotifyTone;
  title: string;
  message: ReactNode;
  open?: boolean;
  onClose: () => void;
  placement?: NotifyPlacement;
}) {
  if (typeof document === "undefined") {
    return null;
  }

  const toneClass = tone === "success"
    ? "border-emerald-500/20 bg-gray-950/95 text-emerald-100"
    : "border-red-500/20 bg-gray-950/95 text-red-100";
  const wrapperClass = placement === "center"
    ? "pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-4"
    : `pointer-events-none fixed z-[70] w-[min(24rem,calc(100vw-2rem))] ${
      placement === "top-right"
        ? "right-4 top-4 sm:right-6 sm:top-6"
        : "bottom-4 right-4 sm:bottom-6 sm:right-6"
    }`;
  const cardWidthClass = placement === "center"
    ? "w-[min(28rem,calc(100vw-2rem))]"
    : "w-full";
  const motionClass = placement === "center"
    ? (open
      ? "translate-y-0 scale-100 opacity-100 blur-0"
      : "translate-y-3 scale-95 opacity-0 blur-sm")
    : placement === "top-right"
    ? (open
      ? "translate-x-0 translate-y-0 scale-100 opacity-100 blur-0"
      : "translate-x-3 -translate-y-3 scale-95 opacity-0 blur-sm")
    : (open
      ? "translate-x-0 translate-y-0 scale-100 opacity-100 blur-0"
      : "translate-x-3 translate-y-3 scale-95 opacity-0 blur-sm");

  return createPortal(
    <div className={wrapperClass}>
      <div
        role="status"
        aria-live="polite"
        className={`${cardWidthClass} ${open ? "pointer-events-auto" : "pointer-events-none"} transform-gpu rounded-xl border shadow-2xl backdrop-blur transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${toneClass} ${motionClass}`}
      >
        <div
          aria-hidden="true"
          className={`h-1 rounded-t-xl ${tone === "success" ? "bg-emerald-400/80" : "bg-red-400/80"}`}
        />
        {placement === "center" ? (
          <div className="relative px-5 py-4 text-center">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-white/5 hover:text-white"
              aria-label="关闭提醒"
            >
              <Icon icon={x} className="h-4 w-4" />
            </button>
            <div className="text-sm font-medium text-white">{title}</div>
            <div className="mt-2 text-sm leading-6">{message}</div>
          </div>
        ) : (
          <div className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white">{title}</div>
              <div className="mt-1 text-sm leading-6">{message}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-white/5 hover:text-white"
              aria-label="关闭提醒"
            >
              <Icon icon={x} className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
