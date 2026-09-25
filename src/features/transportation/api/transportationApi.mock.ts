import { latency } from "@/mocks/db";
import { scopedDb, getActiveScope } from "@/mocks/scope";
import {
  deleteTransportationClaim,
  generateTransportationClaimLines,
  saveTransportationClaim,
  updateTransportationClaimStatus,
} from "@/mocks/rules";
import { ApiError } from "@/mocks/db";
import type {
  BeritaAcaraDocument,
  BeritaAcaraGroup,
  BeritaAcaraLine,
  ClaimFilters,
  ClaimView,
  CreateClaimInput,
  FooterRate,
  RecapFilters,
  RecapReport,
  RecapRow,
  TransportationClaimApi,
  UpdateClaimInput,
  UpdateClaimStatusInput,
} from "./contract";
import type { ID } from "@/types/domain";

async function getClaims(filters?: ClaimFilters): Promise<ClaimView[]> {
  await latency("read");
  return scopedDb()
    .transportationClaims.filter((c) => {
      if (
        filters?.claimStatus &&
        filters.claimStatus !== "Semua" &&
        c.claimStatus !== filters.claimStatus
      ) {
        return false;
      }
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        return (
          c.claimNumber.toLowerCase().includes(q) ||
          (c.handoverReference ?? "").toLowerCase().includes(q) ||
          (c.principalInvoiceNumber ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => b.handoverDate.localeCompare(a.handoverDate));
}

async function createClaim(input: CreateClaimInput): Promise<ClaimView> {
  await latency("write");
  return saveTransportationClaim(input);
}

async function updateClaim(input: UpdateClaimInput): Promise<ClaimView> {
  await latency("write");
  return saveTransportationClaim(input);
}

async function updateClaimStatus(input: UpdateClaimStatusInput): Promise<ClaimView> {
  await latency("write");
  return updateTransportationClaimStatus(
    input.id,
    input.claimStatus,
    input.principalInvoiceNumber,
    input.statusNote,
    { settledAt: input.settledAt, settledAmount: input.settledAmount, settlementMode: input.settlementMode },
  );
}

async function deleteClaim(id: ID): Promise<void> {
  await latency("write");
  deleteTransportationClaim(id);
}

async function generateLines(id: ID): Promise<ClaimView> {
  await latency("write");
  return generateTransportationClaimLines(id);
}

async function getDocument(id: ID): Promise<BeritaAcaraDocument> {
  await latency("read");
  const db = scopedDb();
  const claim = db.transportationClaims.find((c) => c.id === id);
  if (!claim) throw new ApiError("Klaim BAST tidak ditemukan.", 404);

  const branch = db.branches.find((b) => b.id === claim.branchId);
  const deliveries = db.deliveries.filter((d) => claim.deliveryIds.includes(d.id));

  const lines: BeritaAcaraLine[] = [];
  const groupsByKey = new Map<
    string,
    BeritaAcaraGroup & { outletCodes: Set<string> }
  >();

  let no = 0;
  for (const delivery of deliveries) {
    const outlet = db.outlets.find((o) => o.id === delivery.outletId);
    for (const line of delivery.lines) {
      const product = db.products.find((p) => p.id === line.productId);
      const weightKg = line.realisasi * 3;
      const amount = Math.round(weightKg * 354.64 * 100) / 100;
      no += 1;
      lines.push({
        no,
        deliveryDate: delivery.tanggal,
        deliveryNumber: delivery.kode,
        outletCode: outlet?.kode ?? "?",
        outletName: outlet?.nama ?? "?",
        productCode: product?.kode ?? "?",
        qty: line.realisasi,
        weightKg,
        ratePerKg: 354.64,
        amount,
        // The mock keeps no separate "current delivered qty" distinct from
        // what was claimed -- a delivery's realisasi and a line's own qty
        // are the same read, so drift cannot occur here the way it can once
        // a real delivery is corrected after its claim was generated.
        hasDrift: false,
      });

      const key = `${delivery.tanggal}|${line.productId}`;
      const existing = groupsByKey.get(key);
      if (existing) {
        existing.qty += line.realisasi;
        existing.weightKg += weightKg;
        existing.amount += amount;
        existing.outletCodes.add(outlet?.kode ?? "?");
      } else {
        groupsByKey.set(key, {
          deliveryDate: delivery.tanggal,
          productCode: product?.kode ?? "?",
          productName: product?.nama ?? "?",
          outletCount: 1,
          qty: line.realisasi,
          weightKg,
          ratePerKg: 354.64,
          amount,
          outletCodes: new Set([outlet?.kode ?? "?"]),
        });
      }
    }
  }

  const groups: BeritaAcaraGroup[] = [...groupsByKey.values()]
    .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))
    .map(({ outletCodes, ...g }) => ({ ...g, outletCount: outletCodes.size }));

  const sumOfLineAmounts = lines.reduce((sum, l) => sum + l.amount, 0);
  const rates: FooterRate[] =
    claim.totalWeightKg > 0
      ? [{ ratePerKg: 354.64, qty: claim.totalQty, weightKg: claim.totalWeightKg, amount: claim.claimedAmount }]
      : [];

  return {
    header: {
      claimNumber: claim.claimNumber,
      handoverReference: claim.handoverReference,
      handoverDate: claim.handoverDate,
      periodStart: claim.periodStart ?? "",
      periodEnd: claim.periodEnd ?? "",
      tenantLegalName: db.settings.namaLegal,
      tenantAddress: db.settings.alamat,
      branchName: branch?.nama ?? "?",
      claimStatus: claim.claimStatus,
      principalInvoiceNumber: claim.principalInvoiceNumber,
    },
    groups,
    lines,
    footer: {
      lineCount: lines.length,
      groupCount: groups.length,
      totalQty: claim.totalQty,
      totalWeightKg: claim.totalWeightKg,
      rates,
      amount: claim.claimedAmount,
      sumOfLineAmounts,
      roundingDifference: Math.round((claim.claimedAmount - sumOfLineAmounts) * 100) / 100,
      driftedLineCount: 0,
    },
    signatory: {
      companyName: db.settings.namaLegal,
      // No signatory captured in the mock's own SettingsEntity (mirrors the
      // real iam.tenant_profiles gap this session also found and fixed on
      // the backend) -- absent here prints a blank signature line, exactly
      // what the real document does for a tenant with none recorded.
      name: undefined,
      title: undefined,
      city: branch?.kota,
    },
  };
}

/** Six months trailing, ending this month -- mirrors the real controller's own default. */
function defaultRecapWindow(): { from: string; to: string } {
  const now = new Date();
  const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const fromDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, "0")}`;
  return { from, to };
}

async function getRecap(filters?: RecapFilters): Promise<RecapReport> {
  await latency("read");
  const { from, to } = { ...defaultRecapWindow(), ...filters };
  const branchId = filters?.branchId ?? getActiveScope().branchId;
  const db = scopedDb();

  const byMonth = new Map<string, RecapRow>();
  for (const claim of db.transportationClaims) {
    if (!claim.periodStart) continue;
    if (branchId && claim.branchId !== branchId) continue;
    const month = claim.periodStart.slice(0, 7);
    if (month < from || month > to) continue;

    const row =
      byMonth.get(month) ??
      ({
        month,
        claimCount: 0,
        totalQty: 0,
        totalWeightKg: 0,
        claimedAmount: 0,
        paidAmount: 0,
        outstandingAmount: 0,
      } satisfies RecapRow);

    row.claimCount += 1;
    row.totalQty += claim.totalQty;
    row.totalWeightKg += claim.totalWeightKg;
    row.claimedAmount += claim.claimedAmount;
    if (claim.claimStatus === "paid") row.paidAmount += claim.settledAmount ?? claim.claimedAmount;
    else if (claim.claimStatus !== "draft" && claim.claimStatus !== "rejected")
      row.outstandingAmount += claim.claimedAmount;
    byMonth.set(month, row);
  }

  const rows = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  const totals = rows.reduce(
    (acc, r) => ({
      claimCount: acc.claimCount + r.claimCount,
      totalQty: acc.totalQty + r.totalQty,
      totalWeightKg: acc.totalWeightKg + r.totalWeightKg,
      claimedAmount: acc.claimedAmount + r.claimedAmount,
      paidAmount: acc.paidAmount + r.paidAmount,
      outstandingAmount: acc.outstandingAmount + r.outstandingAmount,
    }),
    { claimCount: 0, totalQty: 0, totalWeightKg: 0, claimedAmount: 0, paidAmount: 0, outstandingAmount: 0 },
  );

  return { from, to, rows, totals };
}

export const transportationApiMock: TransportationClaimApi = {
  getClaims,
  createClaim,
  updateClaim,
  updateClaimStatus,
  deleteClaim,
  generateLines,
  getDocument,
  getRecap,
};
