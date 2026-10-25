import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { scopeKey } from "@/lib/scope";
import {
  getGeofenceAlerts,
  setGeofenceAlertStatus,
  type GeofenceAlertView,
} from "../api/geofenceApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Panel, PanelHeader } from "@/components/common/Panel";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { SegmentedControl } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { formatNumber } from "@/lib/format";
import type { StatusVariant } from "@/lib/status";

const FILTERS = ["Terbuka", "Semua"] as const;

function toneFor(status: GeofenceAlertView["status"]): StatusVariant {
  if (status === "Terbuka") return "danger";
  if (status === "Ditinjau") return "warning";
  return "success";
}

function clockOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Geofence breaches, on the board where somebody can act on them.
 *
 * # The empty state is the careful part
 *
 * "No violations recorded" and "all clear" are different claims, and only the
 * first one is true. An alert is raised from a driver's own position stream,
 * so a run with recording switched off is never evaluated and produces no
 * alerts however far it strays. Saying "aman" here would turn an absence of
 * data into a statement about the day's driving.
 *
 * # Why the actions are the ones they are
 *
 * The service's lifecycle is open → acknowledged → resolved, or either of
 * those → false positive, and there is no route back to open: reopening is the
 * evaluator's job by filing a fresh alert, not an operator's by rewriting an
 * old one. Resolved and false-positive are terminal and answer 409 to anything
 * further, so the panel offers no button on them rather than one that fails.
 */
export function GeofenceAlertPanel() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("Terbuka");

  const alerts = useQuery({
    queryKey: [...scopeKey(), "geofence-alerts", filter],
    queryFn: () => getGeofenceAlerts({ status: filter }),
    refetchInterval: 30_000,
  });

  const statusMutation = useDeskMutation({
    mutationFn: setGeofenceAlertStatus,
    // Just this panel: the board beside it polls on its own, and the alert
    // list is the only thing this write changes.
    invalidate: [[...scopeKey(), "geofence-alerts"]],
    errorTitle: "Status peringatan tidak tersimpan",
    success: (alert) => ({ title: `Peringatan ditandai ${alert.status.toLowerCase()}` }),
  });

  const rows = alerts.data ?? [];

  return (
    <Panel>
      <PanelHeader
        title="Pelanggaran pagar"
        hint={filter === "Terbuka" ? "Belum ditangani" : "Semua status"}
        actions={
          <SegmentedControl
            value={filter}
            onChange={(v) => setFilter(v as (typeof FILTERS)[number])}
            options={FILTERS.map((f) => ({ value: f, label: f }))}
          />
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="Belum ada pelanggaran tercatat"
          // Not "aman": an alert comes from a driver's position stream, so a
          // run with perekaman off is never checked at all.
          description="Pelanggaran muncul di sini bila armada yang sedang merekam posisi melewati batas pagar. Rute tanpa perekaman tidak diperiksa."
        />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((alert) => (
            <li key={alert.id} className="flex items-center gap-4 px-4 py-3">
              <StatusBadge variant={toneFor(alert.status)} label={alert.status} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">
                  {alert.ruleName ?? "Pagar"} ·{" "}
                  {alert.pelanggaran === "Masuk" ? "memasuki area" : "meninggalkan area"}
                </p>
                <p className="data text-2xs text-ink-muted">
                  {clockOf(alert.terdeteksi)}
                  {alert.jarakMeter !== undefined
                    ? ` · ${formatNumber(Math.round(alert.jarakMeter))} m dari batas`
                    : ""}
                </p>
              </div>
              {alert.status !== "Selesai" && alert.status !== "Bukan pelanggaran" && (
                <CanAccess permission={PERMISSIONS.GEOFENCE_ALERTS_ACK}>
                  <div className="flex gap-2">
                    {alert.status === "Terbuka" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={statusMutation.isPending}
                        onClick={() =>
                          statusMutation.mutate({ id: alert.id, status: "Ditinjau" })
                        }
                      >
                        Tinjau
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={statusMutation.isPending}
                      onClick={() => statusMutation.mutate({ id: alert.id, status: "Selesai" })}
                    >
                      Selesai
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={statusMutation.isPending}
                      onClick={() =>
                        statusMutation.mutate({ id: alert.id, status: "Bukan pelanggaran" })
                      }
                    >
                      Bukan pelanggaran
                    </Button>
                  </div>
                </CanAccess>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
