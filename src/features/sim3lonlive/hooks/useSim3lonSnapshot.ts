import { useQuery, useQueryClient } from "@tanstack/react-query";
import { scopeKey } from "@/mocks/scope";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { getSnapshot, sync } from "../api/sim3lonlive";
import type { Sim3lonSnapshot } from "../api/contract";

/**
 * The live SIM3LON snapshot for a period.
 *
 * scopeKey() is in the query key because the snapshot is one tenant's data:
 * switching acting tenant must not show the previous tenant's grid. The sync
 * mutation writes its fresh result straight back into the cache so the button
 * updates the screen without a second round trip to the bridge.
 */
export function useSim3lonSnapshot(period?: string) {
  const queryClient = useQueryClient();
  const key = [...scopeKey(), "sim3lon-live", period ?? "current"];

  const snapshot = useQuery({
    queryKey: key,
    queryFn: () => getSnapshot(period),
    // A live mirror of a third-party system: do not refetch it on every focus,
    // and treat it as fresh for a while. "Sinkronkan" is the explicit refresh.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const syncMutation = useDeskMutation<void, Sim3lonSnapshot>({
    mutationFn: () => sync(period),
    errorTitle: "Sinkronisasi SIM3LON gagal",
    success: (snap) => ({
      title: "Tersinkron dari SIM3LON",
      description: `Data ${snap.period} untuk ${snap.wilayah.name} sudah ditarik.`,
    }),
    invalidate: [key],
    onDone: (snap) => queryClient.setQueryData(key, snap),
  });

  return { snapshot, sync: syncMutation };
}
