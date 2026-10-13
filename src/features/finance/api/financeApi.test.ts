import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping -- five backend resources folded into the
 * console's existing finance view types, following vehicleApi.test.ts's own
 * pattern for asserting the drift no screen would otherwise reveal.
 */

const getList = vi.fn();
const getOne = vi.fn();
const send = vi.fn();

vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
  upload: vi.fn(),
}));

const getOutletList = vi.fn();
vi.mock("@/features/outlet/api/outletApi", () => ({
  getOutletList: (...args: unknown[]) => getOutletList(...args),
}));

const { financeApiHttp } = await import("./financeApi.http");

const OUTLET_ID = "11111111-1111-4111-8111-111111111111";
const INVOICE_ID = "22222222-2222-4222-8222-222222222222";
const PAYMENT_ID = "33333333-3333-4333-8333-333333333333";

function outlet(overrides: Record<string, unknown> = {}) {
  return {
    id: OUTLET_ID,
    nama: "Pangkalan Ahmad",
    kecamatan: "Sidorejo",
    termin: 14,
    batasKredit: 5_000_000,
    blokirOtomatis: true,
    ...overrides,
  };
}

function journalWire(overrides: Record<string, unknown> = {}) {
  return {
    id: "j-0001",
    journal_number: "JV-0001",
    journal_date: "2026-09-01T00:00:00Z",
    description: "fixture",
    journal_status: "posted",
    lines: [],
    ...overrides,
  };
}

function invoiceWire(overrides: Record<string, unknown> = {}) {
  const today = new Date();
  return {
    id: INVOICE_ID,
    invoice_number: "INV-0001",
    outlet_id: OUTLET_ID,
    delivery_id: "44444444-4444-4444-8444-444444444444",
    lines: [],
    subtotal: 100_000,
    tax_percentage: 0,
    tax_amount: 0,
    total_amount: 100_000,
    amount_paid: 0,
    credit_amount: 0,
    outstanding_amount: 100_000,
    total_qty: 10,
    due_date: today.toISOString(),
    payment_status: "unpaid",
    issued_at: today.toISOString(),
    version: 1,
    created_at: today.toISOString(),
    updated_at: today.toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  send.mockReset();
  getOutletList.mockReset();
  getOutletList.mockResolvedValue([outlet()]);
});

describe("invoice status", () => {
  /**
   * `waived` and `credited` both close the receivable without cash, and
   * neither has its own console status -- both must read as Lunas, the same
   * as `paid`, or a settled invoice would show as still open.
   */
  it("reads waived and credited invoices as Lunas, not as open", async () => {
    getList.mockResolvedValue({
      items: [invoiceWire({ payment_status: "waived", outstanding_amount: 0 })],
      pagination: {},
    });
    const [inv] = await financeApiHttp.getInvoices();
    expect(inv.status).toBe("Lunas");
  });

  it("shows the surat jalan number a delivery invoice bills, and a dash otherwise", async () => {
    getList.mockResolvedValue({
      items: [
        invoiceWire({ delivery_number: "SJ-SLT-20261001-0004" }),
        invoiceWire({ delivery_id: undefined, invoice_type: "other" }),
      ],
      pagination: {},
    });
    const [delivery, other] = await financeApiHttp.getInvoices();
    expect(delivery.suratJalan).toBe("SJ-SLT-20261001-0004");
    expect(other.suratJalan).toBe("—");
  });

  it("maps overdue and partial to their own console statuses", async () => {
    getList.mockResolvedValue({
      items: [invoiceWire({ payment_status: "overdue" })],
      pagination: {},
    });
    expect((await financeApiHttp.getInvoices())[0].status).toBe("Jatuh Tempo");

    getList.mockResolvedValue({
      items: [invoiceWire({ payment_status: "partial" })],
      pagination: {},
    });
    expect((await financeApiHttp.getInvoices())[0].status).toBe("Sebagian");
  });
});

