import { bankAccountApiHttp } from "./bankAccountApi.http";
import type { BankAccountApi } from "./contract";

const api: BankAccountApi = bankAccountApiHttp;

export const getBankAccounts = api.getBankAccounts.bind(api);
export const saveBankAccount = api.saveBankAccount.bind(api);
export const deleteBankAccount = api.deleteBankAccount.bind(api);
