import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping for the system screen's remainder, following
 * orderApi.test.ts's own pattern.
 */

const getList = vi.fn();
const getSettings = vi.fn();
const updateSettings = vi.fn();

vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  getOne: vi.fn(),
  send: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("@/features/settings/api/settingsApi", () => ({
  getSettings: (...args: unknown[]) => getSettings(...args),
  updateSettings: (...args: unknown[]) => updateSettings(...args),
}));

const { systemApiHttp } = await import("./systemApi.http");

function agreement(overrides: Record<string, unknown> = {}) {
  return {
    supplier_name: "Pertamina Salatiga",
    sa_status: "active",
    total_quota_qty: 10000,
    used_quota_qty: 4000,
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  getSettings.mockReset();
  updateSettings.mockReset();
});

describe("getSupplierList", () => {
  it("derives distinct suppliers with their agreement count and active remaining quota", async () => {
    getList.mockResolvedValue({
      items: [
        agreement(),
        agreement({ total_quota_qty: 5000, used_quota_qty: 1000 }),
        agreement({ supplier_name: "Supplier Lain", sa_status: "draft" }),
      ],
    });

    const rows = await systemApiHttp.getSupplierList();

    expect(rows).toHaveLength(2);
    const pertamina = rows.find((r) => r.nama === "Pertamina Salatiga")!;
    expect(pertamina.jumlahSA).toBe(2);
    // (10000-4000) + (5000-1000) = 6000 + 4000 = 10000
    expect(pertamina.kuotaAktif).toBe(10000);
  });

  it("excludes a non-active agreement's quota from kuotaAktif but still counts it", async () => {
    getList.mockResolvedValue({
      items: [agreement({ sa_status: "draft", total_quota_qty: 9999, used_quota_qty: 0 })],
    });
    const rows = await systemApiHttp.getSupplierList();
    expect(rows[0].jumlahSA).toBe(1);
    expect(rows[0].kuotaAktif).toBe(0);
  });

  it("skips agreements with no supplier name", async () => {
    getList.mockResolvedValue({ items: [agreement({ supplier_name: undefined })] });
    expect(await systemApiHttp.getSupplierList()).toEqual([]);
  });

  it("has no separate identity fields -- every supplier reads as active with no code, address or contact", async () => {
    getList.mockResolvedValue({ items: [agreement()] });
    const [row] = await systemApiHttp.getSupplierList();
    expect(row.kode).toBe("");
    expect(row.alamat).toBe("");
    expect(row.penanggungJawab).toBe("");
    expect(row.telepon).toBe("");
    expect(row.aktif).toBe(true);
  });
});

describe("getSystemConfig", () => {
  it("returns the fixed document prefixes and the real operations settings", async () => {
    getSettings.mockResolvedValue({
      operasi: { hariKerja: [1, 2, 3, 4, 5], durasiSinggahMenit: 20, leadTimeHari: 7, radiusGeofenceMeter: 200, rekamLokasi: true },
    });

    const config = await systemApiHttp.getSystemConfig();

    expect(config.penomoran).toEqual({
      suratJalan: "SJ",
      invoice: "INV",
      rencana: "RD",
      pesanan: "PO",
      sertakanTanggal: true,
    });
    expect(config.operasi.durasiSinggahMenit).toBe(20);
  });
});

describe("saveOperations", () => {
  it("routes through settingsApi.updateSettings rather than a bespoke write", async () => {
    const operasi = {
      hariKerja: [1, 2, 3, 4, 5],
      durasiSinggahMenit: 20,
      leadTimeHari: 7,
      radiusGeofenceMeter: 200,
      rekamLokasi: true,
    };
    updateSettings.mockResolvedValue({ operasi });

    await systemApiHttp.saveOperations(operasi);

    expect(updateSettings).toHaveBeenCalledWith({ operasi });
  });

  it("validates before ever calling the API", async () => {
    await expect(
      systemApiHttp.saveOperations({
        hariKerja: [],
        durasiSinggahMenit: 20,
        leadTimeHari: 7,
        radiusGeofenceMeter: 200,
        rekamLokasi: false,
      }),
    ).rejects.toThrow(/hari kerja/);
    expect(updateSettings).not.toHaveBeenCalled();
  });
});
