import { monitoringApiHttp } from "./monitoringApi.http";
import type { MonitoringApi } from "./contract";

export type { DateRange, SetDeliveryStatusInput, StatusReceipt } from "./contract";

const api: MonitoringApi = monitoringApiHttp;

export const getMonitoringSnapshot = api.getMonitoringSnapshot.bind(api);
export const getDriverCards = api.getDriverCards.bind(api);
export const getMonitoringTable = api.getMonitoringTable.bind(api);
export const setDeliveryStatus = api.setDeliveryStatus.bind(api);
export const printSuratJalan = api.printSuratJalan.bind(api);