describe("aging", () => {
  /**
   * The bucket boundary mirrors mocks/ar.ts's own agingBucket exactly -- a
   * mismatch here would put an invoice in a different collections bucket
   * than the mock shows for the same age, silently disagreeing with itself
   * across builds.
   */
  it("buckets an overdue invoice by days past due, not by status", async () => {
    const overdue31 = new Date(Date.now() - 31 * 86_400_000).toISOString();
    getList.mockResolvedValue({
      items: [
        invoiceWire({ payment_status: "overdue", due_date: overdue31, outstanding_amount: 50_000 }),
      ],
      pagination: {},
    });
    const [inv] = await financeApiHttp.getInvoices();
    expect(inv.bucket).toBe("31–60 hari");
  });

  /** blokirOtomatis only flags an outlet blocked when it is actually overdue. */
  it("only marks an outlet blocked when it is both auto-block and overdue", async () => {
    const overdue = new Date(Date.now() - 5 * 86_400_000).toISOString();
    getList.mockResolvedValue({
      items: [invoiceWire({ payment_status: "overdue", due_date: overdue, outstanding_amount: 20_000 })],
      pagination: {},
    });
    getOutletList.mockResolvedValue([outlet({ blokirOtomatis: true })]);
    const report = await financeApiHttp.getAgingReport();
    expect(report.rows[0].terblokir).toBe(true);

    getOutletList.mockResolvedValue([outlet({ blokirOtomatis: false })]);
    const report2 = await financeApiHttp.getAgingReport();
    expect(report2.rows[0].terblokir).toBe(false);
  });
});

