# One codebase, two builds

The demo and the integration build are the same code with a different data
source. `VITE_DATA_SOURCE=mock` produces a static site with no backend;
`VITE_DATA_SOURCE=api` talks to the real service.

```
npm run build                          # demo (mock is the default)
VITE_DATA_SOURCE=api npm run build     # integration
```

## Why not two repositories

The mock coupling is confined to twenty-one feature API directories. A fork would
duplicate every page, component and layout *around* them — so each UI change
happens twice, and the demo is the copy nobody runs day to day. It breaks
quietly, and you find out in front of a client.

## The pattern

```
src/features/<feature>/api/
  contract.ts          the interface both adapters satisfy
  <feature>Api.mock.ts the mock database
  <feature>Api.http.ts the real API
  <feature>Api.ts      picks one, at build time
```

**Both adapters return domain types.** The wire shape never escapes the HTTP
adapter — that mapping is what keeps components unaware of which source they are
running against, and it is where the English/Indonesian boundary lives
(`full_name` → `nama`).

**The contract is asserted in both adapters:**

```ts
const _contract: UsersApi = { getUsers, createOrUpdateUser, removeUser };
```

That line is not ceremony. Without it the mock returned a `UserEntity` and the
HTTP adapter returned the wire shape, and the mismatch surfaced only in whichever
page happened to read a field present in one and not the other.

## Features with no endpoint yet

Re-export the mock, and say so in the selector:

```ts
// Mock-only for now: the backend has no export endpoint yet.
export const exportUsers = mockApi.exportUsers;
```

An HTTP adapter that throws would be worse — it looks like an outage rather than
unbuilt work.

## Status

