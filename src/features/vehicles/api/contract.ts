/**
 * What every vehicle adapter must provide.
 *
 * A feature of its own because the service has one: `core.vehicles` is a table
 * with its own list, its own permissions and its own expiry dates. The console
 * used to have no vehicles at all — a plate and a capacity sat on the driver —
 * so this is the half of the model that was missing rather than a split of
 * something that existed.
 */
import type { VehicleEntity, VehicleStatusEntity } from "@/types/domain";

/**
 * A truck with the dates the depot has to watch.
 *
 * STNK and KIR are the two certificates that make a truck legal to run. They
 * are on the view rather than only in a detail panel because "which of my
 * trucks lapses this month" is the question the fleet list exists to answer,
 * and the schema indexes both for exactly that.
 */
export interface VehicleView extends VehicleEntity {
  stnkBerakhir?: string;
  kirBerakhir?: string;
  /** True when either certificate has lapsed or lapses within 30 days. */
  perluPerhatian: boolean;
}

export interface VehicleFilters {
  search?: string;
  status?: VehicleStatusEntity | "Semua";
}

export interface VehicleApi {
  getVehicles(filters?: VehicleFilters): Promise<VehicleView[]>;
  getVehicleDetail(id: string): Promise<VehicleView>;
  createOrUpdateVehicle(input: Partial<VehicleEntity> & { id?: string }): Promise<VehicleView>;
  removeVehicle(id: string): Promise<void>;
}
