import request from '@/utils/request'

export interface DrillingParams {
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

export interface DrillingPoint extends DrillingParams {
  time: string
}

export type Period = '1h' | '6h' | '24h'

export interface TimeRange {
  startTime: string
  endTime: string
}

export interface DrillingLogItem {
  time: string
  wellDepth: number
  bitDepth: number
  wob: number
  rpm: number
  rop: number
  remark: string
}

export type AlarmLevel = '严重' | '警告'

export interface DrillingAlarm {
  id: string
  wellId: number
  level: AlarmLevel
  time: string
  content: string
  acknowledged?: boolean
}

export interface DrillingRangeData {
  range: TimeRange
  points: DrillingPoint[]
  logs: DrillingLogItem[]
  alarms: DrillingAlarm[]
}

export function getDrillingRealTime(wellId: number) {
  return request({
    url: `/drilling/${wellId}/realtime`,
    method: 'get'
  })
}

export function getDrillingProgress(wellId: number) {
  return request({
    url: `/drilling/${wellId}/progress`,
    method: 'get'
  })
}

export function getDrillingLog(wellId: number, params: any) {
  return request({
    url: `/drilling/${wellId}/log`,
    method: 'get',
    params
  })
}

export function getDrillingAlarms(wellId: number, params: any) {
  return request({
    url: `/drilling/${wellId}/alarms`,
    method: 'get',
    params
  })
}
