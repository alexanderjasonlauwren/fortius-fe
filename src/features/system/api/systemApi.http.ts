/**
 * SA issuers and system configuration.
 *
 * `getSupplierList` lists the distinct SPBE names on Schedule Agreements
 * (`core.schedule_agreements.supplier_name` is free text, so there is nothing to
 * create or delete). General-purchase vendors are `core.suppliers`, served by
 * the suppliers feature. Document-number prefixes are fixed per branch by
 * `provision_branch_sequences()` and are read-only here.
 */
import { getList } from "@/lib/api";
import { getSettings, updateSettings } from "@/features/settings/api/settingsApi";
import type { NumberingEntity, OperationsEntity } from "@/types/domain";
import type { SupplierView, SystemApi } from "./contract";

/** Mirrors the fields of sa's own AgreementResponse this adapter needs. */
interface AgreementResponse {
  supplier_name?: string;
  sa_status: string;
  total_quota_qty: number;
  used_quota_qty: number;
}

async function getSupplierList(): Promise<SupplierView[]> {
  const page = await getList<AgreementResponse>("/schedule-agreements", { pageSize: 100 });

  const bySupplier = new Map<string, { jumlahSA: number; kuotaAktif: number }>();
  for (const row of page.items) {
    if (!row.supplier_name) continue;
    const entry = bySupplier.get(row.supplier_name) ?? { jumlahSA: 0, kuotaAktif: 0 };
    entry.jumlahSA += 1;
    if (row.sa_status === "active") {
      entry.kuotaAktif += row.total_quota_qty - row.used_quota_qty;
    }
    bySupplier.set(row.supplier_name, entry);
  }

  return [...bySupplier.entries()]
    .map(([nama, counts]) => ({
      // There is no id to key on -- the name is the identity, the same way
      // it is the join key against core.schedule_agreements.supplier_name.
      id: nama,
      kode: "",
      nama,
      alamat: "",
      penanggungJawab: "",
      telepon: "",
      // Every name that still appears in the agreement list is, by
      // definition, in current use -- there is no separate deactivation
      // state to read.
      aktif: true,
      ...counts,
    }))
    .sort((a, b) => a.nama.localeCompare(b.nama));
}

/**
 * The prefixes `core.document_sequences`' own `provision_branch_sequences()`
 * fixes at branch-creation time -- not read from anywhere, because there is
 * nowhere to read them from; this is what the migration itself hard-codes.
 * Shown so the screen has real values rather than blanks, not because a
 * tenant can change them.
 */
const FIXED_PREFIXES: NumberingEntity = {
  suratJalan: "SJ",
  invoice: "INV",
  rencana: "RD",
  pesanan: "PO",
  sertakanTanggal: true,
};

async function getSystemConfig() {
  const settings = await getSettings();
  return { penomoran: FIXED_PREFIXES, operasi: settings.operasi };
}

async function saveOperations(operasi: OperationsEntity): Promise<OperationsEntity> {
  if (operasi.hariKerja.length === 0) {
    throw new Error("Pilih minimal satu hari kerja.");
  }
  if (operasi.durasiSinggahMenit < 15) {
    throw new Error("Durasi singgah minimal 15 menit.");
  }
  if (operasi.rekamLokasi && operasi.radiusGeofenceMeter < 50) {
    throw new Error("Radius wajar minimal 50 meter agar tidak salah menandai.");
  }
  const saved = await updateSettings({ operasi });
  return saved.operasi;
}

export const systemApiHttp: SystemApi = {
  getSupplierList,
  getSystemConfig,
  saveOperations,
};