describe("payments", () => {
  function paymentWire(overrides: Record<string, unknown> = {}) {
    return {
      id: PAYMENT_ID,
      payment_number: "PAY-0001",
      outlet_id: OUTLET_ID,
      amount: 100_000,
      payment_method_id: "55555555-5555-4555-8555-555555555555",
      bank_name: "BCA",
      bank_account_last4: "6789",
      payment_date: "2026-09-01T00:00:00Z",
      payment_status: "pending",
      allocated: 0,
      version: 1,
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      ...overrides,
    };
  }

  /** The plaintext account number never leaves the server -- only the last 4. */
  it("shows the masked account number, never a full one", async () => {
    getList.mockResolvedValue({ items: [paymentWire()], pagination: {} });
    const [p] = await financeApiHttp.getPayments();
    expect(p.noRekening).toBe("•••• 6789");
  });

  /** belumDialokasikan comes straight off the server's own `allocated` total. */
  it("derives the unallocated amount from the server's allocated total", async () => {
    getList.mockResolvedValue({
      items: [paymentWire({ amount: 100_000, allocated: 40_000 })],
      pagination: {},
    });
    const [p] = await financeApiHttp.getPayments();
    expect(p.belumDialokasikan).toBe(60_000);
  });

  /** The receipts list names the invoices each receipt paid, from the
   *  allocation lines the list now returns. */
  it("names the invoices a receipt was applied to, and none when unapplied", async () => {
    getList.mockResolvedValue({
      items: [
        paymentWire({
          allocated: 70_000,
          allocations: [
            { id: "x1", invoice_id: "inv-1", invoice_number: "INV-SLT-0001", amount: 50_000 },
            { id: "x2", invoice_id: "inv-2", invoice_number: "INV-SLT-0002", amount: 20_000 },
          ],
        }),
        paymentWire({ allocated: 0 }),
      ],
      pagination: {},
    });
    const [applied, unapplied] = await financeApiHttp.getPayments();
    expect(applied.alokasi).toEqual([
      { invoiceId: "inv-1", nomor: "INV-SLT-0001", jumlah: 50_000 },
      { invoiceId: "inv-2", nomor: "INV-SLT-0002", jumlah: 20_000 },
    ]);
    expect(unapplied.alokasi).toEqual([]);
  });

  /**
   * payment_status only supports `eq` server-side and the console's tabs are
   * Indonesian labels, not the wire's pending/verified/rejected -- filtering
   * happens here, after the fetch, translating one vocabulary into the other.
   */
  it("filters the Indonesian status tab against the wire's own codes", async () => {
    getList.mockResolvedValue({
      items: [
        paymentWire({ id: "p1", payment_status: "pending" }),
        paymentWire({ id: "p2", payment_status: "verified" }),
      ],
      pagination: {},
    });

    const verified = await financeApiHttp.getPayments("Terverifikasi");
    expect(verified.map((p) => p.id)).toEqual(["p2"]);

    getList.mockResolvedValue({
      items: [
        paymentWire({ id: "p1", payment_status: "pending" }),
        paymentWire({ id: "p2", payment_status: "verified" }),
      ],
      pagination: {},
    });
    const pending = await financeApiHttp.getPayments("Menunggu Verifikasi");
    expect(pending.map((p) => p.id)).toEqual(["p1"]);
  });

  describe("verify and reject", () => {
    it("reads the current version before verifying and sends it back", async () => {
      getOne.mockResolvedValue(paymentWire({ version: 4 }));
      send.mockResolvedValue(paymentWire({ version: 5, payment_status: "verified" }));

      await financeApiHttp.submitPaymentDecision(PAYMENT_ID, "verify");

      const [method, path, body] = send.mock.calls[0];
      expect(method).toBe("post");
      expect(path).toBe(`/payments/${PAYMENT_ID}/verify`);
      expect(body).toEqual({ version: 4 });
    });

    /** ck_payments_rejected requires a reason; an empty one is refused server-side. */
    it("always sends a non-empty rejection reason", async () => {
      getOne.mockResolvedValue(paymentWire({ version: 2 }));
      send.mockResolvedValue(paymentWire({ version: 3, payment_status: "rejected" }));

      await financeApiHttp.submitPaymentDecision(PAYMENT_ID, "reject", "  ");

      const [, , body] = send.mock.calls[0];
      expect(body.reason).toBeTruthy();
    });
  });

  describe("recording a receipt", () => {
    it("resolves bank_transfer as the payment method and reuses the account number as the reference", async () => {
      getList.mockResolvedValue({
        items: [
          { id: "m-cash", code: "cash" },
          { id: "m-transfer", code: "bank_transfer" },
        ],
        pagination: {},
      });
      send.mockResolvedValue(paymentWire());

      await financeApiHttp.submitPayment({
        outletId: OUTLET_ID,
        jumlah: 100_000,
        tanggal: "2026-09-01",
        bank: "BCA",
        noRekening: "1234567890",
      });

      const [, , body] = send.mock.calls[0];
      expect(body.payment_method_id).toBe("m-transfer");
      expect(body.bank_account_number).toBe("1234567890");
      expect(body.bank_reference).toBe("1234567890");
    });

    // RecordPaymentRequest.PaymentDate is a Go time.Time: a bare date was
    // refused live as "Request body is not valid JSON", so no receipt could
    // be recorded at all.
    it("sends payment_date as an RFC 3339 timestamp, not a bare date", async () => {
      getList.mockResolvedValue({ items: [{ id: "m-transfer", code: "bank_transfer" }], pagination: {} });
      send.mockResolvedValue(paymentWire());

      await financeApiHttp.submitPayment({
        outletId: OUTLET_ID,
        jumlah: 100_000,
        tanggal: "2026-10-12",
        bank: "BCA",
        noRekening: "1234567890",
      });

      const [, , body] = send.mock.calls[0];
      expect(body.payment_date).toBe("2026-10-12T00:00:00Z");
    });
  });
});

