/**
 * The opening-balance wizard, against the real API.
 *
 * Template is a binary xlsx download -- same blob-download technique
 * externalstatementsApi's own getTemplate already uses. Preview and
 * Commit are both multipart (`as_of` plus the workbook), through the
 * shared `upload` helper.
 */
import { apiClient, upload } from "@/lib/api";
import type {
  OpeningBalanceApi,
  OpeningBalanceCommitResult,
  OpeningBalancePreview,
  OpeningBalanceValidationError,
} from "./contract";

interface PreviewResponse {
  as_of: string;
  balanced: boolean;
  errors: OpeningBalanceValidationError[];
  trial_balance_rows: number;
  total_debit: number;
  total_credit: number;
  piutang_rows: number;
  hutang_rows: number;
  aset_rows: number;
}

interface CommitResponse {
  journal_id: string;
  invoices_created: number;
  purchases_created: number;
  assets_created: number;
}

function toPreview(row: PreviewResponse): OpeningBalancePreview {
  return {
    asOf: row.as_of,
    balanced: row.balanced,
    errors: row.errors ?? [],
    trialBalanceRows: row.trial_balance_rows,
    totalDebit: row.total_debit,
    totalCredit: row.total_credit,
    piutangRows: row.piutang_rows,
    hutangRows: row.hutang_rows,
    asetRows: row.aset_rows,
  };
}

async function getTemplate(asOf: string): Promise<void> {
  const response = await apiClient.get(`/opening-balance/template?as_of=${asOf}`, { responseType: "blob" });
  const disposition: string = response.headers["content-disposition"] ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? "Template_Saldo_Awal.xlsx";

  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function previewOpeningBalance(asOf: string, file: File): Promise<OpeningBalancePreview> {
  const row = await upload<PreviewResponse>("/opening-balance/preview", file, "file", 60_000, { as_of: asOf });
  return toPreview(row);
}

async function commitOpeningBalance(asOf: string, file: File): Promise<OpeningBalanceCommitResult> {
  const row = await upload<CommitResponse>("/opening-balance/commit", file, "file", 60_000, { as_of: asOf });
  return {
    journalId: row.journal_id,
    invoicesCreated: row.invoices_created,
    purchasesCreated: row.purchases_created,
    assetsCreated: row.assets_created,
  };
}

export const openingBalanceApiHttp: OpeningBalanceApi = {
  getTemplate,
  previewOpeningBalance,
  commitOpeningBalance,
};
