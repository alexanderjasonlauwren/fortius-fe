import { useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader, PanelBody, Skeleton } from "@/components/common/Panel";
import { SegmentedControl } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { useSim3lonSnapshot } from "@/features/sim3lonlive/hooks/useSim3lonSnapshot";
import {
  SECTION_ORDER,
  isEmptySnapshot,
  isErrorSection,
  type Section,
} from "@/features/sim3lonlive/api/contract";
import { ConnectionStatusBanner } from "@/features/sim3lonlive/components/ConnectionStatusBanner";
import { PenyaluranMatrix } from "@/features/sim3lonlive/components/PenyaluranMatrix";
import {
  DataTableSection,
  GridTableSection,
  SectionError,
} from "@/features/sim3lonlive/components/SectionTable";

function renderSection(section: Section) {
  if (isErrorSection(section)) return <SectionError message={section.error} />;
  switch (section.kind) {
    case "matrix":
      return <PenyaluranMatrix section={section} />;
    case "grid":
      return <GridTableSection section={section} />;
    case "table":
      return <DataTableSection section={section} />;
  }
}

function sectionCount(section: Section): number | undefined {
  if (isErrorSection(section)) return undefined;
  return section.rows.length;
}

export function SIM3LONIntegrationPage() {
  const { snapshot, sync } = useSim3lonSnapshot();
  const [active, setActive] = useState<string>(SECTION_ORDER[0].key);

  const data = snapshot.data;
  const empty = data ? isEmptySnapshot(data) : false;

  return (
    <div>
      <PageHeader
        eyebrow="Integrasi"
        title="SIM3LON"
        description="Data ini ditarik langsung dari SIM3LON Pertamina dan ditampilkan apa adanya."
      />

      {snapshot.isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {snapshot.isError && (
        <Panel spine="danger">
          <PanelBody className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rust" />
            <div>
              <p className="font-semibold text-ink">Tidak dapat memuat data SIM3LON</p>
              <p className="mt-1 text-sm text-ink-muted">
                {(snapshot.error as Error)?.message ??
                  "Koneksi ke SIM3LON belum diatur, atau perusahaan ini bukan agen LPG. Hubungi admin."}
              </p>
            </div>
          </PanelBody>
        </Panel>
      )}

      {/* Empty snapshot: a sync is (auto-)running, has failed, or can be started. */}
      {data && empty && (
        <Panel>
          <PanelBody className="flex flex-col items-center gap-3 py-12 text-center">
            {sync.isPending ? (
              <>
                <Loader2 className="size-6 animate-spin text-ink-muted" />
                <p className="font-semibold text-ink">Menarik data dari SIM3LON…</p>
                <p className="max-w-md text-sm text-ink-muted">
                  Sedang masuk ke platform SIM3LON dan mengambil data. Ini bisa
                  memakan waktu hingga satu menit pada pengambilan pertama.
                </p>
              </>
            ) : sync.isError ? (
              <>
                <AlertTriangle className="size-6 text-rust" />
                <p className="font-semibold text-ink">Gagal menarik data SIM3LON</p>
                <p className="max-w-md text-sm text-ink-muted">
                  {(sync.error as Error)?.message ?? "Terjadi kesalahan."}
                </p>
                <Button variant="outline" size="sm" onClick={() => sync.mutate()}>
                  <RefreshCw className="size-4" />
                  Coba lagi
                </Button>
              </>
            ) : (
              <>
                <p className="font-semibold text-ink">Belum ada data</p>
                <p className="max-w-md text-sm text-ink-muted">
                  Data belum pernah ditarik untuk periode ini.
                </p>
                <Button variant="outline" size="sm" onClick={() => sync.mutate()}>
                  <RefreshCw className="size-4" />
                  Sinkronkan sekarang
                </Button>
              </>
            )}
          </PanelBody>
        </Panel>
      )}

      {data && !empty && (
        <>
          <ConnectionStatusBanner
            wilayah={data.wilayah?.name ?? "—"}
            period={data.period}
            syncedAt={data.syncedAt ?? ""}
            syncing={sync.isPending}
            onSync={() => sync.mutate()}
          />

          <SegmentedControl
            className="mb-4"
            value={active}
            onChange={setActive}
            options={SECTION_ORDER.filter((s) => data.sections[s.key]).map((s) => {
              const section = data.sections[s.key];
              return { value: s.key, label: s.label, count: sectionCount(section) };
            })}
          />

          {(() => {
            const section = data.sections[active] ?? data.sections[SECTION_ORDER[0].key];
            if (!section) return null;
            return (
              <Panel>
                <PanelHeader
                  title={section.label}
                  hint={
                    isErrorSection(section)
                      ? "Gagal dimuat"
                      : `${sectionCount(section)?.toLocaleString("id-ID")} baris`
                  }
                />
                {renderSection(section)}
              </Panel>
            );
          })()}
        </>
      )}
    </div>
  );
}
