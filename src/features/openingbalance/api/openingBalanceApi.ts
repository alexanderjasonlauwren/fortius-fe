/**
 * The opening-balance adapter this build uses.
 */
import { pick } from "@/lib/dataSource";
import { openingBalanceApiMock } from "./openingBalanceApi.mock";
import { openingBalanceApiHttp } from "./openingBalanceApi.http";
import type { OpeningBalanceApi } from "./contract";

export type {
  OpeningBalanceApi,
  OpeningBalanceCommitResult,
  OpeningBalancePreview,
  OpeningBalanceValidationError,
} from "./contract";

const api: OpeningBalanceApi = pick(openingBalanceApiMock, openingBalanceApiHttp);

export const getTemplate = api.getTemplate.bind(api);
export const previewOpeningBalance = api.previewOpeningBalance.bind(api);
export const commitOpeningBalance = api.commitOpeningBalance.bind(api);