describe("credit notes", () => {
  // IssueRequest.IssueDate is a Go time.Time — same live failure as payments.
  it("sends issue_date as an RFC 3339 timestamp for today's local date", async () => {
    vi.useFakeTimers();
    // 01:00 WIB on 12 Oct is still 11 Oct in UTC; the note must carry the local date.
    vi.setSystemTime(new Date(2026, 9, 12, 1, 0, 0));
    send.mockResolvedValue({
      id: "cn-1",
      credit_note_number: "CN-0001",
      outlet_id: OUTLET_ID,
      amount: 50_000,
      issue_date: "2026-10-12T00:00:00Z",
      credit_status: "issued",
      reason_code: "billing_correction",
    });

    try {
      await financeApiHttp.submitCreditNote({
        outletId: OUTLET_ID,
        invoiceId: INVOICE_ID,
        jumlah: 50_000,
        alasan: "Selisih harga",
      });
    } finally {
      vi.useRealTimers();
    }

    const [, path, body] = send.mock.calls[0];
    expect(path).toBe("/credit-notes");
    expect(body.issue_date).toBe("2026-10-12T00:00:00Z");
  });
});

describe("journals", () => {
  it("walks every page rather than stopping at the first 100", async () => {
    getList
      .mockResolvedValueOnce({
        items: Array.from({ length: 100 }, (_, i) => journalWire({ id: `p1-${i}` })),
        pagination: { page: 1, page_size: 100, has_next: true, has_prev: false },
      })
      .mockResolvedValueOnce({
        items: Array.from({ length: 30 }, (_, i) => journalWire({ id: `p2-${i}` })),
        pagination: { page: 2, page_size: 100, has_next: false, has_prev: true },
      });
    getOne.mockImplementation((path: string) => journalWire({ id: path.split("/").pop() }));

    const journals = await financeApiHttp.getJournals();

    expect(journals).toHaveLength(130);
    expect(getList).toHaveBeenCalledTimes(2);
    expect(getList.mock.calls[0][1]).toMatchObject({ page: 1 });
    expect(getList.mock.calls[1][1]).toMatchObject({ page: 2 });
  });

  it("stops after one page when the server says there is no next", async () => {
    getList.mockResolvedValueOnce({
      items: [journalWire()],
      pagination: { page: 1, page_size: 100, has_next: false, has_prev: false },
    });
    getOne.mockResolvedValueOnce(journalWire());

    const journals = await financeApiHttp.getJournals();

    expect(journals).toHaveLength(1);
    expect(getList).toHaveBeenCalledTimes(1);
  });

  it("reads each journal's lines and source off the list, with no request per journal", async () => {
    getList.mockResolvedValueOnce({
      items: [
        journalWire({
          id: "j-0001",
          source_type: "purchase",
          source_id: "p-1",
          source_number: "PB-0007",
          lines: [
            { account_id: "a-1", account_code: "1-1311", account_name: "Persediaan", debit: 150_000, credit: 0 },
            { account_id: "a-2", account_code: "2-1000", account_name: "Utang Usaha", debit: 0, credit: 150_000 },
          ],
        }),
      ],
      pagination: { page: 1, page_size: 100, has_next: false, has_prev: false },
    });

    const [journal] = await financeApiHttp.getJournals();

    expect(getOne).not.toHaveBeenCalled();
    expect(journal.lines).toHaveLength(2);
    expect(journal.total).toBe(150_000);
    expect(journal).toMatchObject({ sourceType: "purchase", sourceId: "p-1", sourceNumber: "PB-0007" });
  });

  it("keeps an expense or transport claim journal apart from a manual one", async () => {
    getList.mockResolvedValueOnce({
      items: [
        journalWire({ id: "j-1", source_type: "expense" }),
        journalWire({ id: "j-2", source_type: "transportation_claim" }),
      ],
      pagination: { page: 1, page_size: 100, has_next: false, has_prev: false },
    });
    const journals = await financeApiHttp.getJournals();
    // Read as "manual" these were offered the reverse action, which the
    // backend then refused.
    expect(journals.map((j) => j.sourceType)).toEqual(["expense", "transportationClaim"]);
  });

  describe("manual entry", () => {
    // Caught live: CreateManualJournalRequest.JournalDate is a real Go
    // time.Time, unlike every other date field this adapter sends (asset
    // and depreciation-run requests both declare theirs as a plain
    // validated string) -- a bare "YYYY-MM-DD" fails time.Time's own JSON
    // unmarshal, which the binding layer reports as the generic "Request
    // body is not valid JSON" rather than a field-level error.
    it("sends journal_date as a full RFC3339 timestamp, not a bare date", async () => {
      send.mockResolvedValue(journalWire());
      await financeApiHttp.createManualJournal({
        journalDate: "2026-10-08",
        description: "Koreksi",
        lines: [
          { accountId: "a-1", debit: 50_000, kredit: 0 },
          { accountId: "a-2", debit: 0, kredit: 50_000 },
        ],
      });
      const [, , body] = send.mock.calls[0];
      expect(body.journal_date).toBe("2026-10-08T00:00:00Z");
    });

    it("sends the version to reverse a journal", async () => {
      send.mockResolvedValue(journalWire());
      await financeApiHttp.reverseJournal("j-0001", 2);
      const [method, path, body] = send.mock.calls[0];
      expect(method).toBe("post");
      expect(path).toBe("/journals/j-0001/reverse");
      expect(body).toEqual({ version: 2 });
    });
  });
});

