import type { ChartPeriod, DrillingAlarm, DrillingLog, DrillingSnapshot, MonitoringPoint } from '@/api/drilling'

interface PeriodConfig {
  duration: number
  interval: number
}

export const periodConfigs: Record<ChartPeriod, PeriodConfig> = {
  '1h': { duration: 60 * 60 * 1000, interval: 60 * 1000 },
  '6h': { duration: 6 * 60 * 60 * 1000, interval: 6 * 60 * 1000 },
  '24h': { duration: 24 * 60 * 60 * 1000, interval: 30 * 60 * 1000 }
}

const REQUEST_DELAY = 300
const EMPTY_REQUEST_DELAY = 100
const REQUEST_TIMEOUT = 8000

const pad = (value: number) => value.toString().padStart(2, '0')

export const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export const formatShortTime = (timestamp: number, period: ChartPeriod) => {
  const date = new Date(timestamp)
  if (period === '24h') {
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const randomValue = (seed: number) => {
  const value = Math.sin(seed) * 10000
  return value - Math.floor(value)
}

const round = (value: number) => Math.round(value * 10) / 10

const buildAlarm = (
  wellId: number,
  level: DrillingAlarm['level'],
  offset: number,
  content: string,
  endTime: number
): DrillingAlarm => {
  const timestamp = endTime - offset
  return {
    id: `${wellId}-${level}-${timestamp}`,
    wellId,
    level,
    timestamp,
    time: formatTime(timestamp),
    content
  }
}

const buildMockSnapshot = (wellId: number, period: ChartPeriod, startTime: number, endTime: number): DrillingSnapshot => {
  const config = periodConfigs[period]
  const pointCount = Math.floor(config.duration / config.interval) + 1
  const points: MonitoringPoint[] = []

  for (let index = 0; index < pointCount; index += 1) {
    const timestamp = startTime + index * config.interval
    const elapsedHours = (timestamp - startTime) / 3600000
    const wave = Math.sin(index / 5) * 12
    const jitter = randomValue(wellId * 1000 + index) * 18
    const wellDepth = 2800 + wellId * 42 + elapsedHours * 8.5
    const wob = round(205 + wave + jitter)
    const rpm = round(108 + Math.cos(index / 7) * 10 + randomValue(index + wellId * 200) * 12)
    const torque = round(33 + Math.sin(index / 6) * 4 + randomValue(index + wellId * 300) * 5)
    const rop = round(7.5 + Math.cos(index / 8) * 1.4 + randomValue(index + wellId * 400) * 2)
    const spp = round(21 + Math.sin(index / 9) * 2 + randomValue(index + wellId * 500) * 2)

    points.push({
      timestamp,
      time: formatShortTime(timestamp, period),
      wellDepth: round(wellDepth),
      bitDepth: round(wellDepth + 0.8),
      wob,
      rpm,
      torque,
      rop,
      spp,
      mudFlowIn: 32.5,
      mudFlowOut: round(31.8 + Math.sin(index / 10) * 0.4),
      mudDensityIn: 1.25,
      mudDensityOut: 1.28,
      mudTemperature: round(45 + randomValue(index + wellId * 600) * 1.5)
    })
  }

  const lastPoint = points[points.length - 1]
  lastPoint.wob = 285
  lastPoint.bitDepth = round(lastPoint.wellDepth + 0.8)

  const logs: DrillingLog[] = points
    .filter((_, index) => index % 10 === 0 || index === points.length - 1)
    .map(point => ({
      time: point.time.length === 5 ? formatTime(point.timestamp) : point.time,
      timestamp: point.timestamp,
      wellDepth: point.wellDepth,
      bitDepth: point.bitDepth,
      wob: point.wob,
      rpm: point.rpm,
      rop: point.rop,
      remark: point.wob > 250 ? '钻压超限，已复核' : '正常钻进'
    }))

  const alarms: DrillingAlarm[] = [
    buildAlarm(wellId, '严重', 5 * 60 * 1000, '钻压超出上限阈值，当前值: 285kN，阈值: 250kN', endTime),
    buildAlarm(wellId, '警告', 45 * 60 * 1000, '泥浆出口流量波动较大，需要关注', endTime)
  ]

  if (period !== '1h') {
    alarms.push(buildAlarm(wellId, '提示', 2 * 60 * 60 * 1000, '扭矩短时接近提示阈值，已自动记录', endTime))
  }

  return {
    current: lastPoint,
    points,
    logs,
    alarms,
    range: { start: startTime, end: endTime }
  }
}

const buildEmptySnapshot = (startTime: number, endTime: number): DrillingSnapshot => ({
  current: null,
  points: [],
  logs: [],
  alarms: [],
  range: { start: startTime, end: endTime }
})

export class RequestTimeoutError extends Error {
  constructor() {
    super('钻井监控数据请求超时')
    this.name = 'RequestTimeoutError'
  }
}

export type DataScenario = 'normal' | 'empty' | 'timeout'

export const fetchDrillingSnapshot = async (
  wellId: number,
  period: ChartPeriod,
  signal?: AbortSignal,
  scenario: DataScenario = 'normal'
): Promise<DrillingSnapshot> => {
  const endTime = Date.now()
  const startTime = endTime - periodConfigs[period].duration

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }

    let completed = false
    const finish = (callback: () => void) => {
      if (completed) return
      completed = true
      window.clearTimeout(timeoutId)
      window.clearTimeout(requestId)
      signal?.removeEventListener('abort', handleAbort)
      callback()
    }

    const timeoutId = window.setTimeout(() => finish(() => reject(new RequestTimeoutError())), REQUEST_TIMEOUT)
    const requestId = window.setTimeout(
      () => {
        if (scenario === 'timeout') {
          finish(() => reject(new RequestTimeoutError()))
          return
        }

        const snapshot = scenario === 'empty'
          ? buildEmptySnapshot(startTime, endTime)
          : buildMockSnapshot(wellId, period, startTime, endTime)
        finish(() => resolve(snapshot))
      },
      scenario === 'normal' ? REQUEST_DELAY : EMPTY_REQUEST_DELAY
    )

    const handleAbort = () => {
      if (!signal) return
      finish(() => reject(signal.reason || new Error('Request aborted')))
    }

    signal?.addEventListener('abort', handleAbort, { once: true })
  })
}
