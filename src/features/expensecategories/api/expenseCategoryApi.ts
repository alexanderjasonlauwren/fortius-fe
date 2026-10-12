import { expenseCategoryApiHttp } from "./expenseCategoryApi.http";
import type { ExpenseCategoryApi } from "./contract";

export type {
  CreateExpenseCategoryInput,
  ExpenseCategoryApi,
  ExpenseCategoryView,
  UpdateExpenseCategoryInput,
} from "./contract";

const api: ExpenseCategoryApi = expenseCategoryApiHttp;

export const getExpenseCategories = api.getExpenseCategories.bind(api);
export const createExpenseCategory = api.createExpenseCategory.bind(api);
export const updateExpenseCategory = api.updateExpenseCategory.bind(api);
export const deleteExpenseCategory = api.deleteExpenseCategory.bind(api);
