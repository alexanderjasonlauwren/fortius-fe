import type { ReportLink } from "../api/contract";

/**
 * Where a report row drills down to in the console. A supplier has no page
 * of its own (vendors live in Pengaturan), so a supplier row does not link;
 * an asset opens the asset register, which has no per-asset page; a product
 * opens its kartu stok.
 */
export function reportLinkHref(link?: ReportLink): string | null {
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
    case "account":
      return `/financial-statements?tab=buku-besar&account=${link.id}`;
    case "asset":
      return "/assets";
    case "product":
      return `/laporan/stock_card?product_id=${link.id}`;
    default:
      return null;
  }
}
