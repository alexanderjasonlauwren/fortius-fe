import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type KeyboardEvent,
} from "react";
import { Popover } from "radix-ui";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, isoDate, startOfToday } from "@/lib/date";
import { formatDateId, formatDateLong } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CONTROL, POPOVER } from "./controlStyles";
import { assignRef, commitNativeValue } from "./nativeControl";

type Granularity = "day" | "month";
type View = "days" | "months" | "years";

interface Bounds {
  min?: string;
  max?: string;
}

// Indonesian weeks start on Monday.
const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

const monthName = (month: number, style: "long" | "short") =>
  new Date(2000, month, 1).toLocaleDateString("id-ID", { month: style });

const pad = (n: number) => String(n).padStart(2, "0");
const isoMonth = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const weekdayIndex = (date: Date) => (date.getDay() + 6) % 7;

/** Same day of month elsewhere, clamped: 31 Jan plus one month is 28 Feb, not 3 Mar. */
function shiftMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  target.setDate(Math.min(date.getDate(), daysIn(target.getFullYear(), target.getMonth())));
  return target;
}

function parseValue(value: string, granularity: Granularity): Date | null {
  const match =
    granularity === "day"
      ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
      : /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day = 1] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  // Rejects overflow such as 2026-02-31, which Date silently rolls into March.
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/**
 * ISO keys compare correctly as text at any precision, so a year ("2026") or
 * month ("2026-10") is checked against a day bound by cutting the bound to the
 * key's length.
 */
const within = (key: string, { min, max }: Bounds) =>
  (!min || key >= min.slice(0, key.length)) && (!max || key <= max.slice(0, key.length));

function stepCursor(view: View, cursor: Date, key: string, shift: boolean): Date | null {
  if (view === "days") {
    switch (key) {
      case "ArrowLeft": return addDays(cursor, -1);
      case "ArrowRight": return addDays(cursor, 1);
      case "ArrowUp": return addDays(cursor, -7);
      case "ArrowDown": return addDays(cursor, 7);
      case "Home": return addDays(cursor, -weekdayIndex(cursor));
      case "End": return addDays(cursor, 6 - weekdayIndex(cursor));
      case "PageUp": return shiftMonths(cursor, shift ? -12 : -1);
      case "PageDown": return shiftMonths(cursor, shift ? 12 : 1);
      default: return null;
    }
  }
  // Month and year views are both 3-column grids; a year cell is 12 months wide.
  const unit = view === "months" ? 1 : 12;
  switch (key) {
    case "ArrowLeft": return shiftMonths(cursor, -unit);
    case "ArrowRight": return shiftMonths(cursor, unit);
    case "ArrowUp": return shiftMonths(cursor, -3 * unit);
    case "ArrowDown": return shiftMonths(cursor, 3 * unit);
    case "PageUp": return shiftMonths(cursor, -12 * unit);
    case "PageDown": return shiftMonths(cursor, 12 * unit);
    default: return null;
  }
}

interface Cell {
  key: string;
  label: string;
  ariaLabel: string;
  isCursor: boolean;
  selected: boolean;
  current: boolean;
  enabled: boolean;
  outside?: boolean;
  pick: () => void;
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );
}