describe("trial balance", () => {
  const row = (code: string, type: string, debit: number, credit: number, role?: string) => ({
    account_id: `id-${code}`, account_code: code, account_name: code, account_type: type, account_role: role,
    opening_debit: 0, opening_credit: 0, debit, credit, closing_debit: debit, closing_credit: credit,
  });
  const totals = { opening_debit: 0, opening_credit: 0, debit: 0, credit: 0, closing_debit: 0, closing_credit: 0 };

  it("asks the statement engine for the whole range, not a point in time", async () => {
    getOne.mockResolvedValue({ rows: [], totals, balanced: true });
    await financeApiHttp.getTrialBalance({ from: "2026-09-01", to: "2026-09-30" });
    expect(getOne.mock.calls[0][0]).toBe(
      "/financial-statements/trial-balance?date_from=2026-09-01&date_to=2026-09-30",
    );
    // The trial balance no longer needs /accounts, which finance_officer
    // cannot read.
    expect(getList).not.toHaveBeenCalled();
  });

  it("keeps opening, movement and closing on their own sides", async () => {
    getOne.mockResolvedValue({
      rows: [{ ...row("1-1000", "asset", 200, 50), opening_debit: 1_000, closing_debit: 1_150, closing_credit: 0 }],
      totals: { ...totals, opening_debit: 1_000, closing_debit: 1_150 },
      balanced: false,
    });
    const tb = await financeApiHttp.getTrialBalance({ from: "2026-09-01", to: "2026-09-30" });
    expect(tb.rows[0]).toMatchObject({
      saldoAwalDebit: 1_000, saldoAwalKredit: 0, debit: 200, kredit: 50,
      saldoAkhirDebit: 1_150, saldoAkhirKredit: 0,
    });
    expect(tb.totals.saldoAkhirDebit).toBe(1_150);
    expect(tb.seimbang).toBe(false);
  });
});

