/**
 * Permission codes, in the backend's vocabulary.
 *
 * These values used to be the console's own invention — `sa:view`,
 * `payments:verify` — while the backend authorises on `module.action.resource`
 * codes seeded from `seeds/03-permissions/catalogue.go`. Two vocabularies for
 * one concept: the console could gate a button on `sa:view` while the route it
 * calls required `distribution.read.schedule_agreements`, and nothing connected
 * the two. It went unnoticed only because the console had never authenticated
 * against the backend.
 *
 * The backend's codes win, and there is no translation table. A map between two
 * vocabularies has to be maintained by whoever adds the next permission, in a
 * file they have no reason to open, and the failure when they forget is a menu
 * item that answers 403.
 *
 * **Changing a value here is a real change.** Every guard reads these constants
 * — nowhere in the console writes a permission string literal — so a wrong value
 * hides a feature from everyone rather than breaking a build.
 *
 * @see seeds/03-permissions/catalogue.go — the catalogue these must match
 */
export const PERMISSIONS = {
  // Users — the `iam` module, which on the backend is both a schema and an
  // RBAC grouping by coincidence.
  USERS_VIEW: "iam.read.users",
  USERS_CREATE: "iam.create.users",
  USERS_EDIT: "iam.update.users",
  USERS_DELETE: "iam.delete.users",
  USER_ROLES_VIEW: "iam.read.user_roles",

  // Products. `masterdata` spans products, outlets, drivers, vehicles and
  // units — grouped for the person granting access, not by schema.
  PRODUCTS_VIEW: "masterdata.read.products",
  PRODUCTS_CREATE: "masterdata.create.products",
  PRODUCTS_EDIT: "masterdata.update.products",
  PRODUCTS_DELETE: "masterdata.delete.products",

  // Live SIM3LON integration (proof-of-integration page). Read-only; the
  // backend additionally restricts it to SPBE tenants, which is a property of
  // the tenant rather than of this grant, so it is not expressible here.
  INTEGRATION_SIM3LON_VIEW: "integration.read.sim3lon",

  // Schedule Agreements
  SA_VIEW: "distribution.read.schedule_agreements",
  SA_CREATE: "distribution.create.schedule_agreements",
  SA_EDIT: "distribution.update.schedule_agreements",
  // Bulk-replacing a month of obligations from a spreadsheet. Deliberately not
  // create.schedule_agreements: whoever may sign an agreement is not
  // necessarily whoever may re-import one over the top of it.
  SA_IMPORT: "distribution.import.schedule_agreements",
  // The branch go-live date. It rewrites every affected Base quota's opening
  // balance, so it is its own authority rather than riding on import.
  SA_PLANNING_CUTOVER: "distribution.update.planning_cutovers",

  // Distribution planning
  DISTRIBUTION_VIEW: "distribution.read.distribution_orders",
  DISTRIBUTION_CREATE: "distribution.create.distribution_orders",
  DISTRIBUTION_EDIT: "distribution.update.distribution_orders",
  /**
   * Signing a plan off, which the backend treats as an approval rather than an
   * edit: a planner builds the day and a supervisor commits the agency to it.
   * Cancelling is an edit and rides on DISTRIBUTION_EDIT — it returns quota to
   * the agreement, which is a change to a document the planner owns.
   */
  DISTRIBUTION_APPROVE: "distribution.approve.distribution_orders",

  // Payments
  PAYMENTS_VIEW: "finance.read.payments",
  PAYMENTS_CREATE: "finance.create.payments",
  PAYMENTS_VERIFY: "finance.verify.payments",
  /** Rejecting a pending receipt, and voiding a verified one -- the same
   *  backend action (POST /payments/:id/reject) reverses its journal. */
  PAYMENTS_REJECT: "finance.reject.payments",

  // Invoices and the general ledger. Reports composes /deliveries,
  // /payments and /invoices with no dedicated permission of its own (the
  // catalogue's own header names why: a permission guarding nothing is
  // worse than a missing one), and is gated on this one as representative
  // -- ops_manager holds it and must see the page. The ledger reads the
  // journal itself, which only finance_officer and tenant_admin hold.
  INVOICES_VIEW: "finance.read.invoices",
  /**
   * Raising a "Buat tagihan" (registration or other) invoice by hand --
   * financial-statements plan P5 / gap-closing phase, Phase C. The
   * backend's own routes.go gates POST /invoices/manual on this same
   * code, not a separate one: a manual invoice is still finance.create
   * on the invoices resource, just a second creation path.
   */
  INVOICES_CREATE: "finance.create.invoices",
  INVOICES_EXPORT: "finance.export.invoices",
  /** Voiding a manual invoice raised in error -- reverses its journals
   *  (accounting parity P3). A separate action from create on purpose. */
  INVOICES_VOID: "finance.void.invoices",
  /** Credit notes -- read here only to gate their attachments so far
   *  (accounting parity P2); the credit note list arrives in P3. */
  CREDIT_NOTES_VIEW: "finance.read.credit_notes",
  CREDIT_NOTES_CREATE: "finance.create.credit_notes",
  /** Cancelling an issued credit note. */
  CREDIT_NOTES_UPDATE: "finance.update.credit_notes",
  /** Landing a credit note on its invoice -- what actually reduces it. */
  CREDIT_NOTES_APPROVE: "finance.approve.credit_notes",
  JOURNALS_VIEW: "finance.read.journals",
  /**
   * "Jurnal umum" manual entry, and the "Balik jurnal" reversal that rides
   * on the same code (gap-closing plan, Phase E): the backend's own
   * routes.go gates both POST /journals and POST /journals/:id/reverse on
   * finance.create.journals, not a separate permission for each. Stays
   * tenant_admin-only -- finance_officer holds only JOURNALS_VIEW, the
   * same tier the chart of accounts does.
   */
  JOURNALS_CREATE: "finance.create.journals",

  /**
   * Registration package templates (financial-statements plan P5 / gap-
   * closing phase, Phase C): what a "Pendaftaran Pangkalan" invoice picks
   * a fee/kit-item set from. finance_officer holds only the read grant;
   * defining or renaming a template is tenant_admin-only.
   */
  REGISTRATION_PACKAGES_VIEW: "finance.read.registration_packages",
  REGISTRATION_PACKAGES_CREATE: "finance.create.registration_packages",
  REGISTRATION_PACKAGES_UPDATE: "finance.update.registration_packages",

  // The reconciliation ledger (Daftar Penjualan, formerly Rekap Transaksi) is its own real resource,
  // backed by GET /transactions -- unlike Reports, this one has a single
  // endpoint and so a single, dedicated permission to gate on.
  TRANSACTIONS_VIEW: "finance.read.transactions",
  TRANSACTIONS_EXPORT: "finance.export.transactions",

  // BAST / transportation-fee claims (D3 A-Step 1). Plain CRUD -- the
  // status-transition action rides on the update permission, since it
  // records what the agent read off an external portal rather than an
  // internal approval a distinct authority level should gate.
  TRANSPORTATION_CLAIMS_VIEW: "distribution.read.transportation_claims",
  TRANSPORTATION_CLAIMS_CREATE: "distribution.create.transportation_claims",
  TRANSPORTATION_CLAIMS_EDIT: "distribution.update.transportation_claims",
  TRANSPORTATION_CLAIMS_DELETE: "distribution.delete.transportation_claims",

  // Operational costs and petty cash (D3 A-Step 4).
  EXPENSES_VIEW: "distribution.read.expenses",
  EXPENSES_CREATE: "distribution.create.expenses",
  EXPENSES_APPROVE: "distribution.approve.expenses",
  /** Voiding an approved expense reverses its journal (accounting parity P3). */
  EXPENSES_VOID: "distribution.void.expenses",
  OCR_CREATE: "ocr.create.ocr_inbox",
  OCR_VIEW: "ocr.read.ocr_extractions",
  OCR_VERIFY: "ocr.create.ocr_verifications",
  OCR_ARCHIVE_VIEW: "ocr.read.ocr_archive",
  /**
   * The chart of accounts itself, distinct from reading the journals posted
   * against it. Confirmed live: finance_officer holds finance.read.journals
   * but not this -- only tenant_admin does -- so LedgerPage's "Bagan akun"
   * tab needs its own gate, not the page-level JOURNALS_VIEW one.
   */
  ACCOUNTS_VIEW: "finance.read.accounts",
  /**
   * Adding to the chart -- a plain sub-account by hand, or the chart-v2
   * upgrade (financial-statements plan, phase P1), which only ever adds.
   */
  ACCOUNTS_CREATE: "finance.create.accounts",
  /**
   * The generated statements themselves (Laba Rugi, Neraca, Penjelasan
   * Akun, Buku Besar) -- financial-statements plan, phase P2. Granted
   * alongside JOURNALS_VIEW to tenant_admin and finance_officer, since
   * every figure is already visible to both roles via the journals it is
   * computed from.
   */
  FINANCIAL_STATEMENTS_VIEW: "finance.read.financial_statements",
  FINANCIAL_STATEMENTS_EXPORT: "finance.export.financial_statements",
  /**
   * The report pack under Laporan (accounting parity P5): aging, sales,
   * purchases, expenses, cash flow, bank and asset summaries. Its own
   * resource on the backend, granted to tenant_admin and finance_officer.
   * Named FINANCE_REPORTS_* because REPORTS_VIEW was once a console-only code
   * with another meaning (see the console-only block below).
   */
  FINANCE_REPORTS_VIEW: "finance.read.reports",
  FINANCE_REPORTS_EXPORT: "finance.export.reports",
  /**
   * Imported comparison books (Komparasi) -- financial-statements plan
   * P8/gap-closing phase A. finance_officer holds only the read grant;
   * importing/correcting/deleting a book is tenant_admin-only.
   */
  EXTERNAL_STATEMENTS_VIEW: "finance.read.external_statements",
  EXTERNAL_STATEMENTS_CREATE: "finance.create.external_statements",
  EXTERNAL_STATEMENTS_UPDATE: "finance.update.external_statements",
  EXTERNAL_STATEMENTS_DELETE: "finance.delete.external_statements",
  /** Keterangan, editable inline on a Komparasi row. */
  STATEMENT_NOTES_UPDATE: "finance.update.statement_notes",

  /**
   * Kas & Bank vouchers (financial-statements plan P4.1/gap-closing phase
   * Phase B): kas masuk/keluar/transfer, draft -> posted -> void. Post and
   * void both ride on approve -- see the backend's own
   * internal/controller/cashvoucher/routes.go comment for why.
   */
  CASH_VOUCHERS_VIEW: "finance.read.cash_vouchers",
  CASH_VOUCHERS_CREATE: "finance.create.cash_vouchers",
  CASH_VOUCHERS_UPDATE: "finance.update.cash_vouchers",
  CASH_VOUCHERS_APPROVE: "finance.approve.cash_vouchers",
  /**
   * Rekening koran import, auto-match and manual classification
   * (financial-statements plan P4.2). Both ride on update -- the backend's
   * own routes.go treats resolving a line as editing the import's state,
   * not a distinct authority.
   */
  BANK_STATEMENTS_VIEW: "finance.read.bank_statements",
  BANK_STATEMENTS_IMPORT: "finance.import.bank_statements",
  BANK_STATEMENTS_CLASSIFY: "finance.update.bank_statements",
  BANK_STATEMENT_RULES_VIEW: "finance.read.bank_statement_rules",
  BANK_STATEMENT_RULES_CREATE: "finance.create.bank_statement_rules",
  BANK_STATEMENT_RULES_UPDATE: "finance.update.bank_statement_rules",

  /**
   * The asset register and its monthly depreciation run (financial-
   * statements plan P6 / gap-closing plan Phase D). Void rides on update --
   * a run has no draft to approve into existence, so the only later
   * authority is "undo this", the same reasoning the backend's own
   * internal/controller/depreciationrun/routes.go comment gives.
   */
  ASSETS_VIEW: "finance.read.assets",
  ASSETS_CREATE: "finance.create.assets",
  ASSETS_UPDATE: "finance.update.assets",
  DEPRECIATION_RUNS_VIEW: "finance.read.depreciation_runs",
  DEPRECIATION_RUNS_CREATE: "finance.create.depreciation_runs",
  DEPRECIATION_RUNS_UPDATE: "finance.update.depreciation_runs",

  /**
   * Fiscal-year close/reopen and the opening-balance wizard (financial-
   * statements plan P7.1/P7.2 / gap-closing plan Phase E). The opening-
   * balance wizard rides on these same two codes rather than ones of its
   * own -- the backend's own internal/controller/openingbalance/routes.go
   * comment: Preview needs only read, Commit needs create, since the
   * wizard is a one-time precursor to the same operation closing a year
   * is. Reopen stays tenant_admin-only, same as close -- neither of these
   * is granted to finance_officer at all (read-only tier, same as
   * assets/depreciation_runs above).
   */
  FISCAL_YEARS_VIEW: "finance.read.fiscal_years",
  FISCAL_YEARS_CLOSE: "finance.create.fiscal_years",
  FISCAL_YEARS_REOPEN: "finance.update.fiscal_years",
  /**
   * The monthly period lock (accounting parity P7, §16). Update moves a
   * month between open, review and closed -- and is also what lets someone
   * post into a month under review.
   */
  ACCOUNTING_PERIODS_VIEW: "finance.read.accounting_periods",
  ACCOUNTING_PERIODS_UPDATE: "finance.update.accounting_periods",
  /** Stock on hand at moving average, opening stock, stock counts (P7, §8.1). */
  /** Transport-fee rates per product (masterdata), priced per tabung or per kg. */
  TRANSPORT_TARIFFS_VIEW: "masterdata.read.transport_fee_tariffs",
  TRANSPORT_TARIFFS_CREATE: "masterdata.create.transport_fee_tariffs",
  INVENTORY_VIEW: "finance.read.inventory",
  INVENTORY_CREATE: "finance.create.inventory",
  // Client answer 5 (2026-10-18): voids and refunds of overpaid receipts go
  // through a second person's approval. CREATE asks (plus the document's own
  // void permission); APPROVE decides, never one's own request.
  VOID_REQUESTS_VIEW: "finance.read.void_requests",
  VOID_REQUESTS_CREATE: "finance.create.void_requests",
  VOID_REQUESTS_APPROVE: "finance.approve.void_requests",
  PAYMENT_REFUNDS_VIEW: "finance.read.payment_refunds",
  PAYMENT_REFUNDS_CREATE: "finance.create.payment_refunds",
  PAYMENT_REFUNDS_APPROVE: "finance.approve.payment_refunds",

  /**
   * Sub-ledger admin (gap-closing plan, Phase F) -- verified against the
   * backend's own seeds/04-role-permissions/seeder.go rather than guessed.
   * Expense categories' own READ is granted broadly (every role that can
   * file or approve an expense needs to pick one: ops_manager, dispatcher,
   * warehouse_staff, finance_officer, tenant_admin); its write actions stay
   * tenant_admin-only, the same tier as the chart of accounts itself.
   * Suppliers (vendors) follow the identical shape: finance_officer may
   * only read the list to pick one on a purchase, never create/rename one.
   * Purchases' own read/create/verify are finance_officer + tenant_admin;
   * `finance.update.purchases` exists in the catalogue but no route uses
   * it yet, so no UPDATE constant here.
   */
  EXPENSE_CATEGORIES_VIEW: "finance.read.expense_categories",
  EXPENSE_CATEGORIES_CREATE: "finance.create.expense_categories",
  EXPENSE_CATEGORIES_UPDATE: "finance.update.expense_categories",
  EXPENSE_CATEGORIES_DELETE: "finance.delete.expense_categories",
  /** The tenant's kas and bank accounts, under Kas & Bank › Rekening. */
  BANK_ACCOUNTS_VIEW: "masterdata.read.bank_accounts",
  SUPPLIERS_VIEW: "finance.read.suppliers",
  SUPPLIERS_CREATE: "finance.create.suppliers",
  SUPPLIERS_UPDATE: "finance.update.suppliers",
  SUPPLIERS_DELETE: "finance.delete.suppliers",
  PURCHASES_VIEW: "finance.read.purchases",
  PURCHASES_CREATE: "finance.create.purchases",
  PURCHASES_VERIFY: "finance.verify.purchases",
  /** Voiding a vendor bill, or one payment on it (accounting parity P3). */
  PURCHASES_VOID: "finance.void.purchases",

  // Delivery execution — what happens at the drop, recorded by whoever is
  // there. Executing is an update to the delivery row, not a verb of its own.
  DELIVERIES_VIEW: "distribution.read.deliveries",
  DELIVERIES_EXECUTE: "distribution.update.deliveries",
  // Dispatching a run is a create — one surat jalan per stop it carries.
  // Distinct from EXECUTE, which is the driver's own filing against a
  // delivery already issued.
  DELIVERIES_CREATE: "distribution.create.deliveries",
  /**
   * The second, distinct approver on a credit-limit dispatch override
   * (D3 A-Step 2/3). Not a gate on any button here — the acting dispatcher
   * only needs DELIVERIES_CREATE; this authority belongs to whoever is
   * NAMED as the second approver, and the backend is what checks they hold
   * it. Kept as a real constant anyway, matching the backend catalogue
   * 1:1, so a future screen filtering the approver picker has the right
   * code to check rather than inventing one.
   */
  DELIVERIES_OVERRIDE: "distribution.override.deliveries",

  // What a driver files against a drop they are standing at -- a photo and a
  // signature, distinct from EXECUTE which is the delivery row's own status.
  DELIVERY_PROOFS_VIEW: "distribution.read.delivery_proofs",
  DELIVERY_PROOFS_CREATE: "distribution.create.delivery_proofs",

  // Drivers. Assigning one to a run edits the plan, not the driver, which is
  // why ASSIGN and MANAGE point at different resources.
  DRIVERS_VIEW: "masterdata.read.drivers",
  DRIVERS_ASSIGN: "distribution.update.distribution_orders",
  DRIVERS_MANAGE: "masterdata.update.drivers",

  // The fleet is its own resource, with its own permissions, because the
  // service keeps drivers and vehicles apart -- the pairing belongs to a run.
  VEHICLES_VIEW: "masterdata.read.vehicles",
  VEHICLES_MANAGE: "masterdata.update.vehicles",

  // Orders. Distinct from distribution_orders on the backend: an order is what
  // an outlet asks for, a distribution order is the day's plan.
  ORDERS_VIEW: "distribution.read.orders",
  ORDERS_CREATE: "distribution.create.orders",
  ORDERS_EDIT: "distribution.update.orders",
  ORDERS_DELETE: "distribution.delete.orders",

  // Outlets are their own masterdata resource on the backend, and until now
  // the console had no constant for them: all four outlet routes were gated on
  // masterdata.*.products. A dispatcher granted outlets and not products --
  // which is exactly what a dispatcher is -- was refused a page they were
  // entitled to, and the monitoring board's own deep links to an outlet were
  // dead ends for the board's primary user.
  OUTLETS_VIEW: "masterdata.read.outlets",
  OUTLETS_EDIT: "masterdata.update.outlets",

  // Surat Peringatan history (D3 A-Step 3) -- an append-only log, so there is
  // no EDIT/DELETE to pair with these: a warning is corrected by issuing a
  // new entry, not editing one already handed to the outlet.
  OUTLET_WARNINGS_VIEW: "masterdata.read.outlet_warnings",
  OUTLET_WARNINGS_CREATE: "masterdata.create.outlet_warnings",

  // Live telemetry. Read is operations watching the map; there is no console
  // constant for create, because writing a position belongs to the driver's
  // own device and the console never asks for it.
  //
  // The monitoring board requires this AND deliveries read, because the board
  // carries where a named person is right now. A role holding only deliveries
  // read -- warehouse_staff, finance_officer, auditor_viewer -- must not be
  // shown the page, or they meet a 403 the nav promised would work.
  GPS_TRACKS_VIEW: "distribution.read.gps_tracks",
  // Filing a position is the driver's own device pinging in, distinct from
  // reading the board above -- see the backend catalogue's own note on
  // distribution.create.gps_tracks.
  GPS_TRACKS_CREATE: "distribution.create.gps_tracks",

  // Stock movements: read is the warehouse board, create is what a driver or
  // warehouse_staff files when stock leaves or returns with a run. No console
  // page reads this yet -- kept for usesDriverConsole (layouts/nav.ts) to
  // recognise the driver role's own grant without a bare string literal.
  STOCK_MOVEMENTS_VIEW: "inventory.read.stock_movements",
  STOCK_MOVEMENTS_CREATE: "inventory.create.stock_movements",

  // Geofencing. Rules are the fences themselves; alerts are the breaches
  // recorded against them, and acknowledging one is an update to the alert.
  GEOFENCE_VIEW: "distribution.read.geofence_rules",
  GEOFENCE_EDIT: "distribution.update.geofence_rules",
  GEOFENCE_CREATE: "distribution.create.geofence_rules",
  GEOFENCE_DELETE: "distribution.delete.geofence_rules",
  GEOFENCE_ALERTS_VIEW: "distribution.read.geofence_alerts",
  GEOFENCE_ALERTS_ACK: "distribution.update.geofence_alerts",

  // Settings edits the tenant, which is what the settings page writes.
  SETTINGS_VIEW: "iam.read.tenants",
  SETTINGS_EDIT: "iam.update.tenants",

  // The bell icon. Ungated in the nav (BOTTOM_NAV) since every seeded role
  // holds it -- kept as a real constant for usesDriverConsole (layouts/nav.ts)
  // rather than a bare string literal there.
  NOTIFICATIONS_VIEW: "notification.read.notifications",

  // ---------------------------------------------------------------------
  // Console-only, because the backend has no code for them yet.
  //
  // The `console.` prefix is deliberate and is a to-do list, not a design. No
  // backend role grants these, so against the API the features they guard stay
  // hidden — which is correct, because the routes behind them do not exist
  // either. The mock grants them so the demo is complete.
  //
  // Empty as of the finance ledger landing: REPORTS_VIEW and REPORTS_EXPORT
  // were the last two entries here, gating LedgerPage, ReportsPage and
  // TransactionListPage on a code no backend role could ever hold. They are
  // replaced above by INVOICES_VIEW, INVOICES_EXPORT and JOURNALS_VIEW, which
  // the catalogue actually defines. Leave this block in place, empty, as the
  // to-do list it is -- the next console-only code goes here, not invented
  // elsewhere.
  // ---------------------------------------------------------------------
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Codes the backend does not define, so nothing can grant them over HTTP.
 *
 * Exported so the mock can grant exactly this set and a test can assert the
 * list shrinks rather than grows.
 */
export const CONSOLE_ONLY_PERMISSIONS: readonly string[] = Object.values(
  PERMISSIONS,
).filter((code) => code.startsWith("console."));
