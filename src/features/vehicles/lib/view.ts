import type { VehicleEntity } from "@/types/domain";
import type { VehicleView } from "../api/contract";

/** Thirty days, which is the notice a workshop booking actually needs. */
const SOON_MS = 30 * 24 * 60 * 60 * 1000;

/** Adds document expiry and whether either lapses within thirty days. */
export function decorateVehicle(v: VehicleEntity, stnk?: string, kir?: string): VehicleView {
  const lapsing = (iso?: string) => !!iso && new Date(iso).getTime() - Date.now() < SOON_MS;
  return {
    ...v,
    stnkBerakhir: stnk,
    kirBerakhir: kir,
    perluPerhatian: lapsing(stnk) || lapsing(kir),
  };
}
