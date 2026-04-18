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
    `motion-field w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 ${
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
