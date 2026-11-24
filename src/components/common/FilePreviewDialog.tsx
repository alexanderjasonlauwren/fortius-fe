/**
 * The preview dialog useFilePreview renders: one image at a time, fitted or
 * at full size, rotatable, with the rest of the set a step away.
 */
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ExternalLink, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { scopeKey } from "@/lib/scope";
import { cn } from "@/lib/utils";
import { linkIsOtherFile, type PreviewFile } from "@/lib/filePreview";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/common/Panel";

export function FilePreviewDialog({ gallery, onIndex, onClose }: {
  gallery: { files: PreviewFile[]; index: number } | null;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const file = gallery?.files[gallery.index];
  const count = gallery?.files.length ?? 0;
  const index = gallery?.index ?? 0;
  const step = useCallback((by: number) => {
    if (count > 1) onIndex((index + by + count) % count);
  }, [count, index, onIndex]);

  useEffect(() => {
    if (!file || count < 2) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, count, step]);

  return (
    <Dialog open={Boolean(file)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6" title={file?.name}>{file?.name ?? "Pratinjau"}</DialogTitle>
          <DialogDescription>
            {count > 1 ? `Gambar ${index + 1} dari ${count} · geser dengan tombol ← →` : "Pratinjau gambar"}
          </DialogDescription>
        </DialogHeader>
        {/* Keyed so zoom and rotation start fresh for each file. */}
        {file && <ImageView key={file.id} file={file} />}
        {count > 1 && (
          <div className="flex items-center justify-between gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => step(-1)}>
              <ChevronLeft /> Sebelumnya
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => step(1)}>
              Berikutnya <ChevronRight />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ImageView({ file }: { file: PreviewFile }) {
  const [zoomed, setZoomed] = useState(false);
  const [turns, setTurns] = useState(0);
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  // The link lives five minutes; reopening within one reuses it, later asks
  // again rather than showing a link that has expired.
  const link = useQuery({
    queryKey: [...scopeKey(), "file-preview", file.id],
    queryFn: file.resolve,
    staleTime: 60_000,
    gcTime: 60_000,
    retry: false,
  });
  const url = link.data;
  const unreadable = broken || (url !== undefined && linkIsOtherFile(url));
  const sideways = turns % 2 === 1;

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "flex min-h-48 rounded-md border border-line bg-panel-sunk",
          zoomed ? "max-h-[70dvh] overflow-auto" : "items-center justify-center overflow-hidden",
        )}
      >
        {link.isPending ? (
          <Skeleton className="m-4 h-64 w-full" />
        ) : link.isError ? (
          <p role="alert" className="m-auto p-6 text-center text-sm text-rust-ink">
            Gambar tidak dapat dimuat: {link.error instanceof Error ? link.error.message : String(link.error)}
          </p>
        ) : unreadable ? (
          <p className="m-auto p-6 text-center text-sm text-ink-muted">
            Berkas ini tidak bisa ditampilkan di sini. Buka di tab baru untuk melihat atau menyimpannya.
          </p>
        ) : (
          <>
            {/* A phone photo is a few hundred KB over a site's connection. */}
            {!loaded && <p className="m-auto p-6 text-sm text-ink-muted">Memuat gambar…</p>}
            {/* A CSS rotation leaves the layout box as it was, so at full size
                a sideways photo is given a box with its sides swapped and
                the picture is turned inside it -- or the scroller would cut
                one end off and scroll over empty space at the other. */}
            <div
              className={cn("relative m-auto shrink-0", !loaded && "hidden")}
              style={zoomed && natural
                ? { width: sideways ? natural.height : natural.width, height: sideways ? natural.width : natural.height }
                : undefined}
            >
              <img
                src={url}
                alt={file.name ?? "Pratinjau berkas"}
                onLoad={(event) => {
                  setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
                  setLoaded(true);
                }}
                onError={() => setBroken(true)}
                onClick={() => setZoomed((z) => !z)}
                style={{
                  transform: zoomed
                    ? `translate(-50%, -50%) rotate(${turns * 90}deg)`
                    : `rotate(${turns * 90}deg)`,
                }}
                className={cn(
                  "select-none",
                  zoomed
                    ? "absolute top-1/2 left-1/2 max-w-none cursor-zoom-out"
                    : cn("cursor-zoom-in object-contain transition-transform",
                      sideways ? "max-h-[60dvh] max-w-[60dvh]" : "max-h-[70dvh] max-w-full"),
                )}
              />
            </div>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!url || unreadable}
          onClick={() => setZoomed((z) => !z)}>
          {zoomed ? <><ZoomOut /> Sesuaikan layar</> : <><ZoomIn /> Ukuran asli</>}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!url || unreadable}
          onClick={() => setTurns((t) => (t + 1) % 4)}>
          <RotateCw /> Putar
        </Button>
        {url && (
          <Button asChild size="sm" variant="ghost" className="ml-auto">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> Buka di tab baru
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
