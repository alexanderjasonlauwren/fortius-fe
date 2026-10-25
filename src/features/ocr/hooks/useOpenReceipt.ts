import { useState } from "react";
import { receiptFileUrl } from "@/features/ocr/api/ocrApi";
import { useToast } from "@/hooks/useToast";

/** Opens a receipt's stored file in a new tab, the way attachments open. */
export function useOpenReceipt() {
  const { toast } = useToast();
  const [opening, setOpening] = useState<string | null>(null);

  async function open(id: string) {
    // Opened before the await so the browser treats it as the click's own
    // window rather than a pop-up.
    const tab = window.open("", "_blank");
    setOpening(id);
    try {
      const url = await receiptFileUrl(id);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch (error) {
      tab?.close();
      toast({
        title: "Bukti tidak dapat dibuka",
        description: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
    } finally {
      setOpening(null);
    }
  }

  return { open, opening };
}
