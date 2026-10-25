import { transactionApiHttp } from "./transactionApi.http";
import type { TransactionsApi } from "./contract";

export { defaultRange } from "./contract";
export type {
  TransactionFilterOptions,
  TransactionFilters,
  TransactionRow,
  TransactionSummary,
} from "./contract";

const api: TransactionsApi = transactionApiHttp;

export const getTransactions = api.getTransactions.bind(api);
export const getTransactionSummary = api.getTransactionSummary.bind(api);
export const getTransactionFilterOptions = api.getTransactionFilterOptions.bind(api);
export const exportTransactionsExcel = api.exportTransactionsExcel.bind(api);
export const exportTransactionsCsv = api.exportTransactionsCsv.bind(api);
