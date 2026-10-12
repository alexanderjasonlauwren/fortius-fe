import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { scopeKey } from "@/lib/scope";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { getSnapshot, sync } from "../api/sim3lonlive";
import { isEmptySnapshot, type Sim3lonSnapshot } from "../api/contract";

/**
 * The live SIM3LON snapshot for a period.
 *
 * The read is fast: the backend returns the last synced snapshot (or an empty
 * one) without touching SIM3LON, so the page never blocks on a headless browser
 * and never trips the request timeout. When the snapshot is empty we kick off one
 * sync automatically — that is the only slow call, and it runs with a long
 * timeout and a visible progress state — so a first visit fills itself in without
 * the user having to press anything.
 *
 * scopeKey() is in the query key because the snapshot is one tenant's data:
 * switching acting tenant must not show the previous tenant's grid.
 */
export function useSim3lonSnapshot(period?: string) {
  const queryClient = useQueryClient();
  const key = [...scopeKey(), "sim3lon-live", period ?? "current"];

  const snapshot = useQuery({
    queryKey: key,
    queryFn: () => getSnapshot(period),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const syncMutation = useDeskMutation<void, Sim3lonSnapshot>({
    mutationFn: () => sync(period),
    errorTitle: "Sinkronisasi SIM3LON gagal",
    success: (snap) => ({
      title: "Tersinkron dari SIM3LON",
      description: snap.wilayah
        ? `Data ${snap.period} untuk ${snap.wilayah.name} sudah ditarik.`
        : `Data ${snap.period} sudah ditarik.`,
    }),
    invalidate: [key],
    onDone: (snap) => queryClient.setQueryData(key, snap),
  });

  // Auto-sync once per period when the stored snapshot is empty. The ref guards
  // against re-firing on every render or after a sync that legitimately returns
  // no rows for the period.
  const autoSynced = useRef<Set<string>>(new Set());
  const mutate = syncMutation.mutate;
  const isPending = syncMutation.isPending;
  useEffect(() => {
    const pKey = period ?? "current";
    if (
      snapshot.data &&
      isEmptySnapshot(snapshot.data) &&
      !isPending &&
      !autoSynced.current.has(pKey)
    ) {
      autoSynced.current.add(pKey);
      mutate();
    }
  }, [snapshot.data, period, isPending, mutate]);

  return { snapshot, sync: syncMutation };
}
