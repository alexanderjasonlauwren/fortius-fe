/**
 * Register a new asset, or edit an existing one's register fields.
 *
 * AssetClass, AssetCode and the account mapping are immutable after
 * creation -- mirrors the real backend's own UpdateAssetRequest doc: a
 * correction is made by re-registering the row, not editing these in
 * place. Editing therefore locks those fields rather than hiding them,
 * the same reasoning CashVoucherDialog's own header gives for voucherType.
 * Gap-closing plan, Phase D.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getVehicles } from "@/features/vehicles/api/vehicleApi";
import { getChartOfAccounts } from "@/features/finance/api/financeApi";
import {
  createAsset,
  updateAsset,
  type AssetClass,
  type AssetStatus,
  type AssetView,
} from "@/features/assets/api/assetApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SelectInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { scopeKey } from "@/mocks/scope";

const CLASS_LABEL: Record<AssetClass, string> = {
  building: "Bangunan",
  vehicle: "Kendaraan",
  office_equipment: "Inventaris Kantor",
  intangible: "Aset Tidak Berwujud",
  prepaid: "Sewa Dibayar Dimuka (Prepaid)",
};

const STATUS_LABEL: Record<AssetStatus, string> = {
  active: "Aktif",
  fully_depreciated: "Habis Disusutkan",
  disposed: "Dilepas",
};

interface AssetDialogProps {
  open: boolean;
  /** Present when editing an existing asset; absent when registering a new one. */
  asset?: AssetView | null;
  onClose: () => void;
  onSaved: () => void;
}

