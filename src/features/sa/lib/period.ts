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