function Calendar({
  granularity,
  selected,
  bounds,
  canClear,
  onPick,
}: {
  granularity: Granularity;
  selected: Date | null;
  bounds: Bounds;
  canClear: boolean;
  onPick: (next: string) => void;
}) {
  const today = startOfToday();
  const toKey = granularity === "day" ? isoDate : isoMonth;
  const [view, setView] = useState<View>(granularity === "day" ? "days" : "months");
  const [cursor, setCursor] = useState<Date>(() => {
    if (selected) return selected;
    // Open where a choice is possible, not on a month that is entirely out of range.
    const todayKey = toKey(today);
    if (bounds.min && todayKey < bounds.min) return parseValue(bounds.min, granularity) ?? today;
    if (bounds.max && todayKey > bounds.max) return parseValue(bounds.max, granularity) ?? today;
    return today;
  });
  const gridRef = useRef<HTMLDivElement>(null);
  // Focus follows the cursor only after keyboard moves and view switches;
  // paging with the arrow buttons leaves focus on the button. The first focus
  // on open belongs to the popover (see onOpenAutoFocus below).
  const shouldFocusCursor = useRef(false);

  useEffect(() => {
    if (!shouldFocusCursor.current) return;
    shouldFocusCursor.current = false;
    gridRef.current
      ?.querySelector<HTMLButtonElement>("[data-cursor]")
      ?.focus({ preventScroll: true });
  }, [cursor, view]);

  const moveTo = (next: Date, nextView: View = view) => {
    shouldFocusCursor.current = true;
    setCursor(next);
    setView(nextView);
  };

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const blockStart = Math.floor(year / 12) * 12;
  const dayOfMonth = (y: number, m: number) => Math.min(cursor.getDate(), daysIn(y, m));

  let cells: Cell[];
  let columns: number;
  let caption: string;
  let pageBy: number;
  let prevEnabled: boolean;
  let nextEnabled: boolean;

  if (view === "days") {
    const first = new Date(year, month, 1);
    const gridStart = addDays(first, -weekdayIndex(first));
    // Always six weeks, so the popover does not change height between months.
    cells = Array.from({ length: 42 }, (_, i) => {
      const date = addDays(gridStart, i);
      const key = isoDate(date);
      return {
        key,
        label: String(date.getDate()),
        ariaLabel: formatDateLong(date),
        isCursor: key === isoDate(cursor),
        selected: !!selected && key === isoDate(selected),
        current: key === isoDate(today),
        enabled: within(key, bounds),
        outside: date.getMonth() !== month,
        pick: () => onPick(key),
      };
    });
    columns = 7;
    caption = `${monthName(month, "long")} ${year}`;
    pageBy = 1;
    prevEnabled = within(isoMonth(shiftMonths(cursor, -1)), bounds);
    nextEnabled = within(isoMonth(shiftMonths(cursor, 1)), bounds);
  } else if (view === "months") {
    cells = Array.from({ length: 12 }, (_, m) => {
      const key = isoMonth(new Date(year, m, 1));
      return {
        key,
        label: monthName(m, "short"),
        ariaLabel: `${monthName(m, "long")} ${year}`,
        isCursor: m === month,
        selected: !!selected && key === isoMonth(selected),
        current: key === isoMonth(today),
        enabled: within(key, bounds),
        pick: () =>
          granularity === "month"
            ? onPick(key)
            : moveTo(new Date(year, m, dayOfMonth(year, m)), "days"),
      };
    });
    columns = 3;
    caption = String(year);
    pageBy = 12;
    prevEnabled = within(String(year - 1), bounds);
    nextEnabled = within(String(year + 1), bounds);
  } else {
    cells = Array.from({ length: 12 }, (_, i) => {
      const y = blockStart + i;
      const key = String(y);
      return {
        key,
        label: key,
        ariaLabel: key,
        isCursor: y === year,
        selected: !!selected && y === selected.getFullYear(),
        current: y === today.getFullYear(),
        enabled: within(key, bounds),
        pick: () => moveTo(new Date(y, month, dayOfMonth(y, month)), "months"),
      };
    });
    columns = 3;
    caption = `${blockStart} – ${blockStart + 11}`;
    pageBy = 144;
    prevEnabled = within(String(blockStart - 1), bounds);
    nextEnabled = within(String(blockStart + 12), bounds);
  }

  const onGridKeyDown = (event: KeyboardEvent) => {
    const next = stepCursor(view, cursor, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    moveTo(next);
  };

  const todayKey = toKey(today);
  const unitLabel = view === "days" ? "bulan" : view === "months" ? "tahun" : "12 tahun";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={view === "years"}
          onClick={() => moveTo(cursor, view === "days" ? "months" : "years")}
          aria-label={view === "years" ? caption : `${caption}, pilih ${view === "days" ? "bulan" : "tahun"}`}
          className="flex items-center gap-1 rounded-sm px-2 py-1 text-sm font-semibold text-ink transition-colors hover:bg-panel-raised disabled:pointer-events-none"
        >
          <span className="tabular-nums">{caption}</span>
          {view !== "years" && <ChevronDown className="h-3.5 w-3.5 text-ink-muted" aria-hidden />}
        </button>
        <div className="flex items-center">
          <button
            type="button"
            disabled={!prevEnabled}
            onClick={() => setCursor(shiftMonths(cursor, -pageBy))}
            aria-label={`${unitLabel} sebelumnya`}
            className="rounded-sm p-1.5 text-ink-muted transition-colors hover:bg-panel-raised hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={!nextEnabled}
            onClick={() => setCursor(shiftMonths(cursor, pageBy))}
            aria-label={`${unitLabel} berikutnya`}
            className="rounded-sm p-1.5 text-ink-muted transition-colors hover:bg-panel-raised hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={gridRef} role="grid" aria-label={caption} onKeyDown={onGridKeyDown}>
        {view === "days" && (
          <div role="row" className="mb-1 grid grid-cols-7">
            {WEEKDAYS.map((weekday) => (
              <div
                key={weekday}
                role="columnheader"
                className="label py-1 text-center text-2xs text-ink-muted"
              >
                {weekday}
              </div>
            ))}
          </div>
        )}
        <div className={cn("grid", view === "days" ? "gap-0.5" : "gap-1")}>
          {chunk(cells, columns).map((row) => (
            <div
              key={row[0].key}
              role="row"
              className={cn("grid", columns === 7 ? "grid-cols-7 gap-0.5" : "grid-cols-3 gap-1")}
            >
              {row.map((cell) => (
                <div key={cell.key} role="gridcell" aria-selected={cell.selected}>
                  <button
                    type="button"
                    // Disabled cells stay focusable (aria-disabled, not disabled)
                    // so arrow keys can travel across them to an allowed date.
                    tabIndex={cell.isCursor ? 0 : -1}
                    data-cursor={cell.isCursor || undefined}
                    aria-disabled={!cell.enabled || undefined}
                    aria-current={cell.current ? "date" : undefined}
                    aria-label={cell.ariaLabel}
                    onClick={() => cell.enabled && cell.pick()}
                    className={cn(
                      "relative flex w-full items-center justify-center rounded-sm tabular-nums transition-colors duration-150 focus-visible:outline-offset-0",
                      view === "days" ? "h-9 text-sm" : "h-12 text-sm",
                      cell.selected
                        ? "bg-ink font-semibold text-ink-on"
                        : cell.enabled
                          ? cn(
                              "hover:bg-panel-raised",
                              cell.current
                                ? "font-semibold text-signal-ink"
                                : cell.outside
                                  ? "text-ink-muted/70"
                                  : "text-ink",
                            )
                          : "cursor-not-allowed text-ink-muted/35",
                    )}
                  >
                    {cell.label}
                    {cell.current && (
                      <span
                        aria-hidden
                        className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-signal"
                      />
                    )}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
        <button
          type="button"
          disabled={!within(todayKey, bounds)}
          onClick={() => onPick(todayKey)}
          className="rounded-sm px-2 py-1 text-xs font-semibold text-signal-ink transition-colors hover:bg-signal-soft disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {granularity === "day" ? "Hari ini" : "Bulan ini"}
        </button>
        {canClear && (
          <button
            type="button"
            onClick={() => onPick("")}
            className="rounded-sm px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:bg-panel-raised hover:text-ink"
          >
            Hapus
          </button>
        )}
      </div>
    </div>
  );
}

type CalendarInputProps = Omit<ComponentProps<"input">, "type"> & {
  invalid?: boolean;
  mono?: boolean;
};

/**
 * Controlled use (`value` + `onChange`) is the supported path. Uncontrolled use
 * follows the user's own picks, but not values written straight to the DOM —
 * react-hook-form's `register()` + `reset()` does that, so use `Controller`.
 */
const CalendarInput = forwardRef<
  HTMLInputElement,
  CalendarInputProps & { granularity: Granularity }
>(
  (
    {
      granularity,
      className,
      invalid,
      mono,
      value,
      defaultValue,
      onChange,
      min,
      max,
      disabled,
      placeholder,
      id,
      "aria-label": ariaLabel,
      ...rest
    },
    ref,
  ) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const setInputRef = useCallback(
      (element: HTMLInputElement | null) => {
        inputRef.current = element;
        assignRef(ref, element);
      },
      [ref],
    );
    const contentRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [uncontrolled, setUncontrolled] = useState(String(defaultValue ?? ""));

    const current = value !== undefined ? String(value) : uncontrolled;
    const selected = parseValue(current, granularity);
    const bounds: Bounds = {
      min: min === undefined ? undefined : String(min),
      max: max === undefined ? undefined : String(max),
    };

    const shown = selected
      ? granularity === "day"
        ? formatDateId(selected)
        : `${monthName(selected.getMonth(), "long")} ${selected.getFullYear()}`
      : (placeholder ?? (granularity === "day" ? "Pilih tanggal" : "Pilih bulan"));

    const handleNativeChange = (event: ChangeEvent<HTMLInputElement>) => {
      if (value === undefined) setUncontrolled(event.target.value);
      onChange?.(event);
    };

    const pick = (next: string) => {
      commitNativeValue(inputRef.current, next);
      setOpen(false);
    };

    return (
      <div className="relative">
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            {/* First in the wrapper so a surrounding <label> activates it. */}
            <button
              type="button"
              id={id}
              disabled={disabled}
              aria-label={ariaLabel}
              aria-invalid={invalid || undefined}
              className={cn(
                CONTROL,
                "flex items-center gap-2 text-left",
                open && "border-signal",
                invalid && "border-rust focus:border-rust",
                className,
              )}
            >
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  mono && "data",
                  !selected && "text-ink-muted",
                )}
              >
                {shown}
              </span>
              <CalendarDays
                className={cn(
                  "h-4 w-4 shrink-0 transition-colors",
                  open ? "text-signal-ink" : "text-ink-muted",
                )}
                aria-hidden
              />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              sideOffset={6}
              collisionPadding={12}
              ref={contentRef}
              // Focus the cursor day here, not from the calendar's mount effect:
              // inside a dialog, the dialog's focus trap is only paused once the
              // popover's own scope mounts, and an earlier focus is pulled back.
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                contentRef.current
                  ?.querySelector<HTMLButtonElement>("[data-cursor]")
                  ?.focus({ preventScroll: true });
              }}
              className={cn(POPOVER, "w-[19rem] p-3")}
            >
              <Calendar
                granularity={granularity}
                selected={selected}
                bounds={bounds}
                canClear={current !== ""}
                onPick={pick}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <input
          ref={setInputRef}
          {...rest}
          {...(value !== undefined ? { value } : { defaultValue })}
          type="text"
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          disabled={disabled}
          onChange={handleNativeChange}
        />
      </div>
    );
  },
);
CalendarInput.displayName = "CalendarInput";

/** "YYYY-MM-DD" in and out, like `<input type="date">`, with a themed calendar. */
export const DateInput = forwardRef<HTMLInputElement, CalendarInputProps>((props, ref) => (
  <CalendarInput ref={ref} granularity="day" {...props} />
));
DateInput.displayName = "DateInput";

/** "YYYY-MM" in and out, like `<input type="month">`. */
export const MonthInput = forwardRef<HTMLInputElement, CalendarInputProps>((props, ref) => (
  <CalendarInput ref={ref} granularity="month" {...props} />
));
MonthInput.displayName = "MonthInput";
