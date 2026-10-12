import type { SettingsApi } from "./contract";
import * as httpApi from "./settingsApi.http";

const api: SettingsApi = httpApi;

export const getSettings = api.getSettings;
export const getSettingsDetail = api.getSettingsDetail;
export const updateSettings = api.updateSettings;
export const clearSettingOverride = api.clearSettingOverride;
