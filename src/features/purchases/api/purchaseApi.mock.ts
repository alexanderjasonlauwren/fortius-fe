/**
 * Purchases, against the mock database.
 *
 * Only the general-purchase path (no Schedule Agreement) posts here -- see
 * contract.ts's own header. Posts through the same `postJournal` every
 * other write-path feature uses: a recorded purchase debits each line's
 * resolved inventory account (a product's own override, role "persediaan"
 * otherwise -- mirrors inventoryLinesFor's own grouping) and credits role
 * "hutangUsaha" for the total; paying it debits "hutangUsaha" and credits
 * the resolved bank/cash leaf.
 */
import { ApiError, latency, mutate, nextId } from "@/mocks/db";
import { scopedDb, stampScope } from "@/mocks/scope";
import { accountByRole, postJournal } from "@/mocks/ledger";
import type { PurchaseEntity, PurchaseLine } from "@/types/domain";
import type {
  GeneralPurchaseLineInput,
  PayPurchaseInput,
  PurchaseApi,
  PurchaseFilters,
  PurchaseView,
  RecordGeneralPurchaseInput,
} from "./contract";

function toView(row: PurchaseEntity, db: ReturnType<typeof scopedDb>): PurchaseView {
  const supplier = db.vendors.find((v) => v.id === row.supplierId);
  return {
    id: row.id,
    purchaseNumber: row.purchaseNumber,
    scheduleAgreementId: row.scheduleAgreementId,
    supplierId: row.supplierId,
    supplierCode: supplier?.code,
    supplierName: supplier?.name,
    lines: row.lines.map((l) => {
      const product = db.products.find((p) => p.id === l.productId);
      return {
        productId: l.productId,
        productCode: product?.kode ?? "",
        productName: product?.nama ?? "",
        quantity: l.quantity,
        unitCost: l.unitCost,
        subtotal: l.subtotal,
      };
    }),
    redeemedAt: row.redeemedAt,
    subtotal: row.subtotal,
    taxPercentage: row.taxPercentage,
    taxAmount: row.taxAmount,
    totalAmount: row.totalAmount,
    totalQty: row.totalQty,
    paymentStatus: row.paymentStatus,
    paidAt: row.paidAt,
    bankReference: row.bankReference,
    notes: row.notes,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getPurchases(filters?: PurchaseFilters): Promise<PurchaseView[]> {
  await latency("read");
  const db = scopedDb();
  return db.purchases
    .map((row) => toView(row, db))
    .filter((p) => !filters?.paymentStatus || filters.paymentStatus === "Semua" || p.paymentStatus === filters.paymentStatus)
    .sort((a, b) => b.redeemedAt.localeCompare(a.redeemedAt));
}

function resolveLines(db: ReturnType<typeof scopedDb>, lines: GeneralPurchaseLineInput[]) {
  const resolved: PurchaseLine[] = [];
  let subtotal = 0;
  let totalQty = 0;
  for (const l of lines) {
    const product = db.products.find((p) => p.id === l.productId);
    if (!product) throw new ApiError("Produk tidak ditemukan.", 400);
    if (l.quantity <= 0) throw new ApiError("Qty harus lebih dari nol.", 422);
    if (l.unitCost <= 0) throw new ApiError("Harga satuan harus lebih dari nol.", 422);
    const lineSubtotal = l.quantity * l.unitCost;
    resolved.push({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost, subtotal: lineSubtotal });
    subtotal += lineSubtotal;
    totalQty += l.quantity;
  }
  return { resolved, subtotal, totalQty };
}

/** Mirrors the real backend's own inventoryLinesFor -- grouped by each
 *  line's resolved inventory account, two lines sharing one collapsing
 *  into a single journal line. */
function inventoryJournalLines(db: ReturnType<typeof scopedDb>, lines: PurchaseLine[]) {
  const byAccountId = new Map<string, number>();
  let roleAmount = 0;
  for (const line of lines) {
    const product = db.products.find((p) => p.id === line.productId)!;
    if (product.inventoryAccountCode) {
      const account = db.accounts.find((a) => a.kode === product.inventoryAccountCode);
      if (!account) throw new ApiError(`Akun persediaan "${product.inventoryAccountCode}" tidak ditemukan.`, 400);
      byAccountId.set(account.id, (byAccountId.get(account.id) ?? 0) + line.subtotal);
    } else {
      roleAmount += line.subtotal;
    }
  }
  const journalLines = [...byAccountId.entries()].map(([akunId, debit]) => ({ akunId, debit, kredit: 0 }));
  if (roleAmount > 0) {
    journalLines.push({ akunId: accountByRole(db, "persediaan").id, debit: roleAmount, kredit: 0 });
  }
  return journalLines;
}

async function recordGeneralPurchase(input: RecordGeneralPurchaseInput): Promise<PurchaseView> {
  await latency("write");
  if (input.lines.length === 0) throw new ApiError("Baris pembelian wajib diisi.", 422);

  return mutate((db) => {
    const supplier = db.vendors.find((v) => v.id === input.supplierId);
    if (!supplier) throw new ApiError("Vendor tidak ditemukan.", 400);
    const branch = db.branches.find((b) => b.utama) ?? db.branches[0];
    if (!branch) throw new ApiError("Tenant ini belum punya cabang.", 400);

    const { resolved, subtotal, totalQty } = resolveLines(db, input.lines);
    const now = new Date().toISOString();
    const seq = db.purchases.length + 1;
    const row: PurchaseEntity = stampScope(
      {
        id: nextId("pur"),
        purchaseNumber: `PB-${now.slice(0, 7).replace("-", "")}-${String(seq).padStart(4, "0")}`,
        supplierId: supplier.id,
        lines: resolved,
        redeemedAt: input.date,
        subtotal,
        taxPercentage: 0,
        taxAmount: 0,
        totalAmount: subtotal,
        totalQty,
        paymentStatus: "unpaid",
        notes: input.notes,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      { actingTenantId: branch.tenantId, branchId: branch.id },
    );
    db.purchases.push(row);

    const inventoryLines = inventoryJournalLines(db, resolved);
    postJournal(db, {
      tanggal: input.date,
      keterangan: `Purchase ${row.purchaseNumber}`,
      sumber: { tipe: "purchase", id: row.id },
      lines: [...inventoryLines, { akunId: accountByRole(db, "hutangUsaha").id, debit: 0, kredit: row.totalAmount }],
      aktor: "Sistem",
      scope: { tenantId: branch.tenantId, branchId: branch.id },
    });

    return toView(row, scopedDb());
  });
}

async function payPurchase(input: PayPurchaseInput): Promise<PurchaseView> {
  await latency("write");
  return mutate((db) => {
    const row = db.purchases.find((p) => p.id === input.id);
    if (!row) throw new ApiError("Pembelian tidak ditemukan.", 404);
    if (row.version !== input.version) {
      throw new ApiError("Pembelian sudah berubah. Muat ulang lalu coba lagi.", 409, "STALE_VERSION");
    }

    const paidAt = new Date().toISOString();
    row.paymentStatus = "paid";
    row.paidAt = paidAt;
    row.bankReference = input.bankReference;
    row.version += 1;
    row.updatedAt = paidAt;

    const bankAccount = input.bankAccountId ? db.bankAccounts.find((b) => b.id === input.bankAccountId) : undefined;
    const liquidRole = bankAccount?.kind === "cash" ? "kas" : "bank";
    postJournal(db, {
      tanggal: paidAt.slice(0, 10),
      keterangan: `Payment for purchase ${row.purchaseNumber}`,
      sumber: { tipe: "purchase", id: row.id },
      lines: [
        { akunId: accountByRole(db, "hutangUsaha").id, debit: row.totalAmount, kredit: 0 },
        { akunId: accountByRole(db, liquidRole).id, debit: 0, kredit: row.totalAmount },
      ],
      aktor: "Sistem",
      scope: { tenantId: row.tenantId, branchId: row.branchId },
    });

    return toView(row, scopedDb());
  });
}

export const purchaseApiMock: PurchaseApi = { getPurchases, recordGeneralPurchase, payPurchase };