export function AssetDialog({ open, asset, onClose, onSaved }: AssetDialogProps) {
  const editing = !!asset;

  const [assetCode, setAssetCode] = useState(asset?.assetCode ?? "");
  const [name, setName] = useState(asset?.name ?? "");
  const [assetClass, setAssetClass] = useState<AssetClass>(asset?.assetClass ?? "vehicle");
  const [acquisitionDate, setAcquisitionDate] = useState(asset?.acquisitionDate ?? new Date().toISOString().slice(0, 10));
  const [depreciationStartDate, setDepreciationStartDate] = useState(asset?.depreciationStartDate ?? new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState(asset?.cost ?? 0);
  const [residualValue, setResidualValue] = useState(asset?.residualValue ?? 0);
  const [usefulLifeMonths, setUsefulLifeMonths] = useState(asset?.usefulLifeMonths ?? 36);
  const [openingAccumulated, setOpeningAccumulated] = useState(asset?.openingAccumulated ?? 0);
  const [openingAsOf, setOpeningAsOf] = useState(asset?.openingAsOf ?? "");
  const [assetAccountId, setAssetAccountId] = useState("");
  const [accumulatedAccountId, setAccumulatedAccountId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [vehicleId, setVehicleId] = useState(asset?.vehicleId ?? "");
  const [status, setStatus] = useState<AssetStatus>(asset?.status ?? "active");
  const [disposedAt, setDisposedAt] = useState(asset?.disposedAt ?? "");

  const vehicles = useQuery({ queryKey: [...scopeKey(), "assets", "vehicles"], queryFn: () => getVehicles(), enabled: open && assetClass === "vehicle" });
  const accounts = useQuery({ queryKey: [...scopeKey(), "assets", "accounts"], queryFn: getChartOfAccounts, enabled: open && !editing });
  const assetAccounts = (accounts.data ?? []).filter((a) => a.akun.tipe === "Aset");
  const expenseAccounts = (accounts.data ?? []).filter((a) => a.akun.tipe === "Beban");

  const save = useDeskMutation({
    mutationFn: () =>
      editing
        ? updateAsset({
            id: asset.id, version: asset.version, name, residualValue, usefulLifeMonths, status,
            disposedAt: status === "disposed" ? disposedAt : undefined,
          })
        : createAsset({
            assetCode, name, assetClass, acquisitionDate, depreciationStartDate,
            cost, residualValue, usefulLifeMonths,
            openingAccumulated: openingAccumulated > 0 ? openingAccumulated : undefined,
            openingAsOf: openingAccumulated > 0 ? openingAsOf : undefined,
            assetAccountId: assetAccountId || undefined,
            accumulatedAccountId: accumulatedAccountId || undefined,
            expenseAccountId: expenseAccountId || undefined,
            vehicleId: assetClass === "vehicle" && vehicleId ? vehicleId : undefined,
          }),
    success: (row) => ({ title: `${row.assetCode} ${editing ? "diperbarui" : "didaftarkan"}` }),
    errorTitle: "Aset tidak tersimpan",
    onDone: () => { onSaved(); onClose(); },
  });

  const canSubmit = editing
    ? !!name.trim() && residualValue < (asset?.cost ?? 0) && usefulLifeMonths > 0 && (status !== "disposed" || !!disposedAt)
    : !!assetCode.trim() && !!name.trim() && cost > 0 && residualValue < cost && usefulLifeMonths > 0 &&
      (openingAccumulated === 0 || !!openingAsOf);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Ubah ${asset.assetCode}` : "Daftarkan aset"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Kelas, kode, dan akun tidak dapat diubah -- daftarkan ulang bila itu yang salah."
              : "Kelas aset menentukan akun aset/akumulasi/beban default -- isi akun di bawah hanya untuk mengganti default itu."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Kode aset" htmlFor="ast-code" required>
              <TextInput id="ast-code" value={assetCode} disabled={editing} onChange={(e) => setAssetCode(e.target.value)} />
            </Field>
            <Field label="Kelas aset" htmlFor="ast-class" required>
              <SelectInput id="ast-class" value={assetClass} disabled={editing} onChange={(e) => setAssetClass(e.target.value as AssetClass)}>
                {Object.entries(CLASS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </SelectInput>
            </Field>
          </div>

          <Field label="Nama" htmlFor="ast-name" required>
            <TextInput id="ast-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Tanggal perolehan" htmlFor="ast-acq" required>
              <TextInput id="ast-acq" type="date" value={acquisitionDate} disabled={editing} onChange={(e) => setAcquisitionDate(e.target.value)} />
            </Field>
            <Field label="Mulai penyusutan" htmlFor="ast-start" required>
              <TextInput id="ast-start" type="date" value={depreciationStartDate} disabled={editing} onChange={(e) => setDepreciationStartDate(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Harga perolehan" htmlFor="ast-cost" required>
              <TextInput id="ast-cost" type="number" min={1} mono value={cost} disabled={editing} onChange={(e) => setCost(Number(e.target.value))} />
            </Field>
            <Field label="Nilai residu" htmlFor="ast-residual" required>
              <TextInput id="ast-residual" type="number" min={0} mono value={residualValue} onChange={(e) => setResidualValue(Number(e.target.value))} />
            </Field>
            <Field label="Umur manfaat (bulan)" htmlFor="ast-life" required>
              <TextInput id="ast-life" type="number" min={1} mono value={usefulLifeMonths} onChange={(e) => setUsefulLifeMonths(Number(e.target.value))} />
            </Field>
          </div>

          {!editing && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Akumulasi awal" htmlFor="ast-opening" hint="Opsional -- penyusutan sebelum register ini ada.">
                  <TextInput id="ast-opening" type="number" min={0} mono value={openingAccumulated} onChange={(e) => setOpeningAccumulated(Number(e.target.value))} />
                </Field>
                <Field label="Per tanggal" htmlFor="ast-opening-asof" required={openingAccumulated > 0}>
                  <TextInput id="ast-opening-asof" type="date" value={openingAsOf} onChange={(e) => setOpeningAsOf(e.target.value)} />
                </Field>
              </div>

              {assetClass === "vehicle" && (
                <Field label="Kendaraan (opsional)" htmlFor="ast-vehicle">
                  <SelectInput id="ast-vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                    <option value="">— Tidak ditautkan —</option>
                    {(vehicles.data ?? []).map((v) => (
                      <option key={v.id} value={v.id}>{v.plat} — {v.armada}</option>
                    ))}
                  </SelectInput>
                </Field>
              )}

              <div className="space-y-2 rounded-md border border-line p-3">
                <p className="text-xs font-semibold text-ink-muted">Akun (opsional -- kosongkan untuk default kelas)</p>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Akun aset" htmlFor="ast-acc-asset">
                    <SelectInput id="ast-acc-asset" value={assetAccountId} onChange={(e) => setAssetAccountId(e.target.value)}>
                      <option value="">— Default —</option>
                      {assetAccounts.map((a) => (
                        <option key={a.akun.id} value={a.akun.id}>{a.akun.kode} — {a.akun.nama}</option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label="Akun akumulasi" htmlFor="ast-acc-accum">
                    <SelectInput id="ast-acc-accum" value={accumulatedAccountId} onChange={(e) => setAccumulatedAccountId(e.target.value)}>
                      <option value="">— Default —</option>
                      {assetAccounts.map((a) => (
                        <option key={a.akun.id} value={a.akun.id}>{a.akun.kode} — {a.akun.nama}</option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label="Akun beban" htmlFor="ast-acc-expense">
                    <SelectInput id="ast-acc-expense" value={expenseAccountId} onChange={(e) => setExpenseAccountId(e.target.value)}>
                      <option value="">— Default —</option>
                      {expenseAccounts.map((a) => (
                        <option key={a.akun.id} value={a.akun.id}>{a.akun.kode} — {a.akun.nama}</option>
                      ))}
                    </SelectInput>
                  </Field>
                </div>
              </div>
            </>
          )}

          {editing && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Status" htmlFor="ast-status" required>
                <SelectInput id="ast-status" value={status} onChange={(e) => setStatus(e.target.value as AssetStatus)}>
                  {Object.entries(STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </SelectInput>
              </Field>
              {status === "disposed" && (
                <Field label="Per tanggal pelepasan" htmlFor="ast-disposed" required>
                  <TextInput id="ast-disposed" type="date" value={disposedAt} onChange={(e) => setDisposedAt(e.target.value)} />
                </Field>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>Batal</Button>
          <Button type="button" disabled={!canSubmit || save.isPending} onClick={() => save.mutate(undefined as never)}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {editing ? "Simpan perubahan" : "Daftarkan aset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
