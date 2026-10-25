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
import { leafAccounts } from "@/features/finance/lib/accounts";
import { scopeKey } from "@/lib/scope";

const CLASS_LABEL: Record<AssetClass, string> = {
  building: "Bangunan",
  vehicle: "Kendaraan",
  office_equipment: "Inventaris Kantor",
  intangible: "Aset Tidak Berwujud",
  prepaid: "Sewa Dibayar Dimuka (Prepaid)",
};

/** What an edit may set. Disposing is its own action (DisposeAssetDialog),
 *  because it posts the journal that takes the asset off the books. */
type EditableStatus = Exclude<AssetStatus, "disposed">;
const STATUS_LABEL: Record<EditableStatus, string> = {
  active: "Aktif",
  fully_depreciated: "Habis Disusutkan",
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
  const [status, setStatus] = useState<EditableStatus>(asset?.status === "fully_depreciated" ? "fully_depreciated" : "active");
  const [creditAccountId, setCreditAccountId] = useState("");

  const vehicles = useQuery({ queryKey: [...scopeKey(), "assets", "vehicles"], queryFn: () => getVehicles(), enabled: open && assetClass === "vehicle" });
  const accounts = useQuery({ queryKey: [...scopeKey(), "assets", "accounts"], queryFn: getChartOfAccounts, enabled: open && !editing });
  // leafAccounts: ledger.Post refuses a line posted to a grouping header
  // ("Akun %s adalah akun induk; posting harus ke sub-akun"), caught live
  // posting a manual journal to one -- the same chart, so an asset's own
  // account overrides exclude parents too (an asset posts through these
  // every depreciation run).
  const assetAccounts = leafAccounts((accounts.data ?? []).filter((a) => a.akun.tipe === "Aset"));
  const expenseAccounts = leafAccounts((accounts.data ?? []).filter((a) => a.akun.tipe === "Beban"));
  // Paid from kas/bank, owed to a vendor, or put in by the owners.
  const creditAccounts = leafAccounts((accounts.data ?? []).filter((a) => a.akun.tipe !== "Pendapatan" && a.akun.tipe !== "Beban"));

  const save = useDeskMutation({
    mutationFn: () =>
      editing
        ? updateAsset({
            id: asset.id, version: asset.version, name, residualValue, usefulLifeMonths, status,
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
            creditAccountId: creditAccountId || undefined,
          }),
    success: (row) => ({ title: `${row.assetCode} ${editing ? "diperbarui" : "didaftarkan"}` }),
    errorTitle: "Aset tidak tersimpan",
    onDone: () => { onSaved(); onClose(); },
  });

  const canSubmit = editing
    ? !!name.trim() && residualValue < (asset?.cost ?? 0) && usefulLifeMonths > 0
    : !!assetCode.trim() && !!name.trim() && cost > 0 && residualValue < cost && usefulLifeMonths > 0 &&
      (openingAccumulated === 0 || !!openingAsOf);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Ubah ${asset.assetCode}` : "Daftarkan aset"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Kelas, kode, dan akun tidak dapat diubah. Bila salah, daftarkan ulang asetnya."
              : "Kelas aset menentukan akun aset, akumulasi, dan beban yang dipakai. Isi akun di bawah hanya bila ingin memakai akun lain."}
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
                <Field label="Akumulasi awal" htmlFor="ast-opening" hint="Opsional: penyusutan yang sudah terjadi sebelum aset dicatat di sini.">
                  <TextInput id="ast-opening" type="number" min={0} mono value={openingAccumulated} onChange={(e) => setOpeningAccumulated(Number(e.target.value))} />
                </Field>
                <Field label="Per tanggal" htmlFor="ast-opening-asof" required={openingAccumulated > 0}>
                  <TextInput id="ast-opening-asof" type="date" value={openingAsOf} onChange={(e) => setOpeningAsOf(e.target.value)} />
                </Field>
              </div>

              <Field label="Dikreditkan dari" htmlFor="ast-credit"
                hint="Akun pembayarannya: kas/bank, atau hutang bila belum dibayar. Kosongkan bila aset sudah tercatat di saldo awal atau lewat tagihan vendor.">
                <SelectInput id="ast-credit" value={creditAccountId} onChange={(e) => setCreditAccountId(e.target.value)}>
                  <option value="">— Tidak dijurnal —</option>
                  {creditAccounts.map((a) => (
                    <option key={a.akun.id} value={a.akun.id}>{a.akun.kode} · {a.akun.nama}</option>
                  ))}
                </SelectInput>
              </Field>

              {assetClass === "vehicle" && (
                <Field label="Kendaraan (opsional)" htmlFor="ast-vehicle">
                  <SelectInput id="ast-vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                    <option value="">— Tidak ditautkan —</option>
                    {(vehicles.data ?? []).map((v) => (
                      <option key={v.id} value={v.id}>{v.plat} · {v.armada}</option>
                    ))}
                  </SelectInput>
                </Field>
              )}

              <div className="space-y-2 rounded-md border border-line p-3">
                <p className="text-xs font-semibold text-ink-muted">Akun (opsional, kosongkan untuk memakai akun kelas aset)</p>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Akun aset" htmlFor="ast-acc-asset">
                    <SelectInput id="ast-acc-asset" value={assetAccountId} onChange={(e) => setAssetAccountId(e.target.value)}>
                      <option value="">— Default —</option>
                      {assetAccounts.map((a) => (
                        <option key={a.akun.id} value={a.akun.id}>{a.akun.kode} · {a.akun.nama}</option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label="Akun akumulasi" htmlFor="ast-acc-accum">
                    <SelectInput id="ast-acc-accum" value={accumulatedAccountId} onChange={(e) => setAccumulatedAccountId(e.target.value)}>
                      <option value="">— Default —</option>
                      {assetAccounts.map((a) => (
                        <option key={a.akun.id} value={a.akun.id}>{a.akun.kode} · {a.akun.nama}</option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label="Akun beban" htmlFor="ast-acc-expense">
                    <SelectInput id="ast-acc-expense" value={expenseAccountId} onChange={(e) => setExpenseAccountId(e.target.value)}>
                      <option value="">— Default —</option>
                      {expenseAccounts.map((a) => (
                        <option key={a.akun.id} value={a.akun.id}>{a.akun.kode} · {a.akun.nama}</option>
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
                <SelectInput id="ast-status" value={status} onChange={(e) => setStatus(e.target.value as EditableStatus)}>
                  {Object.entries(STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </SelectInput>
              </Field>
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
