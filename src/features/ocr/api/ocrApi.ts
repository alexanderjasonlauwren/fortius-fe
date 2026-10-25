import type { OcrApi } from "./contract";
import { ocrApiHttp } from "./ocrApi.http";

export type { ReceiptExtraction, ReceiptStatus } from "./contract";
const api: OcrApi = ocrApiHttp;
export const getReceipts = api.getReceipts.bind(api);
export const uploadReceipt = api.uploadReceipt.bind(api);
export const reviewReceipt = api.reviewReceipt.bind(api);
export const receiptFileUrl = api.receiptFileUrl.bind(api);
