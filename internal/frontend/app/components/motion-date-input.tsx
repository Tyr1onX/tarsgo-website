import { type ComponentPropsWithoutRef } from "react";

type MotionDateInputProps = Omit<ComponentPropsWithoutRef<"input">, "type"> & {
  type?: "date" | "datetime-local";
};

export function MotionDateInput({
  type = "date",
  disabled = false,
  className,
  ...props
}: MotionDateInputProps) {
  const baseClassName =
    className ??
    `motion-field w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none ${
      disabled ? "cursor-not-allowed opacity-60" : ""
    }`;

  return (
    <input
      {...props}
      type={type}
      disabled={disabled}
      className={`${baseClassName} motion-date`}
    />
  );
}
