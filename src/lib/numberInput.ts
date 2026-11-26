/**
 * What a number field accepts while it is typed in (partner doc C9): digits
 * and one decimal dot, nothing else. Commas are thousands separators the
 * field shows on blur, so a pasted `6,487,297` reads as 6487297, not 6.
 */

/** Keeps digits and the first dot; a leading zero before another digit goes. */
export function sanitizeNumberDraft(text: string, maxDecimals: number): string {
  let seenDot = false;
  let out = "";
  for (const ch of text) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch === "." && !seenDot && maxDecimals > 0) {
      seenDot = true;
      out += out === "" ? "0." : ".";
    }
  }
  const [whole, fraction] = out.split(".");
  const trimmedWhole = whole.replace(/^0+(?=\d)/, "");
  return fraction === undefined ? trimmedWhole : `${trimmedWhole}.${fraction.slice(0, maxDecimals)}`;
}

/** The number a draft stands for; an empty draft is 0. */
export function parseNumberDraft(draft: string): number {
  if (draft === "" || draft === ".") return 0;
  const value = Number(draft);
  return Number.isFinite(value) ? value : 0;
}

/** What the field shows when it gains focus: the plain number, or nothing for 0. */
export function draftOf(value: number): string {
  return value === 0 || !Number.isFinite(value) ? "" : String(value);
}
