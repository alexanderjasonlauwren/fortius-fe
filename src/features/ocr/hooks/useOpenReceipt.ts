import { useCallback } from "react";
import { receiptFileUrl } from "@/features/ocr/api/ocrApi";
import { useFilePreview } from "@/hooks/useFilePreview";

/**
 * Shows a receipt's stored photo in the console's preview, the way
 * attachments open; a PDF receipt still opens in a tab. `resolve` is the
 * route that issues the link: the expense inbox's by default, the cashier's
 * transferProofFileUrl for a bukti transfer. Render `dialog` once.
 */
export function useOpenReceipt(resolve: (id: string) => Promise<string> = receiptFileUrl) {
  const { preview, opening, dialog } = useFilePreview();
  const open = useCallback(
    (id: string, name?: string) => preview([{ id, name, resolve: () => resolve(id) }]),
    [preview, resolve],
  );
  return { open, opening, dialog };
}
