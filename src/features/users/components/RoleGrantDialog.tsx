import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { scopeKey, getActingTenant } from "@/lib/scope";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SelectInput } from "@/components/common/Field";
import { Skeleton } from "@/components/common/Panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getUserRoles, grantRole, listGrantableRoles, revokeRole } from "@/features/users/api/userApi";
import { getBranches } from "@/features/tenancy/api/tenancyApi";
import type { UserEntity } from "@/types/domain";

const SCOPE_LABEL = { tenant: "Seluruh perusahaan", subtree: "Perusahaan dan anak usahanya", branch: "Satu cabang" } as const;

/**
 * A user's roles in the acting tenant: what they hold, and granting or
 * revoking one (plan 3.4). The server decides what may be granted -- never
 * super_admin, never one's own roles, nothing beyond the grantor's own
 * permissions, never the last administrator removed -- and says why in a
 * sentence this dialog shows. A change applies on the user's next request.
 */
export function RoleGrantDialog({ user, onClose }: { user: UserEntity | null; onClose: () => void }) {
  const open = !!user;
  const grants = useQuery({
    queryKey: [...scopeKey(), "users", user?.id, "roles"],
    queryFn: () => getUserRoles(user!.id),
    enabled: open,
  });
  const roles = useQuery({ queryKey: [...scopeKey(), "roles", "grantable"], queryFn: listGrantableRoles, enabled: open });
  const branches = useQuery({
    queryKey: [...scopeKey(), "branches", "for-grant"],
    queryFn: () => getBranches(getActingTenant()),
    enabled: open,
  });

  const [roleId, setRoleId] = useState("");
  const [scope, setScope] = useState<"tenant" | "branch">("tenant");
  const [branchId, setBranchId] = useState("");

  const grantMutation = useDeskMutation({
    mutationFn: (input: { roleId: string; scope: "tenant" | "branch"; branchId?: string }) => grantRole(user!.id, input),
    errorTitle: "Peran tidak dapat diberikan",
    success: (g) => ({ title: `${user?.nama} kini ${g.roleName}` }),
    onDone: () => setRoleId(""),
  });
  const revokeMutation = useDeskMutation({
    mutationFn: (grantId: string) => revokeRole(user!.id, grantId),
    errorTitle: "Peran tidak dapat dicabut",
    success: "Peran dicabut",
  });

  const close = () => {
    setRoleId("");
    setScope("tenant");
    setBranchId("");
    onClose();
  };
  const canGrant = roleId !== "" && (scope === "tenant" || branchId !== "") && !grantMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Peran {user?.nama}</DialogTitle>
          <DialogDescription>
            Perubahan berlaku pada permintaan berikutnya dari pengguna ini. Peran yang memuat izin di luar izin Anda
            sendiri tidak dapat diberikan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {grants.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (grants.data ?? []).length === 0 ? (
            <p className="text-sm text-ink-muted">Belum ada peran di perusahaan ini.</p>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line">
              {(grants.data ?? []).map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-ink">{g.roleName}</p>
                    <p className="text-2xs text-ink-muted">
                      {g.scope === "branch" ? `Cabang ${g.branchName ?? ""}` : SCOPE_LABEL[g.scope]}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Cabut peran ${g.roleName}`}
                    disabled={revokeMutation.isPending}
                    onClick={() => revokeMutation.mutate(g.id)}
                    className="hover:bg-rust-soft hover:text-rust-ink"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <Field label="Tambah peran" htmlFor="grant-role" className="sm:col-span-2">
            <SelectInput id="grant-role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">Pilih peran</option>
              {(roles.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Berlaku untuk" htmlFor="grant-scope">
            <SelectInput id="grant-scope" value={scope} onChange={(e) => setScope(e.target.value as "tenant" | "branch")}>
              <option value="tenant">{SCOPE_LABEL.tenant}</option>
              <option value="branch">{SCOPE_LABEL.branch}</option>
            </SelectInput>
          </Field>
          {scope === "branch" && (
            <Field label="Cabang" htmlFor="grant-branch">
              <SelectInput id="grant-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Pilih cabang</option>
                {(branches.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nama}
                  </option>
                ))}
              </SelectInput>
            </Field>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Tutup
          </Button>
          <Button
            onClick={() => grantMutation.mutate({ roleId, scope, branchId: scope === "branch" ? branchId : undefined })}
            disabled={!canGrant}
          >
            Tambah peran
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
