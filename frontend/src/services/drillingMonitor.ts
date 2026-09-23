import { fetchDrillingSnapshot as fetchMockDrillingSnapshot } from './mock/drillingMonitor'
export type { DataScenario } from './mock/drillingMonitor'

export type { ChartPeriod, DrillingAlarm, DrillingLog, DrillingSnapshot, MonitoringPoint } from '@/api/drilling'
export { RequestTimeoutError, formatTime, periodConfigs } from './mock/drillingMonitor'

export const fetchDrillingSnapshot = fetchMockDrillingSnapshot
