import { forwardRef, useId, useRef, useState, type ReactNode } from "react";
import { FileText, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONTROL } from "./controlStyles";
import { DateInput, MonthInput } from "./DateInput";

export { SelectInput } from "./SelectInput";

/**
 * Form controls for the console.
 *
 * A label labels, a hint demonstrates, an error says what to fix — each element
 * does exactly one job. Inputs are underlined on a sunk surface rather than
 * boxed, so a dense form reads as a filled-in sheet.
 */

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="label mb-1.5 block text-2xs text-ink-muted"
        >
          {label}
          {required && <span className="ml-1 text-rust-ink">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-rust-ink">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>
      )}
    </div>
  );
}

export const TextInput = forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & { invalid?: boolean; mono?: boolean }
>(({ className, invalid, mono, type, ...props }, ref) => {
  // The browser's date and month popups ignore the theme; these types get the
  // console's own calendar with the same value format and onChange contract.
  if (type === "date" || type === "month") {
    const Picker = type === "date" ? DateInput : MonthInput;
    return <Picker ref={ref} className={className} invalid={invalid} mono={mono} {...props} />;
  }
  return (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL,
        mono && "data",
        invalid && "border-rust focus:border-rust",
        className,
      )}
      {...props}
    />
  );
});
TextInput.displayName = "TextInput";

export const TextareaInput = forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea"> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      CONTROL,
      "min-h-[5rem] resize-y leading-relaxed",
      invalid && "border-rust focus:border-rust",
      className,
    )}
    {...props}
  />
));
TextareaInput.displayName = "TextareaInput";

/** On/off with the reason for it stated next to the control. */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{description}</p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50",
          checked ? "bg-signal" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-panel shadow-sm transition-transform duration-200 ease-desk",
            checked ? "translate-x-[1.125rem]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

/** Drag-and-drop file picker with a keyboard-reachable fallback. */
export function FileDrop({
  file,
  onFile,
  accept = "application/pdf",
  hint = "PDF, maksimal 10 MB",
  label = "Letakkan berkas di sini atau pilih dari komputer",
  disabled,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  accept?: string;
  hint?: string;
  label?: string;
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const accepts = (candidate: File) =>
    accept
      .split(",")
      .map((a) => a.trim())
      .some((a) =>
        a.startsWith(".")
          ? candidate.name.toLowerCase().endsWith(a.toLowerCase())
          : a.endsWith("/*")
            ? candidate.type.startsWith(a.slice(0, -1))
            : candidate.type === a,
      );

  const take = (candidate?: File) => {
    if (!candidate) return;
    if (!accepts(candidate)) {
      setRejected(`${candidate.name} bukan format yang diterima. Gunakan ${hint}.`);
      return;
    }
    setRejected(null);
    onFile(candidate);
  };

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-sm border border-line bg-panel-sunk px-3 py-2.5">
        <FileText className="h-4 w-4 shrink-0 text-ink-muted" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{file.name}</p>
          <p className="data text-2xs text-ink-muted">
            {(file.size / 1024).toLocaleString("id-ID", { maximumFractionDigits: 0 })} KB
          </p>
        </div>
        <button
          type="button"
          onClick={() => onFile(null)}
          aria-label={`Hapus ${file.name}`}
          className="rounded p-1 text-ink-muted transition-colors hover:bg-panel-raised hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-sm border border-dashed px-4 py-6 text-center transition-colors",
          dragging
            ? "border-signal bg-signal-soft"
            : "border-line-strong bg-panel-sunk hover:border-ink-muted",
          disabled && "pointer-events-none opacity-55",
        )}
      >
        <Upload className="h-5 w-5 text-ink-muted" strokeWidth={1.75} />
        <span className="text-xs font-medium text-ink">{label}</span>
        <span className="text-2xs text-ink-muted">{hint}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => take(e.target.files?.[0])}
      />
      {rejected && <p className="mt-1.5 text-xs font-medium text-rust-ink">{rejected}</p>}
    </>
  );
}

/** Segmented filter used above tables. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string; count?: number }[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-md border border-line bg-panel-sunk p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            // Not a submit button: segmented choices sit inside forms, where
            // a typeless button submits the form on every click.
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-sm px-3 py-1.5 text-xs font-semibold transition-colors",
              active
                ? "bg-ink text-ink-on"
                : "text-ink-muted hover:bg-panel-raised hover:text-ink",
            )}
          >
            {option.label}
            {option.count != null && (
              <span
                className={cn(
                  "data ml-1.5",
                  active ? "text-ink-on/70" : "text-ink-muted",
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Search box shaped like the rest of the controls. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Cari…",
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(CONTROL, "pr-8")}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Bersihkan pencarian"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted transition-colors hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
