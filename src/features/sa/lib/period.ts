/**
 * The agent's current month, `YYYY-MM`. Jakarta rather than the browser's zone:
 * SIM3LON and the server both count days in WIB, so a laptop set to another
 * zone must not open the wrong month around midnight.
 */
export function currentJakartaMonth(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

/** "2026-11" as "November 2026". */
export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

const MONTH_NAMES = ["januari", "februari", "maret", "april", "mei", "juni",
  "juli", "agustus", "september", "oktober", "november", "desember"];

/**
 * The month an Acuan Base SA file names, `YYYY-MM`, or `null`. The PDF itself
 * never states its month -- only its file name does ("Acuan Base SA November
 * 2026 PT. BDA.pdf") -- so this only suggests; the admin confirms it.
 */
export function monthFromFileName(fileName: string): string | null {
  const match = /\b(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)\s+(20\d{2})\b/i
    .exec(fileName);
  if (!match) return null;
  const index = MONTH_NAMES.indexOf(match[1].toLowerCase());
  return `${match[2]}-${String(index + 1).padStart(2, "0")}`;
}
