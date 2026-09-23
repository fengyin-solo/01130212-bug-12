import request from '@/utils/request'

export type ChartPeriod = '1h' | '6h' | '24h'
export type AlarmLevel = '严重' | '警告' | '提示'
export type MonitorState = 'loading' | 'normal' | 'empty' | 'timeout'

export interface DrillingQuery {
  period: ChartPeriod
  startTime: number
  endTime: number
  signal?: AbortSignal
}

export interface MonitoringPoint {
  timestamp: number
  time: string
  wellDepth: number
  bitDepth: number
  wob: number
  rpm: number
  torque: number
  rop: number
  spp: number
  mudFlowIn: number
  mudFlowOut: number
  mudDensityIn: number
  mudDensityOut: number
  mudTemperature: number
}

export interface DrillingLog {
  time: string
  timestamp: number
  wellDepth: number
  bitDepth: number
  wob: number
  rpm: number
  rop: number
  remark: string
}

export interface DrillingAlarm {
  id: string
  wellId: number
  level: AlarmLevel
  timestamp: number
  time: string
  content: string
}

export interface DrillingSnapshot {
  current: MonitoringPoint | null
  points: MonitoringPoint[]
  logs: DrillingLog[]
  alarms: DrillingAlarm[]
  range: {
    start: number
    end: number
  }
}

export function getDrillingMonitorSnapshot(wellId: number, query: DrillingQuery) {
  const params = {
    period: query.period,
    startTime: query.startTime,
    endTime: query.endTime
  }

  return Promise.all([
    getDrillingRealTime(wellId, query.signal),
    getDrillingProgress(wellId, query.signal),
    getDrillingLog(wellId, params, query.signal),
    getDrillingAlarms(wellId, params, query.signal)
  ])
}

export function getDrillingRealTime(wellId: number, signal?: AbortSignal) {
  return request({
    url: `/drilling/${wellId}/realtime`,
    method: 'get',
    signal
  })
}

export function getDrillingProgress(wellId: number, signal?: AbortSignal) {
  return request({
    url: `/drilling/${wellId}/progress`,
    method: 'get',
    signal
  })
}

export function getDrillingLog(
  wellId: number,
  params: { period: ChartPeriod; startTime: number; endTime: number },
  signal?: AbortSignal
) {
  return request({
    url: `/drilling/${wellId}/log`,
    method: 'get',
    params,
    signal
  })
}

export function getDrillingAlarms(
  wellId: number,
  params: { period: ChartPeriod; startTime: number; endTime: number },
  signal?: AbortSignal
) {
  return request({
    url: `/drilling/${wellId}/alarms`,
    method: 'get',
    params,
    signal
  })
}
