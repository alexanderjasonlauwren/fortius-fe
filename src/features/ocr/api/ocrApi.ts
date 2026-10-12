import type { OcrApi } from "./contract";
import { ocrApiHttp } from "./ocrApi.http";

export type { ReceiptExtraction } from "./contract";
const api: OcrApi = ocrApiHttp;
export const getReceipts = api.getReceipts.bind(api);
export const createReceipt = api.createReceipt.bind(api);
export const verifyReceipt = api.verifyReceipt.bind(api);
