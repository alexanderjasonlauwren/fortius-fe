import { pick } from "@/lib/dataSource";
import type { ExpenseApi } from "./contract";
import { expenseApiHttp } from "./expenseApi.http";
import { expenseApiMock } from "./expenseApi.mock";

export type { ExpenseView } from "./contract";
export { EXPENSE_STATUS_LABEL } from "./contract";

const api: ExpenseApi = pick(expenseApiMock, expenseApiHttp);
export const getExpenses = api.getExpenses.bind(api);
export const createExpense = api.createExpense.bind(api);
export const approveExpense = api.approveExpense.bind(api);
export const rejectExpense = api.rejectExpense.bind(api);
