import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ChevronRight, LogIn } from "lucide-react";
import { deactivateTenant, getTenant } from "@/features/tenancy/api/tenancyApi";
import { useScope } from "@/features/tenancy/useScope";
import { businessTypeLabel } from "@/features/tenancy/businessType";
import { scopeKey } from "@/lib/scope";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { useState } from "react";

/**
 * One tenant: where it sits, who it is, and the way into it.
 *
 * # Read-only, deliberately
 *
 * Settings and profile are shown here and edited on /settings — for the tenant
 * you are ACTING as. Reads travel down the tenant tree and writes do not
 * (`WITH CHECK (tenant_id = current_tenant_id())` on 55 tables), so a form on
 * this page would have to either fail for every tenant but one, or switch
 * underneath the user without saying so.
 *
 * "Beralih ke tenant ini" is that rule made into an action rather than an error:
 * one write path, and it is the same rule that makes a subsidiary's invoice
 * carry the subsidiary's own number series and tax identity.
 */
export function TenantDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { tenant: acting, setTenant } = useScope();

  const [confirming, setConfirming] = useState(false);

  // The switch is a token exchange the server may refuse (a tenant visible from
  // above is not necessarily one this user may act as), so navigation waits
  // for it rather than racing it.
  const enter = useDeskMutation({
    mutationFn: setTenant,
    errorTitle: "Gagal beralih tenant",
    onDone: (_result, tenantId) => navigate(`/settings?tenant=${tenantId}`),
  });

  const deactivate = useDeskMutation({
    mutationFn: () => deactivateTenant(id),
    errorTitle: "Tenant tidak dinonaktifkan",
    success: "Tenant dinonaktifkan",
    onDone: () => {
      setConfirming(false);
      navigate("/tenants");
    },
  });

  const detail = useQuery({
    queryKey: [...scopeKey(), "tenants", id],
    queryFn: () => getTenant(id),
    enabled: !!id,
  });

  const isActing = acting?.id === id;

  if (detail.isLoading || !detail.data) {
    return <Skeleton className="h-64" />;
  }

  const t = detail.data;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Tenant"
        title={t.nama}
        description={
          isActing
            ? "Tenant yang sedang Anda gunakan. Pengaturannya diubah di halaman Pengaturan."
            : "Hanya baca. Beralih ke tenant ini untuk mengubah pengaturannya."
        }
        actions={
          isActing ? (
            <Button variant="outline" onClick={() => navigate("/settings")}>
              Buka pengaturan
            </Button>
          ) : (
            <>
              {/* Deactivation is offered only from OUTSIDE the tenant. Switching
                  into a tenant to switch it off would leave the session acting
                  as something inactive, and every screen would then be scoped to
                  a tenant the console has just been told is gone. */}
              {t.aktif && (
                <Button variant="outline" onClick={() => setConfirming(true)}>
                  Nonaktifkan
                </Button>
              )}
              <Button
                // The destination carries the tenant so the link stays honest;
                // a bare "/settings" would read as naming no tenant at all.
                onClick={() => enter.mutate(t.id)}
                disabled={enter.isPending}
              >
                <LogIn className="mr-1.5 h-4 w-4" />
                Beralih ke tenant ini
              </Button>
            </>
          )
        }
      />

      <Panel>
        <PanelHeader title="Posisi" hint="Induk terdekat ada di paling kanan" />
        <PanelBody>
          {t.leluhur.length === 0 ? (
            <p className="text-xs text-ink-muted">
              Tenant puncak — tidak mewarisi dari siapa pun.
            </p>
          ) : (
            <nav className="flex flex-wrap items-center gap-1.5 text-sm">
              {t.leluhur.map((a) => (
                <span key={a.id} className="flex items-center gap-1.5">
                  <Link
                    to={`/tenants/${a.id}`}
                    className="text-ink-muted underline-offset-2 hover:text-ink hover:underline"
                  >
                    {a.nama}
                  </Link>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                </span>
              ))}
              <span className="font-semibold text-ink">{t.nama}</span>
            </nav>
          )}
        </PanelBody>
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Identitas" hint="Tidak diwarisi — setiap badan hukum punya miliknya sendiri" />
          <PanelBody className="space-y-3 text-sm">
            <Row label="Kode" value={t.kode} mono />
            <Row label="Jenis" value={t.jenis === "grup" ? "Grup" : "Operasional"} />
            <Row label="Jenis usaha" value={t.jenisUsaha ? businessTypeLabel(t.jenisUsaha) : "—"} />
            <Row label="Level" value={`${t.level} — dihitung dari puncak`} />
            {t.profil && (
              <>
                <Row label="Nama legal" value={t.profil.namaLegal} />
                <Row label="Nomor registrasi" value={t.profil.nomorRegistrasi ?? "—"} mono />
                <Row label="PKP" value={t.profil.pkp ? "Ya" : "Belum"} />
                <Row
                  label="Tarif PPN default"
                  value={t.profil.pkp ? `${t.profil.tarifPajakDefault}%` : "—"}
                />
                <Row label="Telepon" value={t.profil.telepon ?? "—"} mono />
                <Row label="Email" value={t.profil.email ?? "—"} />
              </>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Pengaturan"
            hint="Diwarisi per kolom dari induk, kecuali yang diatur sendiri"
          />
          <PanelBody>
            <p className="text-xs leading-relaxed text-ink-muted">
              Jam operasional, istilah dan aturan lapangan diwarisi dari induk
              kecuali tenant ini menetapkannya sendiri.{" "}
              {isActing ? (
                <>
                  Ubah di <Link to="/settings" className="font-medium text-ink underline underline-offset-2">Pengaturan</Link>.
                </>
              ) : (
                <>Beralih ke tenant ini untuk melihat dan mengubahnya.</>
              )}
            </p>
          </PanelBody>
        </Panel>
      </div>

      <ConfirmDialog
        isOpen={confirming}
        title={`Nonaktifkan ${t.nama}?`}
        message="Tenant tidak dihapus — datanya tetap ada dan dapat dibaca."
        details="Ditolak bila masih ada sub-tenant yang aktif: menonaktifkan induk tidak boleh diam-diam menonaktifkan anak-anaknya."
        confirmLabel="Nonaktifkan"
        isPending={deactivate.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => deactivate.mutate(undefined as never)}
      />
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-2xs text-ink-muted">{label}</span>
      <span className={mono ? "data text-ink" : "text-ink"}>{value}</span>
    </div>
  );
}
