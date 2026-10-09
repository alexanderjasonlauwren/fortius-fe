import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The catalogue's mapping against the real API -- specifically the three
 * compromises this adapter makes because the backend's product module is a
 * catalogue, not a stock/pricing module (see contract.ts's own header):
 * "ukuran" round-trips through weight_kg, every create defaults to the
 * tenant's first category, and stock-dependent figures are flagged
 * unavailable rather than reported as zero.
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

const { productApiHttp } = await import("./productApi.http");

const ID = "11111111-1111-4111-8111-111111111111";

function wire(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    code: "LPG-003",
    name: "LPG 3 Kg Subsidi",
    category: "subsidi",
    category_name: "Subsidi",
    weight_kg: 3,
    min_stock: 20,
    current_sell_price: 22000,
    status: "atv",
    version: 1,
    created_at: "2026-01-05T02:00:00Z",
    updated_at: "2026-08-30T02:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  send.mockReset();
});

describe("reading", () => {
  it("flags stock unavailable rather than reporting zero as real", async () => {
    getOne.mockResolvedValue(wire());
    const p = await productApiHttp.getProductDetail(ID);
    expect(p.stokTersedia).toBe(false);
    expect(p.hargaJual).toBe(22000);
  });

  it("reads cost price and margin from the response", async () => {
    getOne.mockResolvedValue(
      wire({ current_cost_price: 18000, margin: 4000, margin_percent: 18.18 }),
    );
    const p = await productApiHttp.getProductDetail(ID);
    expect(p.hargaBeli).toBe(18000);
    expect(p.margin).toBe(4000);
    expect(p.marginPersen).toBe(18.18);
  });

  it("reads margin as 0 when the backend has not priced both tiers yet", async () => {
    getOne.mockResolvedValue(wire({ current_cost_price: undefined, margin: undefined }));
    const p = await productApiHttp.getProductDetail(ID);
    expect(p.hargaBeli).toBe(0);
    expect(p.margin).toBe(0);
  });

  it("formats ukuran from weight_kg", async () => {
    getOne.mockResolvedValue(wire({ weight_kg: 5.5 }));
    expect((await productApiHttp.getProductDetail(ID)).ukuran).toBe("5.5 kg");
  });

  it("reads a product with no current price as zero, not undefined", async () => {
    getOne.mockResolvedValue(wire({ current_sell_price: undefined }));
    expect((await productApiHttp.getProductDetail(ID)).hargaJual).toBe(0);
  });

  /**
   * total/aktif are real counts off the catalogue -- only stokRendah and
   * nilaiStok are unavailable. A build once hardcoded the whole summary to
   * zero, which made "3 produk terdaftar" read as "0" on a real catalogue.
   */
  it("counts real products even though stock figures are unavailable", async () => {
    getList.mockResolvedValue({
      items: [wire({ id: "1", status: "atv" }), wire({ id: "2", status: "ina" })],
    });
    const s = await productApiHttp.getStockSummary();
    expect(s.total).toBe(2);
    expect(s.aktif).toBe(1);
    expect(s.stokTersedia).toBe(false);
  });

  it("maps status atv/ina to aktif", async () => {
    getOne.mockResolvedValue(wire({ status: "ina" }));
    expect((await productApiHttp.getProductDetail(ID)).aktif).toBe(false);
  });

  it("maps product_kind, defaulting an absent one to commodity", async () => {
    getOne.mockResolvedValue(wire({ product_kind: "accessory" }));
    expect((await productApiHttp.getProductDetail(ID)).productKind).toBe("accessory");
    getOne.mockResolvedValue(wire({ product_kind: undefined }));
    expect((await productApiHttp.getProductDetail(ID)).productKind).toBe("commodity");
  });
});

