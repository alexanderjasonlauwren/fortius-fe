import { NUMBER_LOCALE, formatNumber } from "@/lib/format";
/**
 * Chart parameters for the console.
 *
 * Categorical hues are assigned in fixed order and never cycled; a fifth series
 * folds into "Wilayah lain" rather than inventing a colour. Both sets below
 * pass the full six-check validation (lightness band, chroma floor, CVD
 * separation, normal-vision floor, contrast) against their own surface —
 * light against #FFFFFF, dark against the dark panel.
 *
 * Status colours (pine / amber / rust) are reserved for delivery and payment
 * state and are never reused as a series colour.
 */

export const CATEGORICAL_LIGHT = ["#2A6FB0", "#C6690C", "#8A3A66", "#4F8B3B"] as const;
export const CATEGORICAL_DARK = ["#4E90CE", "#CE7C2E", "#B25E88", "#6BA553"] as const;

export function categorical(isDark: boolean): readonly string[] {
  return isDark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
}

/** Series colour by fixed index — the entity's slot, never its rank. */
export function seriesColor(index: number, isDark: boolean): string {
  const scale = categorical(isDark);
  return scale[index % scale.length];
}

/**
 * Fleet palette — one hue per truck on the monitoring map.
 *
 * Separate from the chart theme because it has a different job: telling four or
 * five overlapping routes apart on a busy map. Both sets pass the full six-check
 * validation against their own surface (blue → orange → purple → green →
 * magenta; worst CVD separation ΔE 13.3 light / 11.6 dark).
 *
 * Deliberately excludes red: rust is reserved for "Tertunda" on this screen, and
 * a red route would read as an alert rather than as a driver.
 */
export const FLEET_LIGHT = [
  "#2A6FB0",
  "#C6690C",
  "#6B4FA8",
  "#4F8B3B",
  "#9B3D7E",
] as const;

export const FLEET_DARK = [
  "#4E90CE",
  "#CE7C2E",
  "#8B76CA",
  "#6BA553",
  "#BE649C",
] as const;

/**
 * A truck's colour follows the truck, not its position in a filtered list, so
 * filtering the board never repaints the survivors. `slot` is the driver's
 * index in the full roster, supplied by the API.
 */
export function fleetColor(slot: number, isDark: boolean): string {
  const scale = isDark ? FLEET_DARK : FLEET_LIGHT;
  return scale[((slot % scale.length) + scale.length) % scale.length];
}

/** Chart chrome, pulled from the same tokens as the rest of the desk. */
export function chartTheme(isDark: boolean) {
  return {
    grid: isDark ? "#2A2F27" : "#E1E3DC",
    axis: isDark ? "#9AA093" : "#676B62",
    surface: isDark ? "#1A1E18" : "#FFFFFF",
    ink: isDark ? "#E8EAE3" : "#171A16",
    muted: isDark ? "#9AA093" : "#676B62",
    /** Reference marks — targets, budgets, thresholds. Deliberately recessive. */
    reference: isDark ? "#3E4439" : "#C6C9BF",
    signal: isDark ? "#E2AC42" : "#E0A32E",
    pine: isDark ? "#4E9C80" : "#2E6A55",
    rust: isDark ? "#D46A4E" : "#B03F27",
  };
}

/** Shared axis props so every chart in the console has the same voice. */
export function axisProps(isDark: boolean) {
  const t = chartTheme(isDark);
  return {
    tick: {
      fontSize: 11,
      fill: t.axis,
      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
    },
    axisLine: false as const,
    tickLine: false as const,
  };
}

export function compactUnit(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000)
    return `${(value / 1_000_000).toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: 1 })} jt`;
  // Under 10 rb the abbreviation would round neighbouring ticks to the same
  // label ("2 rb, 2 rb, 3 rb"), so show the full figure instead.
  if (abs >= 10_000)
    return `${(value / 1_000).toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: 0 })} rb`;
  return formatNumber(value);
}
