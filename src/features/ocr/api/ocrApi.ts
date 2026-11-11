import type { OcrApi } from "./contract";
import { ocrApiHttp } from "./ocrApi.http";

export type { ReceiptExtraction, ReceiptStatus, TransferDetails } from "./contract";
const api: OcrApi = ocrApiHttp;
export const getReceipts = api.getReceipts.bind(api);
export const uploadReceipt = api.uploadReceipt.bind(api);
export const reviewReceipt = api.reviewReceipt.bind(api);
export const receiptFileUrl = api.receiptFileUrl.bind(api);
export const uploadTransferProof = api.uploadTransferProof.bind(api);
export const getTransferProof = api.getTransferProof.bind(api);
export const getTransferProofs = api.getTransferProofs.bind(api);
export const transferProofFileUrl = api.transferProofFileUrl.bind(api);
