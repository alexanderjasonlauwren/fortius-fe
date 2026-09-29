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

  /**
   * No route returns which invoices a receipt was applied to (see
   * financeApi.http.ts's own header) -- alokasi carries one synthetic line
   * so `.length === 0` still means "nothing applied", the one thing
   * PaymentPage actually branches on, without inventing invoice numbers.
   */
  it("keeps alokasi empty only when nothing has been applied yet", async () => {
    getList.mockResolvedValue({
      items: [paymentWire({ allocated: 0 })],
      pagination: {},
    });
    expect((await financeApiHttp.getPayments())[0].alokasi).toEqual([]);

    getList.mockResolvedValue({
      items: [paymentWire({ allocated: 30_000 })],
      pagination: {},
    });
    expect((await financeApiHttp.getPayments())[0].alokasi).toHaveLength(1);
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

    const journals = await financeApiHttp.getJournals();

    expect(journals).toHaveLength(1);
    expect(getList).toHaveBeenCalledTimes(1);
  });
});

describe("trial balance", () => {
  /**
   * A contra account (sales_returns) shares its account_type with a normal
   * revenue account but increases on the opposite side -- signing every row
   * by account_type alone would show a return as negative revenue reducing
   * the total twice. Reading normal_balance off /accounts is what this
   * exists to get right instead.
   */
  it("signs a contra account's balance using its own normal_balance, not its type", async () => {
    getList.mockResolvedValue({
      items: [
        { id: "a1", code: "4-1000", name: "Penjualan", account_type: "revenue", normal_balance: "cr", is_system: true },
        { id: "a2", code: "4-2000", name: "Retur Penjualan", account_type: "revenue", normal_balance: "dr", is_system: true },
      ],
      pagination: {},
    });
    getOne.mockResolvedValue({
      as_of: "2026-09-01",
      rows: [
        { account_code: "4-1000", account_name: "Penjualan", account_type: "revenue", debit: 0, credit: 1_000_000 },
        { account_code: "4-2000", account_name: "Retur Penjualan", account_type: "revenue", debit: 50_000, credit: 0 },
      ],
      total_debit: 50_000,
      total_credit: 1_000_000,
    });

    const tb = await financeApiHttp.getTrialBalance({ from: "2026-09-01", to: "2026-09-30" });
    const retur = tb.rows.find((r) => r.akun.kode === "4-2000")!;
    // Debit-normal: saldo is debit - credit, positive when it is really a
    // debit balance, not negated the way a naive "revenue is credit-normal"
    // rule would compute it.
    expect(retur.saldo).toBe(50_000);
  });

  it("sends the range's end date as as_of, since the ledger's trial balance is a point in time", async () => {
    getList.mockResolvedValue({ items: [], pagination: {} });
    getOne.mockResolvedValue({ as_of: "2026-09-30", rows: [], total_debit: 0, total_credit: 0 });

    await financeApiHttp.getTrialBalance({ from: "2026-09-01", to: "2026-09-30" });

    expect(getOne.mock.calls[0][0]).toBe("/journals/trial-balance?as_of=2026-09-30");
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
});
