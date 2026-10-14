import type { ExpenseApi } from "./contract";
import { expenseApiHttp } from "./expenseApi.http";

export type { CreateExpenseInput, ExpenseLineInput, ExpenseView } from "./contract";
export { EXPENSE_STATUS_LABEL } from "./contract";

const api: ExpenseApi = expenseApiHttp;
export const getExpenses = api.getExpenses.bind(api);
export const getExpense = api.getExpense.bind(api);
export const createExpense = api.createExpense.bind(api);
export const updateExpense = api.updateExpense.bind(api);
export const cancelExpense = api.cancelExpense.bind(api);
export const voidExpense = api.voidExpense.bind(api);
export const approveExpense = api.approveExpense.bind(api);
export const rejectExpense = api.rejectExpense.bind(api);
