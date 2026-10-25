import { useRouteError, Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorBoundary() {
  const error = useRouteError() as Error | null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-lg">
        {/* Errors state what happened and what to do — they do not apologise. */}
        <div className="spine rounded-md border border-line bg-panel p-6 text-rust">
          <p className="label text-2xs text-ink-muted">Kesalahan sistem</p>
          <h1 className="mt-2 text-xl font-bold tracking-[-0.02em] text-ink">
            Halaman gagal dimuat
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Konsol berhenti sebelum halaman ini selesai ditampilkan. Data Anda tetap tersimpan. Biasanya cukup dengan memuat ulang halaman.
          </p>

          {error?.message && (
            <p className="data mt-4 break-words rounded-sm border border-line bg-panel-sunk px-3 py-2 text-xs text-ink-muted">
              {error.message}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Muat ulang halaman
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard">Ke papan berangkat</Link>
            </Button>
          </div>

          {import.meta.env.DEV && error?.stack && (
            <details className="mt-5">
              <summary className="cursor-pointer text-xs font-semibold text-ink-muted hover:text-ink">
                Rincian teknis
              </summary>
              <pre className="data mt-2 max-h-64 overflow-auto rounded-sm bg-ink p-3 text-2xs leading-relaxed text-ink-on">
                {error.stack}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
