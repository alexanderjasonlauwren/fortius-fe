/**
 * The Acuan Base SA: the SPBE's monthly PDF of daily targets.
 *
 * Two steps like the SIM3LON import: reading stores the file and shows what it
 * says; saving makes it the month's baseline. The preview is state between the
 * two -- it exists on the server and has written nothing -- so it lives here
 * and is dropped when the dialog closes without saving.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { formatNumber } from "@/lib/format";
import { unitLabel } from "@/lib/lexicon";
import { scopeKey } from "@/lib/scope";
import { applyBaseReference, getBaseReference, previewBaseReference } from "../api/saApi";
import { monthLabel } from "../lib/period";
import type { BaseReference } from "../types";

/** The month's baseline in force, `null` when none was uploaded. */
export function useCurrentBaseReference(month: string) {
  return useQuery({
    queryKey: [...scopeKey(), "sa-base-reference", month],
    queryFn: () => getBaseReference(month),
  });
}

export function useBaseReferenceUpload() {
  const [preview, setPreview] = useState<BaseReference | null>(null);

  const previewMutation = useDeskMutation({
    mutationFn: ({ file, month }: { file: File; month: string }) => previewBaseReference(file, month),
    errorTitle: "Acuan SA tidak terbaca",
    // No success toast: the grid is the result, on screen the moment this
    // resolves.
    onDone: setPreview,
  });

  const applyMutation = useDeskMutation({
    mutationFn: (id: string) => applyBaseReference(id),
    errorTitle: "Acuan SA gagal disimpan",
    success: (saved) => ({
      title: "Acuan SA disimpan",
      description: `Target ${formatNumber(saved.totalQty)} ${unitLabel()} untuk ${monthLabel(saved.periodMonth)} kini tampil di Kuota cabang dan Beranda.`,
    }),
    // Every query is refetched by useDeskMutation, which is what the two cards
    // reading this baseline need.
    onDone: () => setPreview(null),
  });

  return {
    preview,
    /** Drops a preview without saving. The server keeps the upload's record. */
    discard: () => setPreview(null),
    previewMutation,
    applyMutation,
  };
}
