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

## Lists

Since 2026-11-02 no list stops silently at the server's 100-row page. Lists
that grow without bound (Piutang, Penerimaan, Pembelian, Pengeluaran, Kas &
Bank vouchers, Pesanan, Transaksi, nota kredit, Jurnal) are paged on the
server through `DataTable`'s `server` mode, with every filter sent to the
server. Bounded lists and every window a screen sums are read through every
page with `getAllPages`; if that walk reaches its ceiling, the screen says
its figures are a floor. Three lists are newest-first by design: the
geofence alert feed, an inbox tab other than "Belum dibaca" (it says when
older notices exist), and an outlet's recent deliveries.

## Per feature

| Feature | Open gaps |
| --- | --- |
| assets | No void for an acquisition or a disposal (`open-findings.md` #12). The disposal preview uses depreciation posted to date; the backend uses what is posted through the disposal date, and refuses a disposal dated before a posted run's journal (409). The attachments panel is not mounted on assets, though the backend supports owner type `asset`. |
| cashvouchers | Deleting a draft leaves a gap in the KB series (`business-gaps.md` G8). |
| dashboard | The dispatch rail has no clock: no planned time of day exists in the schema. Jejak aktivitas is shown only to roles with `audit.read.audit_trails`, and only writes of the last 30 days. |
| depreciationruns | The "preview before posting" is computed in the browser (`lib/depreciation.ts`, a port of the backend's straight-line formula) because the backend has no dry-run endpoint; the two can drift. |
| distribution | A plan's stops show address "—", outlet receivable and remaining quota `0` (the receivable badge never appears), and "dibuat oleh" "—": none is on the order-item response. The route sheet prints the company as "—" (see settings). Credit-limit override: the second-approver picker lists every active user, and the outlet a breach names is matched from the error text. Re-uploading a source plan does not update drafts made from the previous upload. |
| drivers | A driver's schedule shows `jam` and `kecamatan` as placeholders (no planned time of day; the delivery carries the outlet's name, not its district). |
| finance (Piutang, Penerimaan, Buku Besar) | Penerimaan's header no longer counts "belum dialokasikan" receipts: unallocated money cannot be filtered on the server, and the old count covered one tab's first page; the row spine still marks them. |
| financedashboard | Tenant-wide, not per branch. A tenant still on the 2025 layout shows "—" for `laba_rugi_v2` lines it lacks. The 12-month trend is 12 requests. |
| financereports | A vendor row does not drill down (vendors have no page). A Buku Besar opened from a report shows the current year, not the report's period. |
| financialstatements | No branch picker on the page, so every statement is tenant-wide, though the adapter can send `branch_id`. |
| inventory | Quantities are tenant-wide, not per branch or truck (`core.stock_levels` is unwired — `technical-gaps.md` T9). |
| notification | **The rules panel mostly does nothing** (`technical-gaps.md` T2, `open-findings.md` #21). Only SA expiry generates notifications, weekly. Quota-low, stock-low, payment-pending and delivery-delay save a toggle and threshold that nothing reads. Per-rule recipients (`penerima`) and channels (`kanal`) are not persisted; `planUnconfirmed` and `orderPending` have no column. WhatsApp and email sender settings and `sendTestNotification` have no backend — there is no outbound channel at all. A notification has no link target (`subject_id` is an internal id). |
| ocr | No OCR engine: what is "read" off a receipt is typed by hand. Uploaded files are not malware-scanned (`technical-gaps.md` T5). |
| openingbalance | The refusal path for a deliberately broken workbook has not been verified against the real API (no scratch tenant without ledger activity existed); it is covered by unit tests only. |
| orders | `sisaKuotaOutlet` and `kecamatan` are not on `OrderResponse`. An approval note (`catatan`) has no field server-side and is dropped. Scheduling several orders onto a plan is one request per order, not atomic; a failure partway leaves the earlier ones scheduled. |
| outlet | "Ditangguhkan" is the backend's `sus` (since 2026-11-02): listed and billable, refused at dispatch. What else a suspension should block is the client's call (`business-gaps.md` C6). |
| products | Stock shows only for roles with `finance.read.inventory`; others see "Stok belum tersedia". Quantities are tenant-wide (`technical-gaps.md` T9). |
| purchases | No form for an SA *tebus* purchase (`POST /purchases`); it can only be recorded as a general bill from vendor PERTAMINA, which loses the agreement link. |
| reports (Laporan recap) | The printed recap shows the company and agent number as "—" (see settings). Figures use the UTC day, as the ledger does (`open-findings.md` #23). |
| sa | SA amendment and cancellation have no endpoint or screen (`business-gaps.md` C8). The source plant is free text (`supplier_name`, B6). |
| settings | Document-number prefixes are read-only by design. Profil agen saves to the tenant profile at the version it was read at; a save over someone else's newer edit is refused (409) and the page must be reloaded. City, province and postal code are kept as stored (not on the form). |
| sopir | Filings and photos need a connection (no offline queue); GPS stops while the tab is in the background (`technical-gaps.md` T7). |
| transactions | `jamRencana` is always empty; an unbilled delivery shows `nominal` 0. |
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
