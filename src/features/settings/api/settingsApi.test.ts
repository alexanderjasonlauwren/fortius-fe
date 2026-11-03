import { beforeEach, describe, expect, it, vi } from "vitest";

const getOne = vi.fn();
const send = vi.fn();
vi.mock("@/lib/api", () => ({
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
}));
vi.mock("@/lib/scope", () => ({ getActingTenant: () => "tenant-1" }));

const { clearSettingOverride, getSettings, getSettlementTarget, saveSettlementTarget, updateSettings } = await import("./settingsApi.http");

const own = { unit_term: "tabung", working_days: [1, 2, 3], sim3lon_settlement_target: null };

// Regression 2026-10-24 F3: the settlement target decided how dispatch
// settled an unfunded stop, and nothing showed it or let a tenant set it.
describe("SIM3LON settlement target", () => {
  beforeEach(() => {
    getOne.mockReset().mockResolvedValue({ own, effective: { ...own, sim3lon_settlement_target: null }, inherited_from: {} });
    send.mockReset().mockResolvedValue({});
  });

  it("reads 'bank' when nothing is set, as the server resolves it", async () => {
    expect(await getSettlementTarget()).toEqual({ own: null, effective: "bank" });
  });

  it("saves the choice and sends every other stored field back unchanged", async () => {
    await saveSettlementTarget("customer_deposit");
    expect(send).toHaveBeenCalledWith("put", "/tenants/tenant-1/settings", {
      ...own,
      sim3lon_settlement_target: "customer_deposit",
    });
  });
});

const profile = {
  legal_name: "PT. Bhakta Dharma Anindita", trade_name: "BDA", registration_number: "NIB-1",
  is_pkp: false, default_tax_percentage: 0, address: "Jl. Fatmawati", city: "Salatiga",
  province: "Jawa Tengah", postal_code: "50711", phone: "0298", email: "bda@example.id",
  timezone: "Asia/Jakarta", agent_number: "1079858", npwp: "03.975.079.5-505.000",
  signatory_name: "Balash", signatory_title: "Direktur", version: 4,
};

/** Serves the settings row and the tenant detail (with its profile). */
function serve(settingsOwn: Record<string, unknown>, settingsEffective = settingsOwn) {
  getOne.mockReset().mockImplementation((path: string) =>
    path === "/tenants/tenant-1"
      ? Promise.resolve({ profile })
      : Promise.resolve({ own: settingsOwn, effective: settingsEffective, inherited_from: {} }),
  );
  send.mockReset().mockResolvedValue({});
}

// Regression 2026-11-02: Profil agen showed "Pengaturan disimpan" and saved
// none of its fields; Target harian had no column at all.
describe("Profil agen and Target harian", () => {
  it("reads the legal identity off the tenant's profile", async () => {
    serve({ daily_target_qty: 1320 });
    const settings = await getSettings();
    expect(settings).toMatchObject({
      namaPerusahaan: "BDA", namaLegal: "PT. Bhakta Dharma Anindita", nomorAgen: "1079858",
      npwp: "03.975.079.5-505.000", penandatanganNama: "Balash", profilVersi: 4, targetHarian: 1320,
    });
  });

  it("saves the profile as a full replacement at the version the form was read at", async () => {
    serve({});
    await updateSettings({ nomorAgen: "2000001", npwp: " ", penandatanganJabatan: "Komisaris", profilVersi: 3 });
    const call = send.mock.calls.find(([, path]) => path === "/tenants/tenant-1/profile");
    expect(call?.[0]).toBe("put");
    expect(call?.[2]).toMatchObject({
      legal_name: "PT. Bhakta Dharma Anindita", trade_name: "BDA", agent_number: "2000001",
      npwp: null, // cleared, not sent as a blank string
      signatory_name: "Balash", signatory_title: "Komisaris",
      city: "Salatiga", province: "Jawa Tengah", postal_code: "50711", // not on the form, kept
      version: 3,
    });
  });

  it("does not touch the profile when only settings changed", async () => {
    serve({});
    await updateSettings({ jamOperasionalMulai: "06:00" });
    expect(send.mock.calls.map(([, path]) => path)).toEqual(["/tenants/tenant-1/settings"]);
  });

  it("stores the daily target, and a blank one as null so the group's applies", async () => {
    serve({ unit_term: "tabung" });
    await updateSettings({ targetHarian: 960 });
    expect(send.mock.calls[0][2]).toMatchObject({ unit_term: "tabung", daily_target_qty: 960 });

    serve({ daily_target_qty: 960 });
    await updateSettings({ targetHarian: 0 });
    expect(send.mock.calls[0][2]).toMatchObject({ daily_target_qty: null });

    serve({ daily_target_qty: 960 });
    await clearSettingOverride("targetHarian");
    expect(send.mock.calls[0][2]).toMatchObject({ daily_target_qty: null });
  });
});
