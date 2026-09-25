import { crewedArmada } from "@/mocks/fleet";
import { scopeKey } from "@/mocks/scope";
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CornerDownLeft, Search, Store, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDb } from "@/mocks/db";
import { ALL_NAV_ITEMS, mayOpen, isAvailableForIntake } from "./nav";
import { useIntakePolicy } from "@/features/distribution/hooks/useIntakePolicy";
import { useAuthStore } from "@/features/auth/store/authStore";
import { outletLabel, outletLabelTitle } from "@/lib/lexicon";
import { useResettableState } from "@/hooks/useResettableState";

// A stable reference: `?? []` inside the selector would return a new array
// on every render and re-run the memo below forever.
const EMPTY_PERMISSIONS: readonly string[] = [];

interface Entry {
  id: string;
  label: string;
  hint: string;
  group: string;
  href: string;
  icon: typeof Search;
}

/**
 * Jump-to for the whole console. Nav is only ever a dozen items; what people
 * actually hunt for is a specific outlet or truck, so those are searchable too.
 */
export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const records = useQuery({
    queryKey: [...scopeKey(), "palette-records"],
    queryFn: async () => {
      const db = getDb();
      return {
        outlet: db.outlets.map((p) => ({
          id: p.id,
          nama: p.nama,
          kecamatan: p.kecamatan,
          kode: p.kode,
        })),
        drivers: db.drivers.map((d) => ({
          id: d.id,
          nama: d.nama,
          // The truck, from the fleet. A driver has no plate of their own --
          // the pairing belongs to the run, and `crewedVehicle` is what stands
          // in for it in this build.
          ...crewedArmada(db, d),
        })),
      };
    },
    enabled: open,
  });

  const held = useAuthStore((s) => s.user?.permissions) ?? EMPTY_PERMISSIONS;
  const policy = useIntakePolicy();
  const intakeMode = policy.isSuccess ? policy.data : undefined;

  const entries = useMemo<Entry[]>(() => {
    // Filtered like the sidebar: ⌘K offering a page that answers a refusal
    // panel is the same broken promise, just faster to reach.
    const nav: Entry[] = ALL_NAV_ITEMS.filter((i) => mayOpen(i, held) && isAvailableForIntake(i, intakeMode)).map((i) => ({
      id: `nav-${i.href}`,
      label: i.name,
      hint: i.hint,
      group: "Halaman",
      href: i.href,
      icon: i.icon,
    }));

    const outlet: Entry[] = (records.data?.outlet ?? []).map((p) => ({
      id: `pkl-${p.id}`,
      label: p.nama,
      hint: `${p.kode} · Kec. ${p.kecamatan}`,
      group: outletLabelTitle(),
      href: `/outlet/${p.id}`,
      icon: Store,
    }));

    const drivers: Entry[] = (records.data?.drivers ?? []).map((d) => ({
      id: `drv-${d.id}`,
      label: d.nama,
      hint: `${d.plat} · ${d.armada}`,
      group: "Armada",
      href: `/drivers/${d.id}`,
      icon: Truck,
    }));

    return [...nav, ...outlet, ...drivers];
  }, [records.data, held, intakeMode]);

  // Each opening starts clean. Reset during render rather than in an effect,
  // so the palette never paints one frame carrying the previous search.
  const [query, setQuery] = useResettableState([open], () => "");
  const [cursor, setCursor] = useResettableState([open], () => 0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? entries.filter(
          (e) =>
            e.label.toLowerCase().includes(q) || e.hint.toLowerCase().includes(q),
        )
      : entries.filter((e) => e.group === "Halaman");
    return matched.slice(0, 12);
  }, [entries, query]);

  useEffect(() => {
    // Focus stays in an effect: moving it is a real side effect on the DOM,
    // not state, and it has to happen after the dialog has painted.
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const go = (entry?: Entry) => {
    if (!entry) return;
    onClose();
    navigate(entry.href);
  };

  let lastGroup = "";

  return createPortal(
    <div
      className="fixed inset-0 z-[1500] flex items-start justify-center bg-ink/45 px-4 pt-[12vh] backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Cari halaman, ${outletLabel()}, atau armada`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(results.length - 1, c + 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(0, c - 1));
          }
          if (e.key === "Enter") {
            e.preventDefault();
            go(results[cursor]);
          }
        }}
        className="animate-in-up w-full max-w-xl overflow-hidden rounded-md border border-line bg-panel shadow-pop"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-ink-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            placeholder={`Cari halaman, ${outletLabel()}, atau nomor plat`}
            className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
          <kbd className="label rounded-sm border border-line px-1.5 py-0.5 text-[0.625rem] text-ink-muted">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-80 overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">
              Tidak ada yang cocok dengan “{query}”. Coba nama {outletLabel()}, nomor
              plat, atau nama halaman.
            </p>
          ) : (
            results.map((entry, index) => {
              const showGroup = entry.group !== lastGroup;
              lastGroup = entry.group;
              const Icon = entry.icon;
              return (
                <div key={entry.id}>
                  {showGroup && (
                    <p className="label px-4 pb-1 pt-3 text-2xs text-ink-muted">
                      {entry.group}
                    </p>
                  )}
                  <button
                    type="button"
                    data-index={index}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => go(entry)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2 text-left transition-colors",
                      index === cursor ? "bg-panel-raised" : "hover:bg-panel-sunk",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {entry.label}
                      </span>
                      <span className="block truncate text-xs text-ink-muted">
                        {entry.hint}
                      </span>
                    </span>
                    {index === cursor && (
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
