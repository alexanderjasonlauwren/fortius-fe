# Known API gaps, per feature

**Last verified against the code:** 2026-11-02

The console talks only to the fortius-backend API (mock mode was removed on
2026-10-12). Each feature lives in `src/features/<f>/api/` as `contract.ts`
(domain types), `<f>Api.http.ts` (the wire mapping) and `<f>Api.ts` (what pages
import). This table records only what a feature cannot do yet, or does
differently from what its screen suggests, so nobody mistakes a gap for a bug or
a bug for a gap. Features with nothing open are listed at the end. The history
of how each feature was wired is in git; the backend-side registers are
`fortius-backend/docs/technical-gaps.md` (IDs `T…`), `open-findings.md` (`#…`)
and `business-gaps.md`.

## Applies to every list

**No pagination.** Every adapter fetches one page of 100 rows (the server's
`MaxPageSize`) and does not follow `has_next`. Screens show the newest 100 and
say nothing about the rest; client-side filters and totals run over those 100
only. See `technical-gaps.md` T1 for the fix order.

## Per feature

| Feature | Open gaps |
| --- | --- |
| assets | No void for an acquisition or a disposal (`open-findings.md` #12). The disposal preview uses depreciation posted to date; the backend uses what is posted through the disposal date, and refuses a disposal dated before a posted run's journal (409). The attachments panel is not mounted on assets, though the backend supports owner type `asset`. |
| cashvouchers | Deleting a draft leaves a gap in the KB series (`business-gaps.md` G8). |
| dashboard | **Jejak aktivitas is always empty:** `getRecentAudit` returns `[]` — the audit trail is written but has no list endpoint. KPIs read `/deliveries` for today/yesterday capped at 100. The dispatch rail has no clock: no planned time of day exists in the schema. Without `finance.read.reports`, the finance strip falls back to sums over the first 100 payments/invoices and shows itself as incomplete. |
| depreciationruns | The "preview before posting" is computed in the browser (`lib/depreciation.ts`, a port of the backend's straight-line formula) because the backend has no dry-run endpoint; the two can drift. |
| distribution | A plan's stops show address "—", outlet receivable and remaining quota `0` (the receivable badge never appears), and "dibuat oleh" "—": none is on the order-item response. The route sheet prints the company as "—" (see settings). Credit-limit override: the second-approver picker lists every active user, and the outlet a breach names is matched from the error text. Re-uploading a source plan does not update drafts made from the previous upload. |
| drivers | A driver's schedule shows `jam` and `kecamatan` as placeholders (no planned time of day; the delivery carries the outlet's name, not its district). |
| finance (Piutang, Penerimaan, Buku Besar) | Piutang and its aging view are built from the newest 100 invoices; the authoritative aging is Laporan › `ar_aging`. |
| financedashboard | Tenant-wide, not per branch. A tenant still on the 2025 layout shows "—" for `laba_rugi_v2` lines it lacks. The 12-month trend is 12 requests. |
| financereports | A vendor row does not drill down (vendors have no page). A Buku Besar opened from a report shows the current year, not the report's period. |
| financialstatements | No branch picker on the page, so every statement is tenant-wide, though the adapter can send `branch_id`. |
| inventory | Quantities are tenant-wide, not per branch or truck (`core.stock_levels` is unwired — `technical-gaps.md` T9). |
| notification | **The rules panel mostly does nothing** (`technical-gaps.md` T2, `open-findings.md` #21). Only SA expiry generates notifications, weekly. Quota-low, stock-low, payment-pending and delivery-delay save a toggle and threshold that nothing reads. Per-rule recipients (`penerima`) and channels (`kanal`) are not persisted; `planUnconfirmed` and `orderPending` have no column. WhatsApp and email sender settings and `sendTestNotification` have no backend — there is no outbound channel at all. A notification has no link target (`subject_id` is an internal id). |
| ocr | No OCR engine: what is "read" off a receipt is typed by hand. Uploaded files are not malware-scanned (`technical-gaps.md` T5). |
| openingbalance | The refusal path for a deliberately broken workbook has not been verified against the real API (no scratch tenant without ledger activity existed); it is covered by unit tests only. |
| orders | `sisaKuotaOutlet` and `kecamatan` are not on `OrderResponse`. An approval note (`catatan`) has no field server-side and is dropped. Scheduling several orders onto a plan is one request per order, not atomic; a failure partway leaves the earlier ones scheduled. |
| outlet | **Status "Ditangguhkan" is saved as inactive** (the backend has `atv`/`ina` only), reads back as Nonaktif, and the list filter for it returns every inactive outlet (`business-gaps.md` C6). |
| products | **Stock is hidden and "adjust stock" throws**, although `GET /inventory/stock` exists; the adapter's header still says nothing serves stock. A new product always lands in the tenant's first category (no category picker). |
| purchases | No form for an SA *tebus* purchase (`POST /purchases`); it can only be recorded as a general bill from vendor PERTAMINA, which loses the agreement link. |
| reports (Laporan recap) | **Undercounts past 100 rows:** payments and invoices have no server-side date filter, so the newest 100 are fetched and windowed in the browser; deliveries are capped the same way (`open-findings.md` #22). The printed recap shows the company and agent number as "—". |
| sa | SA amendment and cancellation have no endpoint or screen (`business-gaps.md` C8). The source plant is free text (`supplier_name`, B6). |
| settings | **Profil agen saves nothing:** company name, agent number, phone, email, address, legal name, NIB, NPWP, timezone, PKP, default PPN and office coordinates are not sent; `PUT /tenants/:id/profile` exists and is never called. **Target harian** has no backend column. Document-number prefixes are read-only by design. |
| sopir | Filings and photos need a connection (no offline queue); GPS stops while the tab is in the background (`technical-gaps.md` T7). |
| transactions | Status, district and search filters run client-side over 100 rows; `jamRencana` is always empty; an unbilled delivery shows `nominal` 0. |
| transportation | Per-trip pricing is not built (tariffs are per kg or per tabung). |
| users | No change-password screen (`POST /auth/change-password` is unused) and no "log out all devices". No invitation flow; the "Diundang" status is dead code. No user export or audit-trail read. |
| tenancy | A tenant cannot be edited after creation (`PUT /tenants/:id` is unused). |

## No gaps recorded

Nothing is known to be missing in these; they were not individually re-audited
on 2026-11-02 beyond the checks above.

accountingperiods · approvals · attachments · auth · bankaccounts ·
bankstatements · expensecategories · expenses · externalstatements ·
fiscalyears · geofence · monitoring · outletwarnings · registrationpackages ·
sim3lonlive · suppliers (see `sa` for the SPBE lexicon) · system · vehicles
