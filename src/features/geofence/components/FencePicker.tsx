import { useEffect } from "react";
import { MapContainer, TileLayer, Circle, Polygon, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { tileAttribution, tileUrl } from "@/lib/mapTiles";
import type { GeofenceShapeEntity, LatLng } from "../api/geofenceApi";

/**
 * Draw a fence by clicking the map.
 *
 * Hand-rolled rather than pulling in `leaflet-draw`. What this needs is a
 * click handler and a list of points; the plugin brings a toolbar, its own
 * stylesheet and a second set of icon assets to vendor, for a screen that
 * draws two shapes. The deployment is on-premise and every asset has to be
 * bundled, so a dependency earns its place here more than usual.
 *
 * Tiles come from the same configuration every map in the console reads, so
 * an air-gapped install points all of them at its own tile server with one
 * variable and none reach the public internet. See `lib/mapTiles.ts`.
 */

/** A vertex handle, numbered so the ring's order is visible while drawing. */
function vertexIcon(order: number) {
  return L.divIcon({
    className: "",
    html: `<div style="
      background:#e0a32e;color:#131611;
      border:2px solid #ffffff;border-radius:50%;
      width:22px;height:22px;
      display:flex;align-items:center;justify-content:center;
      font-family:'IBM Plex Mono',ui-monospace,monospace;
      font-size:10px;font-weight:700;line-height:1;
      box-shadow:0 2px 6px rgba(0,0,0,.3);
    ">${order}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

const centreIcon = L.divIcon({
  className: "",
  html: `<div style="
    background:#e0a32e;border:2px solid #ffffff;border-radius:50%;
    width:14px;height:14px;box-shadow:0 2px 8px rgba(0,0,0,.3);
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function ClickToPlace({ onPick }: { onPick: (at: LatLng) => void }) {
  useMapEvents({
    click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }),
  });
  return null;
}

/**
 * Frames the fence when it is first shown.
 *
 * Keyed on nothing but mount: re-framing on every click would fight the person
 * drawing, dragging the map out from under the next vertex they meant to
 * place.
 */
function FrameOnce({ shape }: { shape: GeofenceShapeEntity }) {
  const map = useMap();
  useEffect(() => {
    if (shape.jenis === "Lingkaran") {
      map.setView([shape.pusat.lat, shape.pusat.lng], 14);
      return;
    }
    if (shape.batas.length > 0) {
      map.fitBounds(L.latLngBounds(shape.batas.map((p) => [p.lat, p.lng])), {
        padding: [36, 36],
      });
    }
    // Mount only: see the docblock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
}

export function FencePicker({
  shape,
  onChange,
  centre,
  readOnly = false,
}: {
  shape: GeofenceShapeEntity;
  onChange: (shape: GeofenceShapeEntity) => void;
  /** Where to open when the fence has no shape yet — the branch's own pool. */
  centre: LatLng;
  readOnly?: boolean;
}) {
  const opening =
    shape.jenis === "Lingkaran" && shape.radiusMeter > 0
      ? shape.pusat
      : shape.jenis === "Poligon" && shape.batas.length > 0
        ? shape.batas[0]
        : centre;

  const handlePick = (at: LatLng) => {
    if (readOnly) return;
    if (shape.jenis === "Lingkaran") {
      onChange({ ...shape, pusat: at });
    } else {
      onChange({ ...shape, batas: [...shape.batas, at] });
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative h-64 overflow-hidden rounded-md border border-line">
        <MapContainer
          center={[opening.lat, opening.lng]}
          zoom={14}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer attribution={tileAttribution} url={tileUrl} />
          <FrameOnce shape={shape} />
          {!readOnly && <ClickToPlace onPick={handlePick} />}

          {shape.jenis === "Lingkaran" && shape.radiusMeter > 0 && (
            <>
              <Circle
                center={[shape.pusat.lat, shape.pusat.lng]}
                radius={shape.radiusMeter}
                pathOptions={{ color: "#e0a32e", weight: 2, fillOpacity: 0.12 }}
              />
              <Marker position={[shape.pusat.lat, shape.pusat.lng]} icon={centreIcon} />
            </>
          )}

          {shape.jenis === "Poligon" && (
            <>
              {shape.batas.length > 2 && (
                <Polygon
                  positions={shape.batas.map((p) => [p.lat, p.lng])}
                  pathOptions={{ color: "#e0a32e", weight: 2, fillOpacity: 0.12 }}
                />
              )}
              {shape.batas.map((p, i) => (
                <Marker
                  key={`${p.lat},${p.lng},${i}`}
                  position={[p.lat, p.lng]}
                  icon={vertexIcon(i + 1)}
                />
              ))}
            </>
          )}
        </MapContainer>
      </div>

      {!readOnly && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-2xs text-ink-muted">
            {shape.jenis === "Lingkaran"
              ? "Klik peta untuk menetapkan titik pusat."
              : `Klik peta untuk menambah titik. ${shape.batas.length} dari minimal 3 titik.`}
          </p>
          {shape.jenis === "Poligon" && shape.batas.length > 0 && (
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onChange({ ...shape, batas: shape.batas.slice(0, -1) })}
              >
                Hapus titik terakhir
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onChange({ ...shape, batas: [] })}
              >
                Ulangi
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
