import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { cn, getInitials } from "@/lib/utils";
import { fleetColor } from "@/lib/chart";
import { tileAttribution, tileUrl } from "@/lib/mapTiles";
import { useTheme } from "@/hooks/useTheme";
import { STATUS_HEX, getStatusVariant } from "@/lib/status";
import type { DriverCard, MonitoringAssignment, MonitoringRow } from "../types";
import { buildRoundSequence, type StopState } from "../lib/roundSequence";
import { snapToRoads } from "../lib/snapToRoads";
import { unitLabel } from "@/lib/lexicon";

// Fix default marker icons broken by bundlers — bundled from the installed
// package rather than fetched from unpkg, which this console never talks to
// on an on-premise deployment with no route to the internet. Neither
// <Marker> below actually uses L.Icon.Default (both pass an explicit
// divIcon), so this is currently latent rather than live — but the first
// plain <Marker> anyone adds turns it live, and the failure mode on an
// air-gapped site would be an invisible marker, not an error.
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

type Coord = [number, number];

type RouteMap = Record<string, Coord[]>;

/** Map marks read from the same status palette as badges and row spines. */
function colorForVariant(variant: ReturnType<typeof getStatusVariant>) {
  return STATUS_HEX[variant];
}

function makeDriverIcon(initials: string, color: string, isSelected: boolean) {
  const ring = isSelected ? "0 0 0 4px rgba(224,163,46,.45)" : "none";
  return L.divIcon({
    className: "",
    html: `<div style="
      background:${color};
      color:#ffffff;
      border:2px solid #ffffff;
      border-radius:4px;
      width:32px;height:32px;
      display:flex;align-items:center;justify-content:center;
      font-family:'IBM Plex Mono',ui-monospace,monospace;
      font-size:10px;font-weight:600;
      letter-spacing:.02em;
      box-shadow:0 4px 12px rgba(0,0,0,0.24), ${ring};
    ">${initials}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function makeOutletIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:14px;height:14px;border-radius:3px;
      background:${color};
      border:2px solid #ffffff;
      box-shadow:0 2px 8px rgba(0,0,0,.28);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

/**
 * A stop on the selected round, carrying its position in the sequence.
 *
 * Undifferentiated squares tell you where the outlets are; they do not tell you
 * the job, which is the order they get visited in and which one is being driven
 * to right now. Done stops recede, the next one is the loudest mark on the map.
 */
function makeStopIcon(
  order: number,
  state: StopState,
  color: string,
  numbered: boolean,
) {
  // Served stops recede to a small dot: they are context, and over a week-long
  // window there can be thirty of them. The next stop is the loudest mark on
  // the map, because it is the only one anyone can act on.
  const size = state === "next" ? 26 : state === "done" ? 13 : 20;
  const label = state === "done" ? "" : numbered ? String(order) : "";

  const face =
    state === "done"
      ? `background:${color};border:2px solid #ffffff;opacity:.5`
      : state === "next"
        ? `background:${color};color:#ffffff;border:2px solid #ffffff`
        : `background:#ffffff;color:#3d4238;border:2px solid ${color}`;
  const halo =
    state === "next"
      ? `box-shadow:0 2px 10px rgba(0,0,0,.3), 0 0 0 5px ${color}40;`
      : `box-shadow:0 2px 6px rgba(0,0,0,.22);`;

  return L.divIcon({
    className: "",
    html: `<div style="
      ${face};${halo}
      width:${size}px;height:${size}px;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      font-family:'IBM Plex Mono',ui-monospace,monospace;
      font-size:${state === "next" ? 11 : 10}px;font-weight:700;
      line-height:1;
    ">${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

/**
 * Leaflet caches its container size, so collapsing the sidebar leaves the map
 * mis-sized and the tiles offset until something else forces a redraw.
 */
function ResizeWatcher() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map]);
  return null;
}

/**
 * Frames whatever the user is currently looking at.
 *
 * This used to fit once and never again, so selecting a truck left the camera
 * showing the whole city while the round you asked about occupied a fraction of
 * the canvas. Framing the selection is what makes the map feel like it is about
 * that driver, and it communicates the selection far more strongly than any
 * amount of highlighting.
 *
 * Keyed on `focusKey` rather than the coordinates: the arrays are rebuilt each
 * render, so comparing them would re-fly on every tick and fight the user's own
 * panning.
 */
function MapCamera({
  points,
  focusKey,
}: {
  points: Coord[];
  focusKey: string;
}) {
  const map = useMap();
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (points.length === 0 || lastKey.current === focusKey) return;
    const first = lastKey.current === null;
    lastKey.current = focusKey;

    // Padded once, in pixels. This also carried .pad(0.12), and the two
    // compounded: a 12% ring on every side plus 36px cost roughly a whole zoom
    // level, so the camera sat at 13 when the round would have fitted at 14.
    // Pixel padding is the one to keep — it is what stops a marker halo from
    // clipping, and it does not scale with how big the round happens to be.
    const bounds = L.latLngBounds(points);
    // The first frame should just be there; later ones are a response to a
    // click and read better as movement.
    if (first || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      map.fitBounds(bounds, { padding: [36, 36] });
    } else {
      map.flyToBounds(bounds, { padding: [36, 36], duration: 0.6 });
    }
  }, [map, points, focusKey]);

  return null;
}

/** Clicking the map background clears the selection. */
function MapBackgroundClick({ onClear }: { onClear: () => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onClear();
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [map, onClear]);
  return null;
}

interface DistribusiMapProps {
  /**
   * Height as Tailwind classes, not a pixel string. A fixed inline height
   * cannot carry a breakpoint, so a desk-sized map came through unchanged on a
   * phone — 420px of a 667px screen.
   */
  heightClass?: string;
  drivers: DriverCard[];
  rows: MonitoringRow[];
  assignments: MonitoringAssignment[];
  selectedDriverId?: string;
  onSelectDriver?: (id: string | null) => void;
  /** Hovering a fleet card previews its round without committing a selection. */
  hoveredDriverId?: string | null;
}

export function DistribusiMap({
  heightClass = "h-64 sm:h-80 lg:h-[360px]",
  drivers,
  rows,
  assignments,
  selectedDriverId,
  onSelectDriver,
  hoveredDriverId,
}: DistribusiMapProps) {
  const { isDark } = useTheme();
  const [routesByAssignmentId, setRoutesByAssignmentId] = useState<RouteMap>(
    {},
  );
  /** Road-snapped path already driven. Only fetched for the focused round. */
  const [travelledPath, setTravelledPath] = useState<Coord[]>([]);

  // Hover previews, selection commits — but both frame the same round, so the
  // rest of the component only needs to know which one is in focus.
  const focusedDriverId = hoveredDriverId ?? selectedDriverId ?? null;

  const points = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        coord: [r.coord.lat, r.coord.lng] as Coord,
        color: colorForVariant(getStatusVariant(r.status)),
      })),
    [rows],
  );

  const resolvedAssignments = useMemo(() => {
    const outletRow = new Map(points.map((row) => [row.outletId, row]));
    const driverById = new Map(drivers.map((driver) => [driver.id, driver]));

    return assignments
      .map((assignment) => {
        const driver = driverById.get(assignment.driverId);
        if (!driver) return null;
        return {
          assignment,
          driver,
          target: outletRow.get(assignment.outletId),
          driverCoord: [
            assignment.driverCoord.lat,
            assignment.driverCoord.lng,
          ] as Coord,
          // Truck position first, then every stop still to be made.
          waypoints: [
            [assignment.driverCoord.lat, assignment.driverCoord.lng] as Coord,
            ...assignment.stops.map((s) => [s.lat, s.lng] as Coord),
          ],
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [assignments, drivers, points]);

  /**
   * Stops already made, per driver, in the order they were planned.
   *
   * The assignment only carries what is left to drive, so "where has he been"
   * has to be reconstructed from the surat jalan that are already Selesai.
   * jamRencana is the planned sequence, which is the order a dispatcher reads
   * the round in anyway.
   */
  const doneStopsByDriver = useMemo(() => {
    const byDriver = new Map<string, MonitoringRow[]>();
    for (const row of rows) {
      if (row.status !== "Selesai") continue;
      const list = byDriver.get(row.driverId) ?? [];
      list.push(row);
      byDriver.set(row.driverId, list);
    }
    for (const list of byDriver.values()) {
      list.sort((a, b) => a.jamRencana.localeCompare(b.jamRencana));
    }
    return byDriver;
  }, [rows]);

  // Snap each round to real roads. A straight line between stops looks like a
  // sketch; the driver follows the road, so the map should too.
  useEffect(() => {
    let cancelled = false;

    async function loadRoutes() {
      if (!resolvedAssignments.length) {
        if (!cancelled) setRoutesByAssignmentId({});
        return;
      }

      const entries = await Promise.all(
        resolvedAssignments.map(
          async (a) => [a.assignment.id, await snapToRoads(a.waypoints)] as const,
        ),
      );

      if (!cancelled) setRoutesByAssignmentId(Object.fromEntries(entries));
    }

    loadRoutes();

    return () => {
      cancelled = true;
    };
  }, [resolvedAssignments]);

  // "Berjalan" means actually on the road, not merely rostered for today.
  /**
   * The path already driven, for the focused round only.
   *
   * Fetched on demand rather than for every truck: it is detail that only
   * matters for the round you are looking at, and the public OSRM demo server
   * is not somewhere to send six requests when one will do.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const focus = resolvedAssignments.find((a) => a.driver.id === focusedDriverId);
      const done = focus ? (doneStopsByDriver.get(focus.driver.id) ?? []) : [];

      if (!focus || done.length === 0) {
        if (!cancelled) setTravelledPath([]);
        return;
      }

      const legs: Coord[] = [
        ...done.map((r) => [r.coord.lat, r.coord.lng] as Coord),
        focus.driverCoord,
      ];
      const path = await snapToRoads(legs);
      if (!cancelled) setTravelledPath(path);
    })();

    return () => {
      cancelled = true;
    };
  }, [focusedDriverId, resolvedAssignments, doneStopsByDriver]);

  const activeDrivers = resolvedAssignments.filter((a) => a.assignment.berjalan).length;
  const selected =
    resolvedAssignments.find((a) => a.driver.id === selectedDriverId) ??
    resolvedAssignments[0];
  const focusedRound =
    resolvedAssignments.find((a) => a.driver.id === focusedDriverId) ?? null;
  const focused = focusedRound
    ? { ...focusedRound, color: fleetColor(focusedRound.driver.slot, isDark) }
    : null;

  /**
   * The focused round as an ordered sequence of outlets.
   *
   * Built from the surat jalan rather than from assignment.stops, because those
   * are bare coordinates with no identity — and the sequence has to span stops
   * already served as well as the ones still to come.
   */
  // Not a useMemo: buildRoundSequence runs over one day's rows at most, and
  // nothing downstream keys a hook off this object's identity — the compiler
  // could not prove the manual memo boundary was worth preserving here, and
  // it wasn't buying anything a plain computation doesn't already give.
  const sequence = buildRoundSequence(
    rows,
    focusedRound?.driver.id ?? null,
    focusedRound?.assignment.outletId,
  );
  const stopSequence = sequence.byOutlet;

  const numberedStops = sequence.numbered;

  // Frame the focused round if there is one, otherwise the whole board.
  const fitPoints: Coord[] = focused
    ? [
        ...(routesByAssignmentId[focused.assignment.id] ?? focused.waypoints),
        ...travelledPath,
      ]
    : [
        ...resolvedAssignments.flatMap((a) => a.waypoints),
        ...points.map((p) => p.coord),
      ];

  // Changing this is what asks the camera to move; see MapCamera.
  const focusKey = focused ? `driver:${focused.driver.id}` : "all";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md border border-line",
        heightClass,
      )}
    >
      <MapContainer
        center={[-7.3305, 110.5084]}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        zoomControl
        scrollWheelZoom={false}
      >
        <TileLayer attribution={tileAttribution} url={tileUrl} />
        <MapCamera points={fitPoints} focusKey={focusKey} />
        <MapBackgroundClick onClear={() => onSelectDriver?.(null)} />
        <ResizeWatcher />

        {points.map((p) => {
          // On a focused round the outlets stop being scenery and become the
          // sequence: numbered, with the one being driven to carrying a halo.
          const seq = focused ? stopSequence.get(p.outletId) : undefined;
          const offRound = !!focused && !seq;

          return (
            <Marker
              key={p.id}
              position={p.coord}
              opacity={offRound ? 0.35 : 1}
              zIndexOffset={seq?.state === "next" ? 500 : 0}
              icon={
                seq
                  ? makeStopIcon(seq.order, seq.state, focused!.color, numberedStops)
                  : makeOutletIcon(p.color)
              }
            >
              <Popup>
                <div className="text-xs space-y-1 min-w-[160px]">
                  {seq && (
                    <p className="data text-2xs font-semibold text-ink-muted">
                      {numberedStops
                        ? `Pemberhentian ${seq.order} dari ${sequence.stops.length}`
                        : seq.state === "done"
                          ? "Sudah dilayani"
                          : "Belum dilayani"}
                      {seq.state === "next" && " · tujuan berikutnya"}
                    </p>
                  )}
                  <p className="font-bold text-sm">{p.outlet}</p>
                  <p className="text-ink-muted">{p.alamat}</p>
                  <p className="text-ink-muted">Status: {p.status}</p>
                  <p className="text-ink-muted">
                    Realisasi: {p.realisasi.toLocaleString("id-ID")} /{" "}
                    {p.target.toLocaleString("id-ID")} {unitLabel()}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Where the focused truck has already been: solid and receding, so it
            reads as history rather than instruction. */}
        {focused && travelledPath.length > 1 && (
          <>
            <Polyline
              positions={travelledPath}
              pathOptions={{
                color: isDark ? "#131611" : "#ffffff",
                weight: 6,
                opacity: 0.75,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            <Polyline
              positions={travelledPath}
              pathOptions={{
                color: focused.color,
                weight: 3,
                opacity: 0.45,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          </>
        )}

        {resolvedAssignments.map((a) => {
          const { berjalan, selesai } = a.assignment;
          // Colour identifies the truck; the line style carries its progress —
          // dashed = round still to drive, animated = on the road, solid = done.
          const routeColor = fleetColor(a.driver.slot, isDark);
          const routePositions =
            routesByAssignmentId[a.assignment.id] ?? a.waypoints;

          // Dim every other round when one truck is in focus.
          const dimmed = !!focusedDriverId && focusedDriverId !== a.driver.id;
          const inFocus = focusedDriverId === a.driver.id;
          if (routePositions.length < 2) return null;

          return (
            <div key={a.driver.id}>
              {/* White halo keeps the route legible over any map tile. */}
              <Polyline
                positions={routePositions}
                pathOptions={{
                  // A halo in the opposite value keeps the route legible over
                  // any tile, light or inverted-dark.
                  color: isDark ? "#131611" : "#ffffff",
                  weight: 7.5,
                  opacity: dimmed ? 0.2 : 0.9,
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
              <Polyline
                positions={routePositions}
                pathOptions={{
                  color: routeColor,
                  opacity: dimmed ? 0.28 : 1,
                  lineCap: "round",
                  lineJoin: "round",
                  // The focused round gets weight, not motion. Motion already
                  // means "this truck is driving" (route-animated below), and
                  // spending it on selection too would make it mean nothing.
                  weight: inFocus ? 5.5 : selesai ? 3 : 4,
                  dashArray: selesai ? undefined : berjalan ? "1 9" : "9 7",
                  className: berjalan ? "route-animated" : undefined,
                }}
              />
              <Marker
                position={a.driverCoord}
                opacity={dimmed ? 0.45 : 1}
                zIndexOffset={inFocus ? 1000 : 0}
                icon={makeDriverIcon(
                  getInitials(a.driver.name),
                  routeColor,
                  selectedDriverId === a.driver.id,
                )}
                eventHandlers={{
                  click: () =>
                    onSelectDriver?.(
                      selectedDriverId === a.driver.id ? null : a.driver.id,
                    ),
                }}
              >
                <Popup>
                  <div className="min-w-[180px] space-y-1 text-xs">
                    <p className="text-sm font-bold">{a.driver.name}</p>
                    <p className="text-ink-muted">
                      {a.driver.armada} • {a.driver.plat}
                    </p>
                    <p className="text-ink-muted">Status: {a.driver.status}</p>
                    <p className="text-ink-muted">
                      {selesai
                        ? "Semua pemberhentian selesai"
                        : `Tujuan berikutnya: ${a.target?.outlet ?? "—"}`}
                    </p>
                    <p className="text-ink-muted">
                      Sisa {a.assignment.stops.length} pemberhentian
                    </p>
                  </div>
                </Popup>
              </Marker>
            </div>
          );
        })}
      </MapContainer>

      {/* Top-right, clear of Leaflet's zoom controls in the top-left corner. */}
      <div className="pointer-events-none absolute right-3 top-3 z-[400] flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-sm border border-line bg-panel/95 px-2.5 py-1 text-2xs font-semibold text-ink">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              activeDrivers > 0 ? "bg-signal now-pulse" : "bg-draft",
            )}
            aria-hidden
          />
          {activeDrivers} armada berjalan
        </span>
        <span className="rounded-sm border border-line bg-panel/95 px-2.5 py-1 text-2xs font-semibold text-ink-muted">
          <span className="data">{rows.length}</span> outlet
        </span>
      </div>

      {/* Two states, not three. Progress used to be something you decoded from
          a dash pattern; on a focused round it is now positional — the line
          behind the truck is what has been driven, the line ahead is what has
          not — so the legend only has to name that split. */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-[400] rounded-md border border-line bg-panel/95 px-3 py-2">
        <p className="label mb-1.5 text-[0.625rem] text-ink-muted">Garis rute</p>
        <ul className="space-y-1">
          {[
            { label: "Sudah dilalui", dash: undefined, width: 2.5, opacity: 0.45 },
            { label: "Belum dilalui", dash: "6 5", width: 3, opacity: 1 },
          ].map((item) => (
            <li key={item.label} className="flex items-center gap-2">
              <svg width="26" height="6" aria-hidden className="shrink-0">
                <line
                  x1="1"
                  y1="3"
                  x2="25"
                  y2="3"
                  stroke="currentColor"
                  className="text-ink-muted"
                  strokeWidth={item.width}
                  strokeDasharray={item.dash}
                  strokeOpacity={item.opacity}
                  strokeLinecap="round"
                />
              </svg>
              <span className="text-[0.625rem] text-ink-muted">{item.label}</span>
            </li>
          ))}
          <li className="flex items-center gap-2 border-t border-line pt-1">
            <svg width="26" height="8" aria-hidden className="shrink-0">
              <circle cx="13" cy="4" r="3.5" className="fill-signal" />
            </svg>
            <span className="text-[0.625rem] text-ink-muted">
              Tujuan berikutnya
            </span>
          </li>
        </ul>
      </div>

      {selected && (
        <div className="absolute bottom-3 left-3 z-[400] min-w-[14rem] rounded-md border border-line bg-panel/95 px-3.5 py-2.5 shadow-pop">
          <p className="label text-2xs text-ink-muted">Armada terpilih</p>
          <p className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-ink">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{ background: fleetColor(selected.driver.slot, isDark) }}
              aria-hidden
            />
            {selected.driver.name}
          </p>
          <p className="text-xs text-ink-muted">
            {selected.driver.status} · menuju {selected.target?.outlet ?? "—"}
          </p>
        </div>
      )}
    </div>
  );
}
