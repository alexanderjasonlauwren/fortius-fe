/**
 * Pratinjau: a stored photo shown inside the console instead of a new tab.
 *
 * Every file link the backend issues is a short-lived signed URL (5 minutes,
 * attachment.downloadTTL and the OCR file route). Opening it in a tab left the
 * browser to decide, and on a phone or with a download-everything setting that
 * meant a file in Downloads instead of the photo -- a dispatcher checking a
 * drop photo or a cashier matching a transfer slip had to hunt for it and open
 * it again. An image now opens in a dialog: fitted, zoomable, rotatable (phone
 * photos arrive sideways), with the neighbouring files a step away. Anything
 * that isn't an image still opens in a tab, as before.
 */
import { useCallback, useState } from "react";
import { useToast } from "@/hooks/useToast";
import { FilePreviewDialog } from "@/components/common/FilePreviewDialog";
import { looksLikeImage, type PreviewFile } from "@/lib/filePreview";

/**
 * `preview(files, index)` opens an image in the dialog (with `files` as the
 * set to step through) and anything else in a new tab. Render `dialog` once.
 */
export function useFilePreview() {
  const { toast } = useToast();
  const [opening, setOpening] = useState<string | null>(null);
  const [gallery, setGallery] = useState<{ files: PreviewFile[]; index: number } | null>(null);

  const openInTab = useCallback(async (file: PreviewFile) => {
    // Opened before the await so the browser treats it as the click's own
    // window rather than a pop-up.
    const tab = window.open("", "_blank");
    setOpening(file.id);
    try {
      const url = await file.resolve();
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch (error) {
      tab?.close();
      toast({
        title: "Berkas tidak dapat dibuka",
        description: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
    } finally {
      setOpening(null);
    }
  }, [toast]);

  const preview = useCallback((files: PreviewFile[], index = 0) => {
    const file = files[index];
    if (!file) return;
    if (!looksLikeImage(file)) {
      void openInTab(file);
      return;
    }
    const images = files.filter(looksLikeImage);
    setGallery({ files: images, index: Math.max(0, images.indexOf(file)) });
  }, [openInTab]);

  const dialog = (
    <FilePreviewDialog
      gallery={gallery}
      onIndex={(index) => setGallery((current) => (current ? { ...current, index } : current))}
      onClose={() => setGallery(null)}
    />
  );

  return { preview, opening, dialog };
}
