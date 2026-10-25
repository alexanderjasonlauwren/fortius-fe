/**
 * What every system-screen adapter must provide.
 *
 * Two unrelated concerns share this file because the console presents them
 * on one screen, matching `systemApi.ts`'s own pre-split shape: supplier
 * mastery (per this plan's own decision 5, not a real `core.suppliers`
 * table -- see `systemApi.http.ts`'s own header) and the numbering/
 * operations settings this tenant runs under.
 */
import type { NumberingEntity, OperationsEntity, SupplierEntity } from "@/types/domain";

export interface SupplierView extends SupplierEntity {
  /** Agreements issued by this supplier, so it is clear what deleting would orphan. */
  jumlahSA: number;
  kuotaAktif: number;
}

export interface SystemApi {
  getSupplierList(): Promise<SupplierView[]>;
  getSystemConfig(): Promise<{ penomoran: NumberingEntity; operasi: OperationsEntity }>;
  saveOperations(operasi: OperationsEntity): Promise<OperationsEntity>;
}
