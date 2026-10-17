import { approvalsApiHttp } from "./approvalsApi.http";
import type { ApprovalsApi } from "./contract";

export type {
  DecisionInput, NewRefund, NewVoidRequest, Refund, RequestStatus, VoidDocumentType, VoidRequest,
} from "./contract";
export { DOCUMENT_TYPE_LABEL, STATUS_LABEL } from "./contract";

const api: ApprovalsApi = approvalsApiHttp;

export const listVoidRequests = api.listVoidRequests.bind(api);
export const requestVoid = api.requestVoid.bind(api);
export const decideVoid = api.decideVoid.bind(api);
export const listRefunds = api.listRefunds.bind(api);
export const requestRefund = api.requestRefund.bind(api);
export const decideRefund = api.decideRefund.bind(api);
