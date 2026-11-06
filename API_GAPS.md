# Known API gaps, per feature

**Last verified against the code:** 2026-11-06

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
| assets | No void for an acquisition or a disposal (`open-findings.md` #12). The disposal preview uses depreciation posted to date; the backend uses what is posted through the disposal date, and refuses a disposal dated before a posted run's journal (409). |
| cashvouchers | Deleting a draft leaves a gap in the KB series (`business-gaps.md` G8). |
| dashboard | The dispatch rail has no clock: no planned time of day exists in the schema. Jejak aktivitas is shown only to roles with `audit.read.audit_trails`, and only writes of the last 30 days. |
| depreciationruns | The "preview before posting" is computed in the browser (`lib/depreciation.ts`, a port of the backend's straight-line formula) because the backend has no dry-run endpoint; the two can drift. |
| distribution | A stop's remaining monthly quota arrives on the row (`sisaKuotaOutlet`) but the planning table has no column for it. Re-uploading a source plan does not update drafts made from the previous upload. |
| drivers | A driver's schedule shows `jam` empty: no planned time of day exists in the schema. The list's delivery figures (hari ini, 30 hari, ketepatan) are hidden: no endpoint aggregates deliveries per driver. |
| finance (Piutang, Penerimaan, Buku Besar) | Penerimaan's header no longer counts "belum dialokasikan" receipts: unallocated money cannot be filtered on the server, and the old count covered one tab's first page; the row spine still marks them. |
| financedashboard | Tenant-wide, not per branch. A tenant still on the 2025 layout shows "—" for `laba_rugi_v2` lines it lacks. The 12-month trend is 12 requests. |
| financereports | A vendor row does not drill down (vendors have no page). |
| financialstatements | The branch picker (shown when the tenant has more than one branch) covers Laba Rugi, Neraca and the Excel package. Penjelasan Akun, Komparasi and Buku Besar stay tenant-wide: the server takes no branch there. |
| inventory | Quantities are tenant-wide, not per branch or truck (`core.stock_levels` is unwired — `technical-gaps.md` T9). |
| notification | All seven rules generate hourly and save with their recipients (role codes, which narrow the permission audience and never widen it) and channels. Email goes out through the backend outbox when the installation has SMTP; **WhatsApp is shown but cannot be switched on** — no provider is chosen and outlet consent (B5) is open. A role nobody holds routes a rule to no one; the panel says so but does not count holders. The rules and channels save as two requests: a failure on the second leaves the first saved (the next load shows it). |
| ocr | No OCR engine: what is "read" off a receipt is typed by hand. Uploads are scanned only once the installation runs clamd (`technical-gaps.md` T5); an infected file is refused (`FILE_INFECTED`). |
| openingbalance | The refusal path for a deliberately broken workbook has not been verified against the real API (no scratch tenant without ledger activity existed); it is covered by unit tests only. |
| orders | Mass approval is one request per order and reports the failures; scheduling several orders is one all-or-nothing request. A rejected order names no one under "diproses oleh": the order records an approver, not a rejecter. |
| outlet | "Ditangguhkan" is the backend's `sus` (since 2026-11-02): listed and billable, refused at dispatch. What else a suspension should block is the client's call (`business-gaps.md` C6). The delivery-derived figures (terpakai bulan ini, sisa kuota, tagihan tertunda, pengiriman terakhir) are hidden: no endpoint aggregates deliveries and invoices per outlet (`statistikTersedia` false). The amount owed shows, from `credit_balance`. |
| products | Stock shows only for roles with `finance.read.inventory`; others see "Stok belum tersedia". Quantities are tenant-wide (`technical-gaps.md` T9). |
| purchases | "Catat tebus" (SA detail, active agreements only) bills the whole granted quota at today's cost price; a partial tebus is not possible. |
| sa | SA amendment and cancellation have no endpoint or screen (`business-gaps.md` C8). The source plant is free text (`supplier_name`, B6). |
| settings | Document-number prefixes are read-only by design. Profil agen saves to the tenant profile at the version it was read at; a save over someone else's newer edit is refused (409) and the page must be reloaded. City, province and postal code are kept as stored (not on the form). |
| sopir | GPS stops while the tab is in the background (`technical-gaps.md` T7). Filings and photos made with no signal wait in the phone's outbox (IndexedDB) and are sent with their Idempotency-Key when it is back, so nothing is filed twice; one the server refuses is shown with its reason. A filing still waiting is lost if the driver clears the browser's site data, and the server forgets a key after 24 hours. |
| transactions | `jamRencana` is always empty; an unbilled delivery shows `nominal` 0. |
| transportation | Per-trip pricing is not built (tariffs are per kg or per tabung). |
| users | No invitation flow: an account is created with its password. No user export or per-user audit-trail read. |

## No gaps recorded

Nothing is known to be missing in these; they were not individually re-audited
on 2026-11-02 beyond the checks above.

accountingperiods · approvals · attachments · auth · bankaccounts ·
bankstatements · expensecategories · expenses · externalstatements ·
fiscalyears · geofence · monitoring · outletwarnings · registrationpackages ·
reports · sim3lonlive · suppliers (see `sa` for the SPBE lexicon) · system ·
tenancy · vehicles
