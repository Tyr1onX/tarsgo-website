import type { CollectionField, CollectionOption } from "~/lib/collection-forms-client";

function ChoiceContent({ option }: { option: CollectionOption }) {
  return <>
    <span className="min-w-0 flex-1 break-words">
      <span className="block whitespace-pre-wrap">{option.label}</span>
      {option.description && <span className="mt-1 block whitespace-pre-wrap text-sm text-fg-muted">{option.description}</span>}
    </span>
    {option.remaining != null && <span className="shrink-0 whitespace-nowrap text-sm text-fg-muted">
      {option.remaining === 0 ? "已满" : `余 ${option.remaining}`}
    </span>}
  </>;
}

export function CollectionFormFields({ fields, answers, onAnswer, disabled = false }: {
  fields: CollectionField[];
  answers: Record<string, unknown>;
  onAnswer: (field: CollectionField, value: unknown) => void;
  disabled?: boolean;
}) {
  return <div className="space-y-4">
    {fields.map((field) => {
      const selected = answers[field.key];
      return <fieldset className="space-y-2 rounded-xl border border-border-subtle p-4" key={field.key} disabled={disabled}>
        <legend className="px-1 font-medium">{field.label}{field.required && <span className="ml-1 text-red-500">*</span>}</legend>
        {(field.type === "text" || field.type === "number" || field.type === "date") &&
          <input className="w-full rounded-lg border border-border-subtle bg-transparent px-3 py-2"
            type={field.type} required={field.required} maxLength={field.type === "text" ? 500 : undefined}
            value={typeof selected === "string" || typeof selected === "number" ? selected : ""}
            onChange={(e) => onAnswer(field, field.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)} />}
        {field.type === "textarea" && <textarea className="min-h-28 w-full rounded-lg border border-border-subtle bg-transparent px-3 py-2"
          required={field.required} maxLength={5000} value={typeof selected === "string" ? selected : ""}
          onChange={(e) => onAnswer(field, e.target.value)} />}
        {field.type === "select" &&
          <select className="w-full rounded-lg border border-border-subtle bg-transparent px-3 py-2" required={field.required}
            value={typeof selected === "string" ? selected : ""} onChange={(e) => onAnswer(field, e.target.value)}>
            <option value="">请选择</option>
            {field.options?.map((option) => <option key={option.value} value={option.value} disabled={option.remaining === 0}>
              {option.label}{option.remaining === 0 ? "（已满）" : option.remaining != null ? `（剩余 ${option.remaining}）` : ""}
            </option>)}
          </select>}
        {field.type === "radio" && <div className="grid gap-2">
          {field.options?.map((option) => <label key={option.value}
            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 ${option.remaining === 0
              ? "cursor-not-allowed border-border-subtle opacity-55"
              : selected === option.value ? "border-accent-primary bg-accent-primary/5" : "border-border-subtle"}`}>
            <input className="mt-1 shrink-0" type="radio" name={field.key} required={field.required}
              value={option.value} checked={selected === option.value} disabled={option.remaining === 0}
              onChange={() => onAnswer(field, option.value)} />
            <ChoiceContent option={option} />
          </label>)}
        </div>}
        {field.type === "checkbox" && <div className="grid gap-2">
          {field.options?.map((option) => {
            const values = Array.isArray(selected) ? selected as string[] : [];
            return <label key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 ${option.remaining === 0
                ? "cursor-not-allowed border-border-subtle opacity-55"
                : values.includes(option.value) ? "border-accent-primary bg-accent-primary/5" : "border-border-subtle"}`}>
              <input className="mt-1 shrink-0" type="checkbox" checked={values.includes(option.value)}
                disabled={option.remaining === 0}
                onChange={(e) => onAnswer(field, e.target.checked ? [...values, option.value] : values.filter((value) => value !== option.value))} />
              <ChoiceContent option={option} />
            </label>;
          })}
          {field.required && (!Array.isArray(selected) || selected.length === 0) && <span className="text-xs text-fg-muted">至少选择一项</span>}
        </div>}
      </fieldset>;
    })}
  </div>;
}
