import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Network, Plus } from "lucide-react";
import { getTenants } from "@/features/tenancy/api/tenancyApi";
import { useScope } from "@/features/tenancy/useScope";
import { businessTypeLabel } from "@/features/tenancy/businessType";
import { scopeKey } from "@/lib/scope";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TenantFormDialog } from "@/features/tenancy/components/TenantFormDialog";

/**
 * The tenant tree.
 *
 * Shows what the acting tenant can see: itself, everything beneath it, and the
 * ancestors it inherits from. That is the backend's iam.tenants policy rendered
 * — not a filter this page applies.
 */
export function TenantListPage() {
  const { tenant: acting } = useScope();
  const [creating, setCreating] = useState(false);

  const tenants = useQuery({
    queryKey: [...scopeKey(), "tenants"],
    queryFn: getTenants,
  });

  // Indentation is RELATIVE. `level` counts from the root, so rendering it
  // directly would push a subsidiary's own subtree off the left edge whenever
  // someone acts from inside the tree rather than at the top of it.
  const baseLevel = acting?.level ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Data induk"
        title="Tenant"
        description="Struktur perusahaan yang dapat Anda lihat: tenant Anda, turunannya, dan induk yang diwarisi."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Tambah sub-tenant
          </Button>
        }
      />

      <Panel>
        <PanelHeader
          title="Struktur"
          hint="Sub-tenant dibuat di bawah tenant yang sedang aktif"
        />
        <PanelBody className="p-0">
          {tenants.isLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {tenants.data?.map((t) => {
                const indent = Math.max(0, t.level - baseLevel);
                const isActing = t.id === acting?.id;
                return (
                  <li key={t.id}>
                    <Link
                      to={`/tenants/${t.id}`}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-panel-sunk",
                        isActing && "bg-panel-sunk",
                      )}
                      style={{ paddingLeft: `${1 + indent * 1.25}rem` }}
                    >
                      <Network className="h-4 w-4 shrink-0 text-ink-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">
                          {t.nama}
                          {isActing && (
                            <span className="ml-2 text-2xs font-normal text-ink-muted">
                              (tenant aktif)
                            </span>
                          )}
                        </span>
                        <span className="data block truncate text-2xs text-ink-muted">
                          {t.kode} ·{" "}
                          {t.jenis === "grup"
                            ? "Grup"
                            : businessTypeLabel(t.jenisUsaha)}
                        </span>
                      </span>
                      <StatusBadge
                        variant={t.aktif ? "success" : "draft"}
                        label={t.aktif ? "Aktif" : "Nonaktif"}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </PanelBody>
      </Panel>

      <TenantFormDialog isOpen={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
