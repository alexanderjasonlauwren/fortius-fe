import type { Report, ReportLink } from "../api/contract";

/**
 * Where a report row drills down to in the console. A supplier has no page
 * of its own (vendors live in Pengaturan), so a supplier row does not link;
 * an asset opens the asset register, which has no per-asset page; a product
 * opens its kartu stok.
 *
 * An account opens its Buku Besar over the report's own period: the range
 * of a range report, or the year to date of an as-of one. Without it the
 * ledger opened on the current year, whatever the report covered.
 */
export function reportLinkHref(link?: ReportLink, period?: Report["period"]): string | null {
  if (!link?.id) return null;
  switch (link.type) {
    case "invoice":
      return `/receivables/${link.id}`;
    case "purchase":
      return `/purchases/${link.id}`;
    case "outlet":
      return `/outlet/${link.id}`;
    case "claim":
      return `/transportation-claims/${link.id}`;
    case "account": {
      const params = new URLSearchParams({ tab: "buku-besar", account: link.id });
      const range = ledgerRange(period);
      if (range) {
        params.set("from", range.from);
        params.set("to", range.to);
      }
      return `/financial-statements?${params}`;
    }
    case "asset":
      return "/assets";
    case "product":
      return `/laporan/stock_card?product_id=${link.id}`;
    default:
      return null;
  }
}

function ledgerRange(period?: Report["period"]): { from: string; to: string } | null {
  if (period?.from && period.to) return { from: period.from, to: period.to };
  if (period?.asOf) return { from: `${period.asOf.slice(0, 4)}-01-01`, to: period.asOf };
  return null;
}
