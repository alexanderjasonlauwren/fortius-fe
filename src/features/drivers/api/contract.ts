/**
 * What every driver adapter must provide.
 *
 * # The model this contract does NOT have
 *
 * No `plat`, no `armada`, no `kapasitas`. `core.drivers` and `core.vehicles`
 * have no link column anywhere: the pairing lives on `core.dispatch_trips`,
 * because a driver swaps trucks and a truck swaps drivers. The console used to
 * collapse the two by putting the plate on the driver, which made "what is this
 * driver's capacity?" answerable — and the answer was wrong on any day they
 * took a different truck.
 *
 * Screens that want to show a driver with their truck read the vehicle list.
 * In the demo build that pairing is `mocks/fleet.ts`; against the service it is
 * the dispatch board, which is the only place it is real.
 */
import type { DriverEntity, DriverStatusEntity } from "@/types/domain";

/**
 * A driver with the figures the screens put beside them.
 *
 * `statistikTersedia` carries the same meaning it does on the outlet view:
 * every number here is counted from `core.deliveries`, which has no service
 * yet. Reported as zero, "0 pengiriman, ketepatan 100%" describes a driver who
 * has done nothing perfectly — a sentence with no true reading.
 */
export interface DriverView extends DriverEntity {
  /** Surat jalan assigned today. */
  tugasHariIni: number;
  selesaiHariIni: number;
  muatanHariIni: number;
  /** Completed drops over the trailing 30 days. */
  pengiriman30Hari: number;
  unit30Hari: number;
  /** Share of drops finished on the day they were planned, 0..1. */
  ketepatan: number;
  /**
   * Whether the six figures above mean anything in this build. False against
   * the service, which does not serve deliveries.
   */
  statistikTersedia: boolean;
}

export interface DriverFilters {
  search?: string;
  status?: DriverStatusEntity | "Semua";
}

/**
 * The create/update payload.
 *
 * `akunUsername`/`akunEmail`/`akunPassword` provision a mobile-app login in the
 * same request that creates the driver — a driver is always a person, and a
 * person here is always a user. They are read only on create: a login, once
 * provisioned, is managed from the Users page like any other account, not
 * re-issued by editing the driver record.
 */
export interface DriverWriteInput extends Partial<DriverEntity> {
  id?: string;
  akunUsername?: string;
  akunEmail?: string;
  akunPassword?: string;
}

export interface DriverApi {
  getDrivers(filters?: DriverFilters): Promise<DriverView[]>;
  getDriverDetail(id: string): Promise<DriverView>;
  createOrUpdateDriver(input: DriverWriteInput): Promise<DriverView>;
  removeDriver(id: string): Promise<void>;
  exportDrivers(): Promise<number>;
}
