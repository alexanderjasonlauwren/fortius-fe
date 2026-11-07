/**
 * The run tracker's on/off switch and lifecycle.
 *
 * `createGpsStream` (../lib/gpsStream.ts) is the mechanism; this hook is the
 * consent. Recording never starts on its own — a driver presses "Mulai
 * rekam", off by default, and the choice is remembered per run so a reload
 * mid-shift does not silently drop back to off without them noticing, nor
 * silently keep recording past a run they meant to stop.
 */
import { useCallback, useEffect, useRef } from "react";
import { useResettableState } from "@/hooks/useResettableState";
import { createGpsStream, type GpsStream } from "../lib/gpsStream";
import { postGpsFixes } from "../api/sopirApi";
import { ApiError } from "@/lib/api";

const STORAGE_PREFIX = "sopir.trackRun.";

function readPreference(tripKey: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + tripKey) === "on";
  } catch {
    // Private browsing, or a full quota. The toggle still works for this
    // session; it just will not survive a reload.
    return false;
  }
}

function writePreference(tripKey: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(STORAGE_PREFIX + tripKey, "on");
    else localStorage.removeItem(STORAGE_PREFIX + tripKey);
  } catch {
    // Same as above -- nothing to recover, nothing to surface to the driver.
  }
}

/** True for the two failures that mean this run will never accept another
 * fix: the trip closed, or the agency switched recording off mid-session. */
function isFatal(err: unknown): boolean {
  return err instanceof ApiError && (err.code === "NO_OPEN_TRIP" || err.code === "TRACKING_DISABLED");
}

export interface UseGpsStreamOptions {
  /**
   * Whether recording can be offered at all: the agency's own
   * `record_driver_location` switch, and something left to drive to today.
   */
  enabled: boolean;
  /**
   * Identifies the run the preference belongs to, so switching to a
   * different day does not inherit an earlier one's choice. `null` while the
   * run has not loaded yet.
   */
  tripKey: string | null;
}

export interface UseGpsStreamResult {
  /** The driver's own choice, whether or not the stream has actually
   * started yet. Drives the toggle's visual state. */
  wanted: boolean;
  /**
   * True once positions are actually being watched. Fully determined by
   * `enabled && wanted && tripKey` -- the effect below keeps the real
   * browser watch in sync with exactly that condition, so this is a
   * computed fact rather than state the effect would otherwise have to
   * report back through a synchronous setState.
   */
  active: boolean;
  toggle: () => void;
}

export function useGpsStream({ enabled, tripKey }: UseGpsStreamOptions): UseGpsStreamResult {
  // A different run must not inherit an earlier one's choice -- reseeded
  // during render when tripKey changes, not in an effect after the fact, so
  // there is no frame where the previous run's toggle state is shown for a
  // day that has not loaded it yet.
  const [wanted, setWanted] = useResettableState([tripKey], () =>
    tripKey ? readPreference(tripKey) : false,
  );
  const streamRef = useRef<GpsStream | null>(null);
  const active = Boolean(enabled && wanted && tripKey);

  useEffect(() => {
    if (!active || !tripKey) return;

    const stream = createGpsStream({
      geolocation: navigator.geolocation,
      // GpsFix and GpsFixInput are the same shape by design -- no mapping
      // between the stream's internal type and the wire contract.
      send: (fixes) => postGpsFixes(fixes),
      isFatal,
      onStopped: (reason) => {
        // A denial or a server refusal is the run's own answer, not a
        // transient glitch -- turn the toggle back off and forget the
        // preference, so a reload does not immediately try again and fail
        // the same way. Fires from geolocation's own async error callback or
        // from a rejected send, never synchronously from this effect's own
        // setup, so it does not fight React over the render it causes.
        if (reason !== "manual") {
          setWanted(false);
          writePreference(tripKey, false);
        }
      },
    });
    streamRef.current = stream;
    stream.start();

    return () => {
      stream.stop();
      streamRef.current = null;
    };
  }, [active, tripKey, setWanted]);

  const toggle = useCallback(() => {
    if (!enabled || !tripKey) return;
    setWanted((prev) => {
      const next = !prev;
      writePreference(tripKey, next);
      return next;
    });
  }, [enabled, tripKey, setWanted]);

  return { wanted, active, toggle };
}
