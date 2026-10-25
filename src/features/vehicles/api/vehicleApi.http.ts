/**
 * The fleet, against the real API.
 *
 * A truck carries no personal data, so unlike drivers and outlets there is
 * nothing here that must not be logged — the whole row is as public as the
 * plate on the back of it.
 *
 * # Capacity in units, and sometimes in kilograms
 *
 * `capacity_qty` is NOT NULL and `capacity_kg` is not, and the difference is
 * configuration rather than a missing field: "unknown weight limit, check the
 * count only" is a real answer for a truck nobody has weighed. So the domain
 * type keeps `kapasitasKg` optional and the planner's ceiling stays the count.
 */
import { getList, getOne, send } from "@/lib/api";
import type { VehicleEntity, VehicleStatusEntity } from "@/types/domain";
import type { VehicleApi, VehicleFilters, VehicleView } from "./contract";
import { decorateVehicle } from "../lib/view";

/** Mirrors the backend's VehicleResponse. */
interface VehicleResponse {
  id: string;
  branch_id: string;
  plate_number: string;
  vehicle_type: string;
  brand?: string;
  model?: string;
  capacity_qty: number;
  capacity_kg?: number;
  stnk_expires_at?: string;
  kir_expires_at?: string;
  operational_status: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

/** 100 is every list definition's MaxPageSize; the server refuses more. */
const PAGE_SIZE = 100;

/**
 * `operational_status` is the truck's own lifecycle and `status` is the
 * three-letter audit flag. The console shows one word, so the two are folded
 * here: a truck in the workshop is Perawatan whatever its audit flag says,
 * because that is the fact a planner acts on.
 */
function toStatus(row: VehicleResponse): VehicleStatusEntity {
  if (row.operational_status === "maintenance") return "Perawatan";
  return row.status === "atv" ? "Aktif" : "Nonaktif";
}

function toWireOperational(status?: VehicleStatusEntity): string | undefined {
  if (!status) return undefined;
  return status === "Perawatan" ? "maintenance" : "available";
}

function toView(row: VehicleResponse): VehicleView {
  const vehicle: VehicleEntity = {
    id: row.id,
    // See the outlet adapter: row-level security decides visibility on the
    // server, so a client-side tenant would be a second opinion.
    tenantId: "",
    branchId: row.branch_id,
    plat: row.plate_number,
    // What the depot calls the truck. The service keeps make and model apart;
    // the console shows them as one phrase, and falls back to the vehicle type
    // when neither is recorded rather than showing an empty cell.
    armada: [row.brand, row.model].filter(Boolean).join(" ") || row.vehicle_type,
    kapasitas: row.capacity_qty,
    kapasitasKg: row.capacity_kg,
    status: toStatus(row),
    terdaftarPada: row.created_at,
  };
  // The same decoration the mock applies, so "lapsing within 30 days" means the
  // same thing in both builds rather than being defined twice.
  return decorateVehicle(vehicle, row.stnk_expires_at, row.kir_expires_at);
}

function toWire(input: Partial<VehicleEntity>) {
  const body: Record<string, unknown> = {};
  const put = (key: string, value: unknown) => {
    if (value !== undefined) body[key] = value;
  };
  put("plate_number", input.plat);
  // The console shows one phrase where the service keeps make and model apart.
  // Sent whole as `brand`, which round-trips to the same phrase because toView
  // joins the two -- splitting "Isuzu Elf NMR" on a space would guess where the
  // make ends, and guess wrong on "Mitsubishi Fuso Fighter".
  put("brand", input.armada);
  put("capacity_qty", input.kapasitas);
  put("capacity_kg", input.kapasitasKg);
  put("operational_status", toWireOperational(input.status));
  return body;
}

async function getVehicles(filters?: VehicleFilters): Promise<VehicleView[]> {
  const operational =
    filters?.status && filters.status !== "Semua"
      ? toWireOperational(filters.status)
      : undefined;

  const page = await getList<VehicleResponse>("/vehicles", {
    pageSize: PAGE_SIZE,
    sort: [{ field: "plate_number" }],
    search: filters?.search,
    filters: [
      { field: "status", operator: "eq" as const, value: "atv" },
      ...(operational
        ? [{ field: "operational_status", operator: "eq" as const, value: operational }]
        : []),
    ],
  });
  return page.items.map(toView);
}

async function getVehicleDetail(id: string): Promise<VehicleView> {
  return toView(await getOne<VehicleResponse>(`/vehicles/${id}`));
}

async function createOrUpdateVehicle(
  input: Partial<VehicleEntity> & { id?: string },
): Promise<VehicleView> {
  if (!input.id) {
    return toView(await send<VehicleResponse>("post", "/vehicles", toWire(input)));
  }
  const current = await getOne<VehicleResponse>(`/vehicles/${input.id}`);
  const updated = await send<VehicleResponse>("put", `/vehicles/${input.id}`, {
    ...toWire(input),
    version: current.version,
  });
  return toView(updated);
}

async function removeVehicle(id: string): Promise<void> {
  await send("delete", `/vehicles/${id}`);
}

export const vehicleApiHttp: VehicleApi = {
  getVehicles,
  getVehicleDetail,
  createOrUpdateVehicle,
  removeVehicle,
};
