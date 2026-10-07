import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type AnimatedSelectOption = {
  value: string | number;
  label: string;
  disabled?: boolean;
};

type AnimatedSelectProps = {
  id?: string;
  ariaLabel?: string;
  value: string | number;
  onChange: (value: string) => void;
  options: AnimatedSelectOption[];
  disabled?: boolean;
  placeholder?: string;
  size?: "default" | "compact";
  fitContent?: boolean;
};

const PANEL_EXIT_DURATION_MS = 180;

export function AnimatedSelect({
  id,
  ariaLabel,
  value,
  onChange,
  options,
  disabled = false,
  placeholder = "请选择",
  size = "default",
  fitContent = false,
}: AnimatedSelectProps) {
  const generatedId = useId();
  const triggerId = id ?? `animated-select-${generatedId}`;
  const listboxId = `${triggerId}-listbox`;
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [open, setOpen] = useState(false);
  const [panelMounted, setPanelMounted] = useState(false);
  const [panelState, setPanelState] = useState<"open" | "closed">("closed");
  const [panelStyle, setPanelStyle] = useState<{
    top: number;
    left: number;
    width: number;
  }>({
    top: 0,
    left: 0,
    width: 0,
  });

  const normalizedValue = String(value ?? "");
  const selectedOption = useMemo(
    () => options.find((option) => String(option.value) === normalizedValue) ?? null,
    [normalizedValue, options],
  );
  const enabledValues = useMemo(
    () => options.filter((option) => !option.disabled).map((option) => String(option.value)),
    [options],
  );

  const triggerSizeClass =
    size === "compact"
      ? "min-h-[34px] rounded-xl px-3 py-1.5 text-sm"
      : "min-h-[46px] rounded-xl px-3 py-2.5 text-sm";
  const panelSizeClass = size === "compact" ? "p-1.5" : "p-2";
  const optionSizeClass = size === "compact" ? "px-3 py-2 text-sm" : "px-3 py-2.5 text-sm";
  const triggerWidthClass = fitContent ? "w-auto min-w-[88px]" : "w-full";
  const triggerLabelClass = fitContent ? "whitespace-nowrap" : "min-w-0 flex-1 truncate";
  const optionLabelClass = fitContent ? "whitespace-nowrap" : "min-w-0 flex-1 truncate";

  function updatePanelPosition() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    setPanelStyle({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  }

  useLayoutEffect(() => {
    if (!panelMounted) {
      return;
    }

    updatePanelPosition();
  }, [open, panelMounted, options.length, size]);

  useEffect(() => {
    if (!open) {
      setPanelState("closed");
      const timer = window.setTimeout(() => {
        setPanelMounted(false);
      }, PANEL_EXIT_DURATION_MS);
      return () => window.clearTimeout(timer);
    }

    setPanelMounted(true);
    updatePanelPosition();
    const frame = window.requestAnimationFrame(() => {
      setPanelState("open");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleWindowChange = () => updatePanelPosition();
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [open]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (!open || !panelMounted) {
      return;
    }

    const preferredKey = enabledValues.includes(normalizedValue)
      ? normalizedValue
      : enabledValues[0];
    if (preferredKey) {
      optionRefs.current[preferredKey]?.focus();
    }
  }, [enabledValues, normalizedValue, open, panelMounted]);

  function closePanel() {
    setOpen(false);
  }

  function commitValue(nextValue: string) {
    onChange(nextValue);
    closePanel();
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  }

  function focusRelativeOption(currentValue: string, offset: number) {
    if (enabledValues.length === 0) {
      return;
    }

    const currentIndex = enabledValues.indexOf(currentValue);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = Math.min(
      Math.max(safeIndex + offset, 0),
      Math.max(enabledValues.length - 1, 0),
    );
    optionRefs.current[enabledValues[nextIndex]]?.focus();
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  }

  const triggerLabel = selectedOption?.label ?? placeholder;

  return (
    <div ref={wrapperRef} className={`motion-select-shell ${fitContent ? "w-auto flex-none" : ""}`}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-controls={panelMounted ? listboxId : undefined}
        aria-expanded={open}
        disabled={disabled}
        data-open={open ? "true" : "false"}
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
        onKeyDown={handleTriggerKeyDown}
        className={`motion-select-trigger motion-field flex items-center justify-between gap-3 border border-white/[0.08] bg-black/30 text-left text-white backdrop-blur focus:border-primary-400/60 focus:outline-none focus:ring-2 focus:ring-primary-400/30 ${triggerWidthClass} ${triggerSizeClass} ${
          disabled ? "cursor-not-allowed opacity-60" : ""
        }`}
      >
        <span className={triggerLabelClass}>{triggerLabel}</span>
        <span className="motion-select-chevron shrink-0 text-gray-400" aria-hidden="true">
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none">
            <path
              d="M5 7.5 10 12.5 15 7.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {panelMounted && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className="admin-design motion-select-panel"
              data-state={panelState}
              style={{
                top: `${panelStyle.top}px`,
                left: `${panelStyle.left}px`,
                ...(fitContent
                  ? {
                      minWidth: `${panelStyle.width}px`,
                      maxWidth: "calc(100vw - 2rem)",
                    }
                  : {
                      width: `${panelStyle.width}px`,
                    }),
              }}
            >
              <div
                id={listboxId}
                role="listbox"
                aria-label={ariaLabel}
                className={`glass-panel glass-panel-strong max-h-72 overflow-y-auto rounded-2xl shadow-2xl shadow-black/40 ${
                  fitContent ? "inline-block w-max min-w-full" : "w-full"
                } ${panelSizeClass}`}
              >
                {options.map((option) => {
                  const optionKey = String(option.value);
                  const selected = optionKey === normalizedValue;

                  return (
                    <button
                      key={optionKey}
                      ref={(node) => {
                        optionRefs.current[optionKey] = node;
                      }}
                      type="button"
                      role="option"
                      disabled={option.disabled}
                      aria-selected={selected}
                      data-selected={selected ? "true" : "false"}
                      onClick={() => commitValue(optionKey)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          focusRelativeOption(optionKey, 1);
                        }

                        if (event.key === "ArrowUp") {
                          event.preventDefault();
                          focusRelativeOption(optionKey, -1);
                        }

                        if (event.key === "Home") {
                          event.preventDefault();
                          const firstValue = enabledValues[0];
                          if (firstValue) {
                            optionRefs.current[firstValue]?.focus();
                          }
                        }

                        if (event.key === "End") {
                          event.preventDefault();
                          const lastValue = enabledValues[enabledValues.length - 1];
                          if (lastValue) {
                            optionRefs.current[lastValue]?.focus();
                          }
                        }

                        if (event.key === "Escape") {
                          event.preventDefault();
                          closePanel();
                          triggerRef.current?.focus();
                        }
                      }}
                      className={`motion-select-option flex w-full items-center justify-between gap-3 rounded-xl text-left text-gray-100 ${optionSizeClass} ${
                        option.disabled ? "cursor-not-allowed opacity-45" : ""
                      }`}
                    >
                      <span className={optionLabelClass}>{option.label}</span>
                      <span
                        className={`text-primary-300 transition-opacity duration-150 ${
                          selected ? "opacity-100" : "opacity-0"
                        }`}
                        aria-hidden="true"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none">
                          <path
                            d="M5 10.5 8.5 14 15 7.5"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
