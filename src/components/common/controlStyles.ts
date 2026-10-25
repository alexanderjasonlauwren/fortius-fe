/**
 * The console's control surface: underlined on a sunk panel rather than boxed,
 * so a dense form reads as a filled-in sheet. Shared by the native inputs in
 * Field.tsx and the popover-backed pickers that stand in for native popups.
 */
export const CONTROL =
  "w-full rounded-sm border-b-2 border-line-strong bg-panel-sunk px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted hover:border-ink-muted focus:border-signal disabled:cursor-not-allowed disabled:opacity-55";

/** Floating surfaces opened from a control: hairline, lifted, same paper. */
export const POPOVER =
  "animate-in-up z-50 rounded-md border border-line bg-panel text-ink shadow-pop outline-none";