describe("profit and loss from the trial balance", () => {
  const row = (code: string, type: string, debit: number, credit: number, role?: string) => ({
    account_id: `id-${code}`, account_code: code, account_name: code, account_type: type, account_role: role,
    opening_debit: 0, opening_credit: 0, debit, credit, closing_debit: 0, closing_credit: 0,
  });

  it("nets a sales return against revenue and takes only HPP out of gross profit", async () => {
    getOne.mockResolvedValue({
      rows: [
        row("1-1000", "asset", 1_000_000, 0),
        row("4-1000", "revenue", 0, 1_000_000, "revenue"),
        row("4-2000", "revenue", 50_000, 0, "sales_returns"),
        row("5-1000", "expense", 600_000, 0, "cogs"),
        row("5-3100", "expense", 100_000, 0),
      ],
      totals: {}, balanced: true,
    });
    const pl = await financeApiHttp.getProfitAndLoss({ from: "2026-09-01", to: "2026-09-30" });
    expect(pl.totalPendapatan).toBe(950_000);
    expect(pl.pendapatan.find((r) => r.akun.kode === "4-2000")!.saldo).toBe(-50_000);
    expect(pl.labaKotor).toBe(350_000);
    expect(pl.totalBeban).toBe(700_000);
    expect(pl.labaBersih).toBe(250_000);
    // Balance-sheet accounts are not part of the laba rugi.
    expect([...pl.pendapatan, ...pl.beban].some((r) => r.akun.kode === "1-1000")).toBe(false);
  });
});

describe("chart of accounts: create + upgrade (phase P1)", () => {
  it("maps a create-account input to the backend's wire shape", async () => {
    send.mockResolvedValue({
      id: "a9", code: "1-9000", name: "Akun Kustom", account_type: "asset",
      normal_balance: "dr", is_system: false,
    });

    await financeApiHttp.createAccount({
      kode: "1-9000",
      nama: "Akun Kustom",
      tipe: "Aset",
      indukId: "PARENT_ID",
      deskripsi: "Ditambahkan manual",
    });

    expect(send).toHaveBeenCalledWith("post", "/accounts", {
      code: "1-9000",
      name: "Akun Kustom",
      account_type: "asset",
      parent_id: "PARENT_ID",
      description: "Ditambahkan manual",
    });
  });

  it("sends dry_run and maps the upgrade response, defaulting null arrays to empty", async () => {
    send.mockResolvedValue({
      dry_run: true,
      accounts_added: ["1-2100", "1-2900"],
      layouts_added: null,
      conflicts: [{ code: "1-2100", reason: "exists as liability, seed expects asset" }],
    });

    const result = await financeApiHttp.upgradeChart(true);

    expect(send).toHaveBeenCalledWith("post", "/accounts/chart-upgrade", { dry_run: true });
    expect(result).toEqual({
      dryRun: true,
      akunDitambahkan: ["1-2100", "1-2900"],
      layoutDitambahkan: [],
      konflik: [{ kode: "1-2100", alasan: "exists as liability, seed expects asset" }],
    });
  });

  it("defaults dryRun to true when the caller passes nothing", async () => {
    send.mockResolvedValue({ dry_run: true, accounts_added: [], layouts_added: [], conflicts: [] });

    await financeApiHttp.upgradeChart();

    expect(send).toHaveBeenCalledWith("post", "/accounts/chart-upgrade", { dry_run: true });
  });

  // Caught live posting a manual journal to "5-4000 Beban Umum dan
  // Administrasi", a grouping header still selectable because `induk` was
  // never resolved from the wire's `parent_id` (gap-closing plan, Phase E) --
  // leafAccounts() silently excluded nothing against the real API.
  it("resolves induk from the parent's own code, not left undefined", async () => {
    getList.mockResolvedValue({
      items: [
        { id: "p1", code: "5-4000", name: "Beban Umum dan Administrasi", account_type: "expense", normal_balance: "dr", is_system: true },
        { id: "c1", code: "5-4100", name: "Gaji Pokok Staff", account_type: "expense", normal_balance: "dr", is_system: true, parent_id: "p1" },
      ],
      pagination: {},
    });
    getOne.mockResolvedValue({ as_of: "2026-10-08", rows: [], total_debit: 0, total_credit: 0 });

    const rows = await financeApiHttp.getChartOfAccounts();

    expect(rows.find((r) => r.akun.kode === "5-4000")?.akun.induk).toBeUndefined();
    expect(rows.find((r) => r.akun.kode === "5-4100")?.akun.induk).toBe("5-4000");
  });
});