| Feature | Adapter | Mock-only exceptions |
| --- | --- | --- |
| auth | mock + http | — |
| bankaccounts | mock + http | — |
| dashboard | mock + http | **A same-day date filter on `/deliveries` used to read as empty**, discovered live while wiring `drivers`' schedule: the server's `date` filter compares `lte` literally against midnight UTC of the given day, so `gte X, lte X` against `created_at` (a timestamp, not a plain date) excluded almost all of day `X` -- verified against the running service (a delivery at 16:52 UTC matched `gte` its own day but not `lte` it). `fetchDeliveries` here, and the same pattern in `reportApi.http.ts` and `transactionApi.http.ts`, now send an exclusive `lt` bound one day past `to` instead. Before this fix, `dailyDistributed`/`dailyTarget`/`lateDeliveries` on a live API build were reading against zero rows for "today" in practice. Composes financeApi.getAgingReport(), orderApi.getOrderTotals(), saApi.getSAList() and its own /deliveries fetches (today, yesterday, this month) rather than a new backend endpoint — every figure already had a real feature behind it once B2/B5/B6 landed. The dispatch rail's `hasSchedule` is false: no field for a stop's planned time of day exists anywhere in the schema, so stops position by real dispatch order instead of a fabricated clock, and `DispatchRail.tsx` stops drawing an hour ruler, a "now" line and a late verdict over a position that was never a real time. `getRecentAudit` always returns `[]` — nothing writes to `audit.audit_trails` on the real service, and the mock's own seed carries no rows either. |
| distribution | mock + http | the printed route sheet (`printRouteSheet`) is real: address now resolves from `getOutletList()` (already real), and the delivery-time column reads the same "—" placeholder `getPlanDetail`'s own `jamPengiriman` already shows on the live planning screen, rather than inventing a clock time the schema does not carry. Scheduling approved orders onto a plan is real as of D3 B-Step 2 — `addApprovedOrders` calls `orderApi.http.ts`'s own `scheduleOneOrder`, not a second copy of the request. `dispatchTrip` (D3 A-Step 2/3, sending a confirmed trip's stops out for the first time — no prior call to `POST /distribution/trips/:id/dispatch` existed anywhere in the console) is real end to end, including the credit-limit override path, with two known gaps: the second-approver picker lists every active user in the tenant unfiltered, since `GET /users` returns no role/permission per user and no endpoint answers "who holds `distribution.override.deliveries`" — the request itself is what enforces it, an unauthorised choice comes back as its own clean refusal rather than the picker silently narrowing; and which outlet a breach names is resolved by matching the service's own message text against the trip's stop names, since the error carries no structured outlet id. The mock's own breach rule (`outletExposure`, already built for the plan-confirm-time block) is reused as-is rather than reconciled with the real one: it evaluates both the credit-limit and the overdue conditions only when `blokirOtomatis` is set, where the real API applies the credit-limit condition regardless of that flag. Nor does the mock persist that a trip has already dispatched — it has no trips table to check against, so calling `dispatchTrip` twice for the same run succeeds twice on the mock build, unlike the real API's "already left" refusal. |
| drivers | mock + http | `getDriverSchedule` is real: today's stops for one driver, from `GET /deliveries` filtered by `driver_id` and `date` (the dispatch board answers the neighbouring question -- which stops are on which run -- keyed by plan rather than by driver). `jam` and `kecamatan` stay placeholders (`""`/`"—"`): no field for a stop's planned clock time exists anywhere in the schema, and `DeliveryResponse` carries an outlet's name but not its district. |
| orders | mock + http | `sisaKuotaOutlet` (an outlet's remaining monthly quota is not on `OrderResponse`; a real number would cost a lookup per row on a list screen — renders as unbounded rather than 0, which would wrongly flag every order as over quota) and `kecamatan` (the outlet's district; belongs to the outlet module, same "arrives as unknown" choice `distributionApi.http.ts` makes for a stop's own decoration). `approveOrder`'s `catatan` parameter has nowhere to go server-side (`ApproveRequest` carries no note field) and is silently dropped — no current caller passes one. `addOrdersToPlan` is no longer atomic the way the mock's `scheduleOrders` is: the real endpoint decides one order at a time, so a batch that fails partway through leaves the earlier ones already scheduled; the thrown error says how many. |
| finance | mock + http | an invoice row's surat jalan number (`InvoiceResponse` carries only the delivery's UUID); which invoices a payment was allocated to (no route returns allocation lines, only the total — see `financeApi.http.ts`'s own header); the credit note reason code (the dialog collects free text, the backend wants one of five fixed codes, so every note goes in as `billing_correction`); the trial balance's "Dari" date (the ledger's own trial balance is lifetime-to-date as of one date, not a range) |
| geofence | mock + http | — |
| monitoring | mock + http | — |
| notification | mock + http | per-rule `penerima` (who receives it) and `kanal` (channel) — `notify.reminder_settings` has one tenant-wide `channels` array and no recipients concept at all; reads as an empty/`["app"]` placeholder and is silently not persisted on save. `planUnconfirmed` and `orderPending` have no column in `notify.reminder_settings` at all — always read disabled, saving them changes nothing. `whatsapp`/`email` sender configuration and `sendTestNotification` have no backend (no send infrastructure exists; WhatsApp is explicitly out of scope for D3). A notification's `href` is always absent — `subject_id` on the wire is an internal numeric id, not a UUID any route can link to. |
| outlet | mock + http | `getOutletHistory` is real: an outlet's recent surat jalan, from `GET /deliveries` filtered by `outlet_id` and sorted newest first. `jam` stays a placeholder for the same reason `drivers`' own schedule does. |
| outletwarnings | mock + http | new feature (D3 A-Step 3) — no prior mock-only row, same shape `transportation` was in. `core.outlet_warnings` backs a plain Surat Peringatan (SP) log end to end: read+create only, no update or delete — a warning is corrected by issuing a new entry, not editing one already handed to the outlet. No gaps between builds; the whole feature is three fields (`issuedOn`, `reason`, `notes`) and both adapters produce all three. |
| products | mock + http | cost price and stock (quantity, low-stock flag, stock value) have no service behind them yet — `internal/controller/product` is a catalogue module only; see `productApi.http.ts`'s own header. `ProductView.stokTersedia` flags this so the console hides the panels rather than showing zero as real. |
| reports | mock + http | required a new backend endpoint (`GET /deliveries` — `core.deliveries` had no general list before D3 B-Step 5) alongside the adapter split; see `reportApi.http.ts`'s own header. `suratJalanSelesai`/`suratJalanTertunda` map onto the real 6-state `delivery_status` lifecycle (`delivered` / `pending`+`on_route`) rather than the mock's binary one — `partial`, `failed` and `cancelled` count toward neither, so the two no longer have to sum to `suratJalan`. `/payments` and `/invoices` have no date-range filter server-side, so both are fetched once at `MaxPageSize` (100, newest first) and the window is applied client-side, same limitation `financeApi.http.ts`'s own aging report already has; `/deliveries` itself is capped the same way for a range with more than 100 surat jalan. `namaPerusahaan`/`nomorAgen` on the printed recap read "—", the same placeholder `settingsApi`'s `DEFAULT_SETTINGS` already uses since neither field is owned by any endpoint. |
| sa (schedule agreements) | mock + http | — |
| settings | mock + http | exporting, resetting and advancing the simulated day (properties of the demo database, not a tenant) |
| sopir | mock + http | — |
| system | mock + http | suppliers are not a master table (per D3 plan's decision 5): the list is derived from `/schedule-agreements`' own `supplier_name`, with no code/address/contact fields and no create/edit/delete (the console hides those actions rather than offering ones that would fail). Numbering prefixes (`penomoran`) have no backend column at all — `core.document_sequences` fixes them at branch-creation time — so the panel shows the real, hard-coded prefixes as disabled fields rather than an editable form that saves nowhere. |
| tenancy | mock + http | — |
| transactions | mock + http | required a new backend endpoint (`GET /transactions`, joining a delivery to its plan, schedule agreement, invoice and funding payment in one query — `core.deliveries` had no such pre-joined read before D3 B-Step 6) alongside the adapter split; see `transactionApi.http.ts`'s own header. `statusKirim` and `statusBayar` (and `kecamatan` and free-text search) have no `eq`-only server-side filter that expresses the console's coarser buckets, so all four are applied client-side over one fetched page of up to 100 rows — same trade `getInvoices` already makes for its own status/bucket filters. `jamRencana` is always empty (no planned-time-of-day field exists anywhere in the schema, the same gap `monitoringApi.http.ts` already carries); an unbilled delivery's `nominal` reads 0 rather than the mock's catalogue-price estimate. |
| transportation | mock + http | D3 A-Step 1 plus the later period/ledger rework. `core.transportation_claims`/`core.transportation_claim_deliveries` back a BAST/transportation-fee claim end to end: a claim is created against a period (`YYYY-MM`), not a hand-typed amount; `generateLines` derives its lines from `core.deliveries` in that period, priced from the effective-dated tariff table, and recomputes the footer; status moves through the fixed `draft→submitted→under_review→approved→rejected→paid` set, draft-only delete, with the `paid` transition also collecting `settledAt`/`settledAmount`/`settlementMode`. `getDocument` returns the printable Berita Acara (grouped by delivery date/trip/product, plus the per-delivery line list with drift flags) and `getRecap` the month-by-month claimed/paid/outstanding rollup — both are real endpoints, not client-side aggregation. The console labels the domain "BAST" and "iVendor" throughout even though the schema's own column names stay business-neutral (`handover_reference`, `principal_invoice_number`) per the D3 plan's decision 7. Three gaps in the mock build only, all documented in code: (1) status transitions never post a ledger journal — `AccountRole`/`JournalSourceType` in `src/types/domain.ts` are closed unions that already lag the real backend's roles, and widening them for this one feature is out of scope; (2) `generateTransportationClaimLines` prices every line off two fixed constants (3kg/unit, Rp354.64/kg) rather than a mock tariff table, since the mock's `ProductEntity` carries no weight field; (3) the document's signatory block always reads name/title as absent, since the mock's `SettingsEntity` has no equivalent to the real `iam.tenant_profiles.signatory_name`/`signatory_title` columns. |
| users | mock + http | export and audit trail (no backend endpoint yet) |
| vehicles | mock + http | — |
| ocr | mock only | no backend endpoint yet — no contract/mock/http split |

**A bug found live against the API build, fixed 2026-09-10:** `SettingsPage`
could hang on its loading skeleton forever with no visible error. Root
cause: `useScope()` calls `setActiveScope(scope)` unconditionally on every
render, computed from `tenantRegistry()` — filled asynchronously by the
layout's tenant-list query. Any render where that registry reads
momentarily empty (an HMR module reset while diagnosing this is one way it
was reproduced; the fix is not specific to that cause) wiped the module-level
acting tenant to `""`. Any query building a request path from
`getActingTenant()` synchronously at that instant — `SettingsPage`'s own
`getSettingsDetail` among them — failed with "Tidak ada tenant aktif", and
with this app's `retry: 0` default that failure was permanent, since
nothing re-ran the query once the registry recovered a render later.

Fixed two ways: `mocks/scope.ts`'s `setActiveScope` now refuses to regress
the acting tenant to empty once a real one has been set (the root-cause
fix, mutation-tested in `scope.test.ts`); `SettingsPage.tsx` also now
checks `settings.isError` before its `if (!form)` loading guard, so a
genuine failure — including the residual cold-start case this guard does
*not* cover (the very first render of a session, before any tenant has
ever loaded once) — shows an error with a retry action instead of an
eternal skeleton. Both verified live: reproduced the cold-start error on a
fresh session, confirmed "Coba lagi" recovers cleanly, then verified
`BankSection`'s full create/delete lifecycle inside the now-working page.

A "mock + http" row still throwing on the API build somewhere means an
exception was missed here. Every deliberate gap is named in its adapter file —
most guarded with `assertMockAllowed` so the API build shows the sentence that
explains the gap rather than invented data (`grep -rn assertMockAllowed
src/features`); a few (settings, users) are plain re-exports of a demo-only or
not-yet-built capability, commented in place — never a silent fallback either
way.
