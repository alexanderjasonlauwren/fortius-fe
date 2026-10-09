/**
 * What every expense-category adapter must provide.
 *
 * Gap-closing plan, Phase F: `core.expenses.category` is a composite FK into
 * `core.expense_categories.code`, not a fixed CHECK list -- this feature is
 * what lets the expense form's picker and this admin screen's own list both
 * read the tenant's real category set instead of a hardcoded enum.
 */

export interface ExpenseCategoryView {
  id: string;
  code: string;
  name: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  groupLabel: string;
  sortOrder: number;
  status: "atv" | "ina";
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseCategoryInput {
  code: string;
  name: string;
  accountId: string;
  groupLabel: string;
  sortOrder?: number;
}

export interface UpdateExpenseCategoryInput {
  id: string;
  version: number;
  name?: string;
  accountId?: string;
  groupLabel?: string;
  sortOrder?: number;
  status?: "atv" | "ina";
}

export interface ExpenseCategoryApi {
  getExpenseCategories(): Promise<ExpenseCategoryView[]>;
  createExpenseCategory(input: CreateExpenseCategoryInput): Promise<ExpenseCategoryView>;
  updateExpenseCategory(input: UpdateExpenseCategoryInput): Promise<ExpenseCategoryView>;
  deleteExpenseCategory(id: string): Promise<void>;
}
