import { authApiHttp } from "./authApi.http";
import type { AuthApi } from "./contract";

export const authApi: AuthApi = authApiHttp;
export type { AuthApi, SessionResult, SessionTenant } from "./contract";
