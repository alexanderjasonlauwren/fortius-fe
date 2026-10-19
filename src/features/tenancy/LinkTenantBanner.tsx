import { ArrowRightLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { useScope } from "./useScope";

/**
 * Shown when the URL names a tenant other than the one the session acts in.
 *
 * The page underneath is still the session tenant's — every request is
 * answered for it — so the banner says so and offers the switch rather than
 * pretending the link worked. A tenant the user may not act in gets only the
 * dismissal: naming it in a URL grants nothing.
 */
export function LinkTenantBanner() {
  const { tenant, linkTenant, linkNamesOtherTenant, setTenant, dismissLinkTenant } = useScope();
  const switching = useDeskMutation({
    mutationFn: setTenant,
    errorTitle: "Gagal berpindah tenant",
  });

  if (!linkNamesOtherTenant) return null;

  return (
    <div
      role="status"
      className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-signal/40 bg-signal-soft px-4 py-3 text-sm text-signal-ink"
    >
      <p className="min-w-0 flex-1">
        {linkTenant ? (
          <>
            Tautan ini untuk <strong>{linkTenant.name}</strong>. Data yang tampil masih milik{" "}
            <strong>{tenant?.nama ?? "tenant aktif"}</strong>.
          </>
        ) : (
          <>
            Tautan ini menyebut tenant yang tidak dapat Anda akses. Data yang tampil milik{" "}
            <strong>{tenant?.nama ?? "tenant aktif"}</strong>.
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={dismissLinkTenant} disabled={switching.isPending}>
          Tetap di sini
        </Button>
        {linkTenant && (
          <Button size="sm" onClick={() => switching.mutate(linkTenant.id)} disabled={switching.isPending}>
            {switching.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <ArrowRightLeft className="mr-1.5 h-4 w-4" />
            )}
            Pindah ke {linkTenant.name}
          </Button>
        )}
      </div>
    </div>
  );
}
