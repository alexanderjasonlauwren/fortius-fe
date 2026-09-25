/**
 * The tile source every Leaflet map in the console reads.
 *
 * The public OSM default is fine for the mock build and for a demo running
 * off the internet. An on-premise deployment with no route out sets both
 * variables to its own tile server; hardcoding OSM's attribution on someone
 * else's tiles would be a licensing claim this console has no basis for.
 *
 * Was duplicated between `DistribusiMap.tsx` and `FencePicker.tsx`; a third
 * map (the outlet form's pin picker) made the third copy the one that
 * inevitably drifts, so it lives here once instead.
 */
export const tileUrl =
  import.meta.env.VITE_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const tileAttribution =
  import.meta.env.VITE_MAP_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
