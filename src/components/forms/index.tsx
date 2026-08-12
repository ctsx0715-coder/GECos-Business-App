"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * The shared form kit.
 *
 * Nine creation forms across four modules, so the pattern is defined once:
 * the server action validates with the same Zod schema the service uses,
 * returns field-level errors, and the form shows them against the field that
 * caused them. Nothing here decides what is valid — that lives in the schema,
 * which the service parses again regardless of what this form sent.
 */

export interface FormResult {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  /** Where to send the user on success. */
  redirectTo?: string;
}

export function useFormAction(onSuccess?: (result: FormResult) => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function submit(fn: () => Promise<FormResult>) {
    setMessage(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setMessage(result.message ?? "Check the highlighted fields.");
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      onSuccess?.(result);
      if (result.redirectTo) router.push(result.redirectTo);
      else router.refresh();
    });
  }

  return { pending, message, fieldErrors, submit };
}

const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent disabled:opacity-60";

export function FormField({
  label,
  name,
  hint,
  required,
  errors,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  required?: boolean;
  errors?: Record<string, string[]>;
  children: ReactNode;
}) {
  const fieldErrors = errors?.[name];
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
      {hint && !fieldErrors && (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      )}
      {fieldErrors && (
        <span className="mt-1 block text-xs font-medium text-danger">
          {fieldErrors[0]}
        </span>
      )}
    </label>
  );
}

export function TextField(props: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  errors?: Record<string, string[]>;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  multiline?: boolean;
  type?: "text" | "email" | "tel" | "date";
}) {
  const { label, name, value, onChange, errors, hint, required } = props;
  return (
    <FormField
      label={label}
      name={name}
      hint={hint}
      required={required}
      errors={errors}
    >
      {props.multiline ? (
        <textarea
          value={value}
          rows={3}
          placeholder={props.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        />
      ) : (
        <input
          type={props.type ?? "text"}
          value={value}
          placeholder={props.placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        />
      )}
    </FormField>
  );
}

/**
 * Money in rands.
 *
 * Kept as a string in the form so a half-typed "1 2" does not become NaN, and
 * converted once on submit. Storage is integer cents; the schema does that
 * conversion so no component has to know about it.
 */
export function MoneyField(props: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  errors?: Record<string, string[]>;
  hint?: string;
}) {
  return (
    <FormField
      label={props.label}
      name={props.name}
      hint={props.hint ?? "In rands"}
      errors={props.errors}
    >
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
          R
        </span>
        <input
          inputMode="decimal"
          value={props.value}
          onChange={(event) =>
            props.onChange(event.target.value.replace(/[^\d.]/g, ""))
          }
          className={`${inputClass} pl-7`}
          placeholder="0"
        />
      </div>
    </FormField>
  );
}

export function SelectField(props: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  errors?: Record<string, string[]>;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <FormField
      label={props.label}
      name={props.name}
      hint={props.hint}
      required={props.required}
      errors={props.errors}
    >
      <select
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className={inputClass}
      >
        <option value="">{props.placeholder ?? "Choose…"}</option>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}

/** The banner for errors that belong to the form rather than one field. */
export function FormMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-lg bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
      {message}
    </div>
  );
}

export function FormActions({
  pending,
  submitLabel,
  onSubmit,
  onCancel,
  disabled,
}: {
  pending: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onCancel?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-border px-5 py-4">
      <button
        type="button"
        onClick={onSubmit}
        disabled={pending || disabled}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-surface-muted disabled:opacity-50"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

/** Two-column grid for form fields; single column on small screens. */
export function FormGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">{children}</div>
  );
}

export function FullWidth({ children }: { children: ReactNode }) {
  return <div className="sm:col-span-2">{children}</div>;
}
