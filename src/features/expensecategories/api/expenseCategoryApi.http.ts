/**
 * Expense categories, against the real API.
 *
 * Every field is a straight snake_case-to-camelCase rename of
 * fortius-backend's internal/entities/expensecategory response shapes.
 */
import { getList, send } from "@/lib/api";
import type {
  CreateExpenseCategoryInput,
  ExpenseCategoryApi,
  ExpenseCategoryView,
  UpdateExpenseCategoryInput,
} from "./contract";

interface ExpenseCategoryResponse {
  id: string;
  code: string;
  name: string;
  account_id: string;
  account_code: string;
  group_label: string;
  sort_order: number;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

function toView(row: ExpenseCategoryResponse): ExpenseCategoryView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    accountId: row.account_id,
    accountCode: row.account_code,
    // The list endpoint carries account_code but not the account's own
    // name -- not worth a second request per row just to show it, so the
    // admin screen reads the code alone here, the same trade
    // financeApi.http.ts's own trial-balance fallback accepts.
    accountName: row.account_code,
    groupLabel: row.group_label,
    sortOrder: row.sort_order,
    status: row.status === "ina" ? "ina" : "atv",
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getExpenseCategories(): Promise<ExpenseCategoryView[]> {
  const page = await getList<ExpenseCategoryResponse>("/expense-categories", {
    pageSize: 100,
    sort: [{ field: "sort_order" }],
  });
  return page.items.map(toView);
}

async function createExpenseCategory(input: CreateExpenseCategoryInput): Promise<ExpenseCategoryView> {
  const row = await send<ExpenseCategoryResponse>("post", "/expense-categories", {
    code: input.code,
    name: input.name,
    account_id: input.accountId,
    group_label: input.groupLabel,
    sort_order: input.sortOrder ?? 0,
  });
  return toView(row);
}

async function updateExpenseCategory(input: UpdateExpenseCategoryInput): Promise<ExpenseCategoryView> {
  const row = await send<ExpenseCategoryResponse>("put", `/expense-categories/${input.id}`, {
    version: input.version,
    name: input.name,
    account_id: input.accountId,
    group_label: input.groupLabel,
    sort_order: input.sortOrder,
    status: input.status,
  });
  return toView(row);
}

async function deleteExpenseCategory(id: string): Promise<void> {
  await send("delete", `/expense-categories/${id}`);
}

export const expenseCategoryApiHttp: ExpenseCategoryApi = {
  getExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
};