describe("writing", () => {
  /**
   * The form's own hint claims a blank code is "dibuat otomatis" (generated
   * automatically) -- true for the mock, and a real 422 from the server
   * without this fix, since `code` is required there. A build once sent an
   * empty string and let the form's own promise turn into an error toast.
   */
  it("generates a code when the form leaves it blank, honouring its own hint", async () => {
    getOne.mockResolvedValue([{ code: "subsidi", name: "Subsidi", sort_order: 0 }]);
    send.mockResolvedValue(wire());

    await productApiHttp.createOrUpdateProduct({
      kode: "",
      nama: "LPG Test 12 Kg",
      ukuran: "12 kg",
      stokMinimum: 0,
    });

    const code = send.mock.calls[0][2].code as string;
    expect(code.length).toBeGreaterThan(0);
    expect(code).not.toBe("");
  });

  it("parses the leading number out of a free-text ukuran back to weight_kg", async () => {
    send.mockResolvedValue(wire());
    getOne.mockResolvedValue([{ code: "subsidi", name: "Subsidi", sort_order: 0 }]);

    await productApiHttp.createOrUpdateProduct({
      kode: "LPG-005",
      nama: "LPG 5.5 Kg",
      ukuran: "5.5kg",
      stokMinimum: 10,
    });

    expect(send.mock.calls[0][2].weight_kg).toBe(5.5);
  });

  it("refuses a size with no number rather than silently writing 0kg", async () => {
    await expect(
      productApiHttp.createOrUpdateProduct({
        kode: "X",
        nama: "X",
        ukuran: "besar",
        stokMinimum: 0,
      }),
    ).rejects.toThrow(/angka berat/);
  });

  // Caught live creating an accessory product (gap-closing plan, Phase F):
  // an accessory has no weight of its own, so the form's Ukuran field is
  // left blank -- "" is what gets sent, not "not provided", and this used
  // to throw the same "angka berat" error a genuine typo should.
  it("creates an accessory with a blank ukuran, sending no weight_kg at all", async () => {
    getOne.mockResolvedValue([{ code: "subsidi", name: "Subsidi", sort_order: 0 }]);
    send.mockResolvedValue(wire({ product_kind: "accessory" }));

    await productApiHttp.createOrUpdateProduct({
      kode: "GLOVE-001",
      nama: "Sarung Tangan Kerja",
      ukuran: "",
      stokMinimum: 0,
      productKind: "accessory",
    });

    expect(send.mock.calls[0][2].weight_kg).toBeUndefined();
  });

  // Caught live immediately after the fix above: re-saving that SAME
  // accessory failed again, because its own detail reads ukuran back as
  // toUkuran(0) === "0 kg" -- truthy, so the first fix's `input.ukuran ?`
  // check let it straight through to parseWeightKg, which refuses 0 same
  // as any other non-positive number. Skipping by productKind, not by
  // string emptiness, is what actually closes this for every save after
  // the first.
  it("never parses weight for an accessory, even when ukuran round-trips as a non-empty \"0 kg\"", async () => {
    getOne.mockResolvedValue(wire({ id: ID, product_kind: "accessory", weight_kg: 0 }));
    send.mockResolvedValue(wire({ product_kind: "accessory" }));

    await productApiHttp.createOrUpdateProduct({
      id: ID,
      nama: "Sarung Tangan Kerja",
      ukuran: "0 kg",
      stokMinimum: 0,
      productKind: "accessory",
    });

    expect(send.mock.calls[0][2].weight_kg).toBeUndefined();
  });

  it("defaults a create to the tenant's first product category", async () => {
    getOne.mockResolvedValue([
      { code: "non_subsidi", name: "Non-Subsidi", sort_order: 1 },
      { code: "subsidi", name: "Subsidi", sort_order: 0 },
    ]);
    send.mockResolvedValue(wire());

    await productApiHttp.createOrUpdateProduct({
      kode: "LPG-009",
      nama: "LPG 9 Kg",
      ukuran: "9 kg",
      stokMinimum: 5,
    });

    expect(send.mock.calls[0][2].category).toBe("non_subsidi");
  });

  it("reads the version before updating and sends it back", async () => {
    getOne.mockResolvedValue(wire({ version: 4 }));
    send.mockResolvedValue(wire({ version: 5 }));

    await productApiHttp.createOrUpdateProduct({
      id: ID,
      kode: "LPG-003",
      nama: "LPG 3 Kg Subsidi",
      ukuran: "3 kg",
      stokMinimum: 20,
    });

    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("put");
    expect(path).toBe(`/products/${ID}`);
    expect(body.version).toBe(4);
  });

  /** ProductListPage only offers "Sesuaikan stok" when stokTersedia is true,
   *  so reaching this in practice is already a bug elsewhere. */
  it("refuses a stock adjustment -- core.stock_levels has no service in this build", async () => {
    await expect(productApiHttp.changeStock(ID, 10, "test")).rejects.toThrow(/belum tersedia/);
  });

  // Gap-closing plan, Phase F: the account-override fields round-trip as
  // codes (what ProductResponse hands back), resolved to ids only here,
  // against leaf accounts only -- the same live-caught gap leafAccounts()
  // closed for the manual journal/invoice/asset/cash-voucher pickers.
  describe("account overrides", () => {
    const PARENT_ID = "aaaaaaaa-0000-4000-8000-000000000001";
    const LEAF_ID = "bbbbbbbb-0000-4000-8000-000000000002";

    function stubChartOfAccounts() {
      getList.mockImplementation((path: string) => {
        if (path === "/accounts") {
          return Promise.resolve({
            items: [
              { id: PARENT_ID, code: "5-4000", name: "Beban Umum", account_type: "expense", normal_balance: "dr", is_system: true },
              { id: LEAF_ID, code: "5-4100", name: "Gaji Pokok Staff", account_type: "expense", normal_balance: "dr", is_system: true, parent_id: PARENT_ID },
            ],
            pagination: {},
          });
        }
        return Promise.resolve({ items: [], pagination: {} });
      });
      getOne.mockImplementation((path: string) => {
        if (path === "/journals/trial-balance") {
          return Promise.resolve({ as_of: "2026-10-09", rows: [], total_debit: 0, total_credit: 0 });
        }
        return Promise.resolve([{ code: "subsidi", name: "Subsidi", sort_order: 0 }]);
      });
    }

    it("resolves a leaf account's own code to its id", async () => {
      stubChartOfAccounts();
      send.mockResolvedValue(wire());

      await productApiHttp.createOrUpdateProduct({
        kode: "LPG-010", nama: "LPG 10 Kg", ukuran: "10 kg", stokMinimum: 0,
        cogsAccountCode: "5-4100",
      });

      expect(send.mock.calls[0][2].cogs_account_id).toBe(LEAF_ID);
    });

    it("refuses a parent/grouping account's code", async () => {
      stubChartOfAccounts();
      send.mockResolvedValue(wire());

      await expect(
        productApiHttp.createOrUpdateProduct({
          kode: "LPG-011", nama: "LPG 11 Kg", ukuran: "11 kg", stokMinimum: 0,
          cogsAccountCode: "5-4000",
        }),
      ).rejects.toThrow(/tidak ditemukan|leaf/);
    });
  });

  describe("pricing", () => {
    it("posts a pricing row per tier when creating with prices set", async () => {
      getOne
        .mockResolvedValueOnce([{ code: "subsidi", name: "Subsidi", sort_order: 0 }])
        .mockResolvedValueOnce(wire({ current_cost_price: 10000, current_sell_price: 15000 }));
      send.mockResolvedValue(wire());

      await productApiHttp.createOrUpdateProduct({
        kode: "LPG-010",
        nama: "LPG 10 Kg",
        ukuran: "10 kg",
        stokMinimum: 0,
        hargaBeli: 10000,
        hargaJual: 15000,
      });

      const pricingCalls = send.mock.calls.filter(([, path]) => String(path).endsWith("/pricing"));
      expect(pricingCalls).toHaveLength(2);
      const tiers = pricingCalls.map(([, , body]) => (body as { pricing_tier: string }).pricing_tier);
      expect(tiers.sort()).toEqual(["cost", "sell"]);
    });

    it("does not touch pricing on create when no price was entered", async () => {
      getOne.mockResolvedValue([{ code: "subsidi", name: "Subsidi", sort_order: 0 }]);
      send.mockResolvedValue(wire());

      await productApiHttp.createOrUpdateProduct({
        kode: "LPG-011",
        nama: "LPG 11 Kg",
        ukuran: "11 kg",
        stokMinimum: 0,
      });

      expect(send.mock.calls.some(([, path]) => String(path).endsWith("/pricing"))).toBe(false);
    });

    it("posts a new sell price on update only when it actually changed", async () => {
      getOne
        .mockResolvedValueOnce(wire({ current_sell_price: 15000, current_cost_price: 10000 }))
        .mockResolvedValueOnce(wire({ current_sell_price: 17000, current_cost_price: 10000 }));
      send.mockResolvedValue(wire());

      const result = await productApiHttp.createOrUpdateProduct({
        id: ID,
        kode: "LPG-003",
        nama: "LPG 3 Kg Subsidi",
        ukuran: "3 kg",
        stokMinimum: 20,
        hargaBeli: 10000,
        hargaJual: 17000,
      });

      const pricingCalls = send.mock.calls.filter(([, path]) => String(path).endsWith("/pricing"));
      expect(pricingCalls).toHaveLength(1);
      expect(pricingCalls[0][2]).toMatchObject({ pricing_tier: "sell", price: 17000 });
      expect(result.hargaJual).toBe(17000);
    });

    it("does not re-post a price that did not change", async () => {
      getOne.mockResolvedValue(wire({ current_sell_price: 15000, current_cost_price: 10000 }));
      send.mockResolvedValue(wire());

      await productApiHttp.createOrUpdateProduct({
        id: ID,
        kode: "LPG-003",
        nama: "LPG 3 Kg Subsidi",
        ukuran: "3 kg",
        stokMinimum: 20,
        hargaBeli: 10000,
        hargaJual: 15000,
      });

      expect(send.mock.calls.some(([, path]) => String(path).endsWith("/pricing"))).toBe(false);
    });
  });
});
