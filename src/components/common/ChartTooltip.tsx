import { cn } from "@/lib/utils";
import { unitLabel } from "@/lib/lexicon";
import { formatNumber } from "@/lib/format";

interface Entry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
}

/**
 * One tooltip for every chart in the console. Values sit in the mono face and
 * the series colour appears only as a swatch — text keeps its ink token so
 * identity never rests on colour alone.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  unit = `${unitLabel()}`,
  formatValue,
  className,
}: {
  active?: boolean;
  payload?: Entry[];
  label?: string | number;
  unit?: string;
  formatValue?: (value: number, entry: Entry) => string;
  className?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className={cn(
        "min-w-[10rem] rounded-md border border-line bg-panel px-3 py-2 shadow-pop",
        className,
      )}
    >
      {label != null && (
        <p className="label mb-1.5 text-2xs text-ink-muted">{label}</p>
      )}
      <ul className="space-y-1">
        {payload.map((entry, i) => {
          const numeric = Number(entry.value ?? 0);
          return (
            <li
              key={`${entry.dataKey}-${i}`}
              className="flex items-center justify-between gap-4 text-xs"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-[1px]"
                  style={{ background: entry.color }}
                  aria-hidden
                />
                <span className="truncate text-ink-muted">{entry.name}</span>
              </span>
              <span className="data shrink-0 font-semibold text-ink">
                {formatValue
                  ? formatValue(numeric, entry)
                  : `${formatNumber(numeric)}${unit ? ` ${unit}` : ""}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
