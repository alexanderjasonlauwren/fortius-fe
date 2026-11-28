/**
 * A number field that reads like the client's books (partner doc C9): while
 * typing it takes digits and one dot, on blur it shows `11,584.46`. The value
 * is always a number; formatting is display only.
 *
 * Not `type="number"`: that keeps leading zeros (`0560`), cannot show
 * thousands separators, and changes on a scrolled wheel.
 */
import { forwardRef, useState } from "react";
import { TextInput } from "@/components/common/Field";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { draftOf, parseNumberDraft, sanitizeNumberDraft } from "@/lib/numberInput";

type NumberInputProps = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "defaultValue"> & {
  value: number;
  onValueChange: (value: number) => void;
  /** Decimal places accepted and shown; 0 for a count of tabung. Default 2. */
  decimals?: number;
  invalid?: boolean;
};

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onValueChange, decimals = 2, onFocus, onBlur, className, ...props }, ref) => {
    const [draft, setDraft] = useState<string | null>(null);
    const shown = draft ?? (value === 0 && props.placeholder ? "" : formatNumber(value, { maximumFractionDigits: decimals }));
    return (
      <TextInput
        ref={ref}
        {...props}
        type="text"
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        autoComplete="off"
        mono
        className={cn("text-right", className)}
        value={shown}
        onFocus={(e) => {
          setDraft(draftOf(value));
          onFocus?.(e);
        }}
        onChange={(e) => {
          const next = sanitizeNumberDraft(e.target.value, decimals);
          setDraft(next);
          onValueChange(parseNumberDraft(next));
        }}
        onBlur={(e) => {
          setDraft(null);
          onBlur?.(e);
        }}
      />
    );
  },
);
NumberInput.displayName = "NumberInput";
