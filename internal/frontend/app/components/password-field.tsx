import { useState } from "react";

type PasswordFieldProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  minLength?: number;
  maxLength?: number;
};

export function PasswordField({ id, value, onChange, autoComplete, placeholder, minLength, maxLength }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        required
        minLength={minLength}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="auth-input"
        style={{ paddingRight: "3.25rem" }}
      />
      <button
        type="button"
        className="absolute inset-y-0 right-2 flex items-center rounded-md px-2 text-[var(--admin-muted)] hover:text-[var(--admin-text)] focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-label={visible ? "隐藏密码" : "显示密码"}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible ? <path d="M3 3l18 18" /> : null}
        </svg>
      </button>
    </div>
  );
}
