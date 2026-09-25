import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type L from "leaflet";
import { tileAttribution, tileUrl } from "@/lib/mapTiles";

/** Salatiga — the default centre for an outlet with no pin yet. */
const FALLBACK_CENTRE = { lat: -7.3305, lng: 110.5084 };

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => onPick(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

/** Frames the pin once, on mount, so dragging the marker does not fight the map. */
function FrameOnce({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 15);
    // Mount only: see the docblock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
}

/**
 * Places a pin by clicking or dragging it, for the outlet form's Lintang /
 * Bujur fields.
 *
 * No geocoding: Nominatim is unreliable at kelurahan level for this
 * deployment's addresses, and a wrong auto-placed pin is worse than an
 * outlet that stays unplaced until someone looks at a map. `lat`/`lng` of
 * exactly 0, 0 is the form's own sentinel for "no pin yet" (see
 * `OutletFormPage`'s `EMPTY`), so the map opens centred on the pool instead
 * of off the coast of Africa.
 */
export function LocationPicker({
  lat,
  lng,
  onChange,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const placed = !(lat === 0 && lng === 0);
  const centre = placed ? { lat, lng } : FALLBACK_CENTRE;

  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const place = (nextLat: number, nextLng: number) => onChange(round(nextLat), round(nextLng));

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="relative h-56 overflow-hidden rounded-md border border-line">
        <MapContainer
          center={[centre.lat, centre.lng]}
          zoom={placed ? 15 : 13}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer attribution={tileAttribution} url={tileUrl} />
          <FrameOnce lat={centre.lat} lng={centre.lng} />
          <ClickToPlace onPick={place} />
          {placed && (
            <Marker
              position={[lat, lng]}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const marker = e.target as L.Marker;
                  const pos = marker.getLatLng();
                  place(pos.lat, pos.lng);
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      <p className="text-2xs text-ink-muted">
        {placed
          ? "Klik peta atau seret pin untuk mengubah posisi."
          : "Klik peta untuk menandai posisi pangkalan."}
      </p>
    </div>
  );
}
