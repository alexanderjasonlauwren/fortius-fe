import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { scopeKey } from "@/lib/scope";
import { useToast } from "@/hooks/useToast";
import { discardFiling, pendingFilings, replayFilings } from "../api/sopirApi";

/** How often a non-empty outbox is retried while the screen is open. */
const RETRY_MS = 30_000;

/**
 * The driver's outbox on screen: what is waiting, what the server refused,
 * and the replay.
 *
 * Replayed when the screen opens, when the phone comes back online, when the
 * app is brought back to the front, and every thirty seconds while anything
 * waits -- each filing carries its own key, so replaying early or twice is
 * harmless. One replay at a time.
 */
export function useOutbox() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const key = [...scopeKey(), "sopir-outbox"];
  const filings = useQuery({ queryKey: key, queryFn: pendingFilings, refetchInterval: 15_000 });
  const running = useRef(false);

  const pending = (filings.data ?? []).filter((f) => f.state === "pending");
  const refused = (filings.data ?? []).filter((f) => f.state === "refused");

  const sendNow = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const result = await replayFilings();
      if (result.sent > 0) {
        toast({ tone: "success", title: `${result.sent} catatan terkirim`, description: "Kantor sudah menerimanya." });
        void queryClient.invalidateQueries({ queryKey: [...scopeKey(), "sopir-run"] });
      }
      if (result.refused > 0) {
        toast({
          tone: "error",
          title: `${result.refused} catatan ditolak server`,
          description: "Lihat alasannya di atas daftar perhentian, lalu hubungi kantor.",
        });
      }
    } finally {
      running.current = false;
      void queryClient.invalidateQueries({ queryKey: key });
    }
    // key is rebuilt each render; scopeKey() is what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, toast]);

  useEffect(() => {
    void sendNow();
    const onOnline = () => void sendNow();
    const onVisible = () => {
      if (document.visibilityState === "visible") void sendNow();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sendNow]);

  useEffect(() => {
    if (pending.length === 0) return;
    const timer = window.setInterval(() => void sendNow(), RETRY_MS);
    return () => window.clearInterval(timer);
  }, [pending.length, sendNow]);

  const discard = useCallback(
    async (id: string) => {
      await discardFiling(id);
      void queryClient.invalidateQueries({ queryKey: key });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryClient],
  );

  return {
    pending,
    refused,
    /** Stops with something still waiting, for the card's "menunggu dikirim". */
    waitingStops: new Set(pending.map((f) => f.stopId)),
    sendNow,
    discard,
  };
}
