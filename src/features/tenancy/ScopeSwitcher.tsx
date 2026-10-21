import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Layers, Loader2, Network } from "lucide-react";
import { useScope } from "./useScope";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { businessTypeLabel } from "./businessType";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/features/auth/store/authStore";
import { usesDriverConsole } from "@/layouts/nav";

/**
 * Current tenant and branch, and how to change either.
 *
 * Deliberately prominent: verifying a payment or confirming a dispatch in the
 * wrong scope is the expensive mistake this control exists to prevent, so the
 * active scope is always on screen rather than hidden in a menu. That argument
 * only got stronger with a tenant tree — the wrong branch is one depot, the
 * wrong tenant is a different company's books.
 *
 * Was BranchSwitcher. Extended rather than replaced: it already handled the
 * consolidated "Semua" mode, which is the same idea one level up.
 */
export function ScopeSwitcher() {
  const {
    branches, branch, branchId, isConsolidated, canSeeAll, setBranch,
    tenant, tenants, canSwitchTenant, setTenant,
  } = useScope();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const permissions = useAuthStore((s) => s.user?.permissions);
  const switching = useDeskMutation({
    mutationFn: setTenant,
    errorTitle: "Gagal berpindah perusahaan",
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // The API may return the acting tenant before its ancestors. The level
  // number is meaningful only when the list follows the same top-down order,
  // so keep the source immutable and preserve its order within each level.
  const orderedTenants = [...tenants].sort((a, b) => a.level - b.level);

  // Nothing to switch between at either level: state the scope without
  // offering a choice.
  //
  // A sopir is the other reason to collapse this. GET /tenants returns their
  // own tenant's ancestors too -- for breadcrumb context, so `canSwitchTenant`
  // reads true the moment their tenant sits under a group -- but a driver's
  // whole world is the one branch their driver record belongs to, never a
  // different tenant and never a consolidated "every branch" view. Offering
  // either here would be a choice with no correct answer to give someone whose
  // job is a single run, not a switch to Bimbo Holdings' own books.
  if ((branches.length <= 1 && !canSeeAll && !canSwitchTenant) || usesDriverConsole(permissions)) {
    return (
      <span className="hidden max-w-[22rem] items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-muted sm:flex">
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        {tenant && (
          <>
            <span className="truncate text-ink">{tenant.nama}</span>
            <span aria-hidden>·</span>
          </>
        )}
        <span className="shrink-0">{branch?.nama ?? "—"}</span>
      </span>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={canSwitchTenant ? "Ganti perusahaan atau cabang" : "Ganti cabang"}
        className={cn(
          "flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
          isConsolidated
            ? "border-signal bg-signal-soft text-signal-ink"
            : "border-line text-ink hover:border-line-strong",
        )}
      >
        {isConsolidated ? (
          <Layers className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Building2 className="h-3.5 w-3.5 shrink-0" />
        )}
        {/* On phones the branch code carries the scope in ~82px instead of
            ~146px. It stays on screen either way: acting in the wrong cabang is
            the mistake this control exists to prevent, so it is never hidden. */}
        <span className="sm:hidden">
          {isConsolidated ? "Semua" : (branch?.kode ?? "—")}
        </span>
        <span className="hidden max-w-[22rem] truncate sm:inline">
          {/* Tenant first, because it is the coarser mistake -- and named even
              when it is the only one: the company is whose books every page
              shows, and a user with one membership still needs to see which. */}
          {tenant ? `${tenant.nama} · ` : ""}
          {isConsolidated ? "Semua cabang" : (branch?.nama ?? "Pilih cabang")}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="animate-in-up absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-1rem))] overflow-hidden rounded-md border border-line bg-panel shadow-pop">
          {canSwitchTenant && (
            <>
              <div className="flex items-end justify-between border-b border-line px-4 py-2.5">
                <p className="label text-2xs text-ink-muted">Struktur perusahaan</p>
                <p className="data text-[0.625rem] text-ink-muted">01 = tertinggi</p>
              </div>
              <ul className="max-h-56 overflow-y-auto border-b border-line">
                {orderedTenants.map((t) => {
                  const active = t.id === tenant?.id;
                  const pending = switching.isPending && switching.variables === t.id;
                  const displayLevel = t.level + 1;
                  return (
                    <li key={t.id}>
                      <button
                        onClick={() => {
                          setOpen(false);
                          if (!active) switching.mutate(t.id);
                        }}
                        disabled={switching.isPending}
                        className={cn(
                          "flex w-full items-center gap-3 border-l-2 border-transparent px-3 py-2.5 text-left transition-colors hover:bg-panel-sunk",
                          active && "border-signal bg-panel-sunk",
                        )}
                        aria-current={active ? "true" : undefined}
                      >
                        <span
                          className={cn(
                            "data flex h-6 w-8 shrink-0 items-center justify-center rounded-sm border border-line bg-panel-raised text-[0.625rem] font-medium text-ink-muted",
                            active && "border-signal/50 bg-signal-soft text-signal-ink",
                          )}
                          aria-label={`Tingkat ${displayLevel}`}
                        >
                          {String(displayLevel).padStart(2, "0")}
                        </span>
                        <span
                          className="flex min-w-0 flex-1 items-center gap-2.5"
                          style={{ paddingLeft: `${Math.min(t.level, 4) * 0.75}rem` }}
                        >
                          {t.jenis === "grup" ? (
                            <Network className="h-4 w-4 shrink-0 text-ink-muted" />
                          ) : (
                            <Building2 className="h-4 w-4 shrink-0 text-ink-muted" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">
                              {t.name}
                            </span>
                            <span className="block truncate text-2xs text-ink-muted">
                              Tingkat {displayLevel}
                              {t.jenis === "grup"
                                ? " · Grup induk"
                                : t.jenisUsaha
                                  ? ` · ${businessTypeLabel(t.jenisUsaha)}`
                                  : ""}
                              {/* Reached only by a grant from a group above:
                                  acting here borrows the group's authority. */}
                              {!t.viaMembership && " · lewat grup"}
                            </span>
                          </span>
                        </span>
                        {pending && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-ink-muted" />}
                        {active && <Check className="h-3.5 w-3.5 shrink-0 text-ink" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {!canSwitchTenant && tenant && (
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-2.5">
              <Building2 className="h-4 w-4 shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1">
                <span className="label block text-2xs text-ink-muted">Perusahaan</span>
                <span className="block truncate text-sm font-medium text-ink">{tenant.nama}</span>
              </span>
            </div>
          )}

          <p className="label border-b border-line px-4 py-2 text-2xs text-ink-muted">
            Cabang
          </p>

          {canSeeAll && (
            <button
              onClick={() => {
                setBranch(null);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 border-b border-line px-4 py-2.5 text-left transition-colors hover:bg-panel-sunk",
                isConsolidated && "bg-panel-sunk",
              )}
            >
              <Layers className="h-4 w-4 shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">Semua cabang</span>
                <span className="block text-2xs text-ink-muted">
                  Angka gabungan seluruh cabang
                </span>
              </span>
              {isConsolidated && <Check className="h-3.5 w-3.5 shrink-0 text-ink" />}
            </button>
          )}

          <ul className="max-h-72 overflow-y-auto">
            {branches.map((b) => {
              const active = b.id === branchId;
              return (
                <li key={b.id}>
                  <button
                    onClick={() => {
                      setBranch(b.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-panel-sunk",
                      active && "bg-panel-sunk",
                    )}
                  >
                    <span className="data w-9 shrink-0 rounded-sm bg-panel-raised px-1.5 py-0.5 text-center text-2xs text-ink-muted">
                      {b.kode}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {b.nama}
                      </span>
                      <span className="block truncate text-2xs text-ink-muted">
                        {b.kota}
                      </span>
                    </span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0 text-ink" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
