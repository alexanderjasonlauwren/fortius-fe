import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader, PanelBody, Skeleton } from "@/components/common/Panel";
import { SegmentedControl } from "@/components/common/Field";
import { useSim3lonSnapshot } from "@/features/sim3lonlive/hooks/useSim3lonSnapshot";
import {
  SECTION_ORDER,
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

  return (
    <div>
      <PageHeader
        eyebrow="Integrasi"
        title="SIM3LON — Data Langsung"
        description="Bukti integrasi: data ini ditarik langsung dari platform SIM3LON Pertamina dan ditampilkan apa adanya di sistem kita."
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
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-500" />
            <div>
              <p className="font-semibold text-ink">Tidak dapat memuat data SIM3LON</p>
              <p className="mt-1 text-sm text-ink-muted">
                {(snapshot.error as Error)?.message ??
                  "Integrasi mungkin belum dikonfigurasi, atau tenant ini bukan tipe SPBE."}
              </p>
            </div>
          </PanelBody>
        </Panel>
      )}

      {snapshot.data && (
        <>
          <ConnectionStatusBanner
            wilayah={snapshot.data.wilayah.name}
            period={snapshot.data.period}
            syncedAt={snapshot.data.syncedAt}
            syncing={sync.isPending}
            onSync={() => sync.mutate()}
          />

          <SegmentedControl
            className="mb-4"
            value={active}
            onChange={setActive}
            options={SECTION_ORDER.filter((s) => snapshot.data!.sections[s.key]).map((s) => {
              const section = snapshot.data!.sections[s.key];
              return { value: s.key, label: s.label, count: sectionCount(section) };
            })}
          />

          {(() => {
            const section = snapshot.data.sections[active];
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
