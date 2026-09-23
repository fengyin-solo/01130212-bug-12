import type {
  DrillingPoint,
  DrillingRangeData,
  DrillingAlarm,
  DrillingLogItem,
  DrillingParams,
  Period,
  TimeRange
} from '@/api/drilling'

/**
 * 本地模拟服务：项目无真实后端，统一由此模块产出数据，
 * 行为对齐后端接口 —— 有网络耗时、可能超时、可能返回空。
 * 联调真实后端时只需把 store 中的调用换成 @/api/drilling 的 request 封装。
 */

const REQUEST_LATENCY = 600
const TIMEOUT_MS = 8000

/** 测试/演示用场景开关，可在控制台通过 __drillingMock.setScenario 切换 */
export type MockScenario = 'normal' | 'timeout' | 'empty'
let scenario: MockScenario = 'normal'

export const mockControls = {
  setScenario(s: MockScenario) {
    scenario = s
  },
  getScenario: () => scenario
}
;(window as any).__drillingMock = mockControls

export interface TimeRangeParams {
  period: Period
  /** 时间窗右端点，默认当前时刻；恢复/重试用显式传入保证“从当前时刻继续” */
  endAt?: number
}

const PERIOD_SPAN: Record<Period, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000
}

const PERIOD_STEP: Record<Period, number> = {
  '1h': 60 * 1000,
  '6h': 5 * 60 * 1000,
  '24h': 15 * 60 * 1000
}

export function pad(n: number) {
  return n.toString().padStart(2, '0')
}

export function formatTime(t: number | Date): string {
  const d = typeof t === 'number' ? new Date(t) : t
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}`
}

/** 实时轮询间隔（ms），历史时间窗内的深度按此速率（0.1m/次 = 72m/h）连续推进 */
export const REALTIME_INTERVAL_MS = 5000
const REALTIME_DEPTH_RATE = 0.1 / (REALTIME_INTERVAL_MS / 1000) // m/s

/** 每口井各自的连续钻井时钟，保证实时井深随时间单调推进 */
const wellClock: Record<number, { depth: number; lastAt: number }> = {
  1: { depth: 2856.5, lastAt: Date.now() },
  2: { depth: 1532.8, lastAt: Date.now() },
  3: { depth: 3210.2, lastAt: Date.now() }
}

function getClock(wellId: number) {
  if (!wellClock[wellId]) wellClock[wellId] = { depth: 1000, lastAt: Date.now() }
  return wellClock[wellId]
}

/** 基于时刻的确定性伪随机，同一时间窗内数据稳定，不随刷新乱跳 */
function seeded(wellId: number, t: number, salt: number) {
  const x = Math.sin(wellId * 10000 + Math.floor(t / 60000) * 37 + salt * 131) * 10000
  return x - Math.floor(x)
}

function buildParams(wellId: number, t: number, depth: number): DrillingParams {
  const wob = Math.round((190 + seeded(wellId, t, 1) * 70) * 10) / 10
  return {
    wellDepth: Math.round(depth * 10) / 10,
    bitDepth: Math.round((depth - 6.3) * 10) / 10,
    wob,
    rpm: Math.round(100 + seeded(wellId, t, 2) * 40),
    torque: Math.round((30 + seeded(wellId, t, 3) * 12) * 10) / 10,
    rop: Math.round((6 + seeded(wellId, t, 4) * 5) * 10) / 10,
    spp: Math.round((18 + seeded(wellId, t, 5) * 8) * 10) / 10,
    mudFlowIn: Math.round((31 + seeded(wellId, t, 6) * 3) * 10) / 10,
    mudFlowOut: Math.round((30.5 + seeded(wellId, t, 7) * 3) * 10) / 10,
    mudDensityIn: 1.25,
    mudDensityOut: 1.28,
    mudTemperature: Math.round((44 + seeded(wellId, t, 8) * 4) * 10) / 10
  }
}

function buildAlarms(wellId: number, points: DrillingPoint[]): DrillingAlarm[] {
  const alarms: DrillingAlarm[] = []
  const push = (p: DrillingPoint, level: DrillingAlarm['level'], content: string) => {
    alarms.push({
      id: `${wellId}-${p.time}-${content.slice(0, 4)}`,
      wellId,
      level,
      time: p.time,
      content
    })
  }
  points.forEach((p, i) => {
    if (p.wob > 250) {
      push(p, '严重', `钻压超出上限阈值，当前值: ${p.wob.toFixed(1)}kN，阈值: 250kN`)
    } else if (p.wob > 240 && i % 7 === 0) {
      push(p, '警告', `钻压接近上限阈值，当前值: ${p.wob.toFixed(1)}kN`)
    }
    if (p.torque > 40 && i % 11 === 0) {
      push(p, '警告', `扭矩接近上限阈值，当前值: ${p.torque.toFixed(1)}kN·m`)
    }
  })
  return alarms.sort((a, b) => (a.time < b.time ? 1 : -1))
}

function buildLogs(points: DrillingPoint[], alarms: DrillingAlarm[]): DrillingLogItem[] {
  const remarkAt = new Map<string, string>()
  alarms.forEach(a => remarkAt.set(a.time.slice(0, 16), a.content))
  return points
    .filter((_, i) => i % 5 === 0)
    .map(p => ({
      time: p.time,
      wellDepth: p.wellDepth,
      bitDepth: p.bitDepth,
      wob: p.wob,
      rpm: p.rpm,
      rop: p.rop,
      remark: remarkAt.get(p.time.slice(0, 16)) || '正常钻进'
    }))
    .reverse()
}

export interface AbortToken {
  aborted: boolean
}

function delay(ms: number, token?: AbortToken) {
  return new Promise<void>((resolve, reject) => {
    const check = setInterval(() => {
      if (token?.aborted) {
        clearInterval(check)
        clearTimeout(timer)
        reject(new Error('aborted'))
      }
    }, 50)
    const timer = setTimeout(() => {
      clearInterval(check)
      resolve()
    }, ms)
  })
}

export async function fetchDrillingRange(
  wellId: number,
  params: TimeRangeParams,
  token?: AbortToken
): Promise<DrillingRangeData> {
  await delay(REQUEST_LATENCY, token)
  if (scenario === 'timeout') {
    await delay(TIMEOUT_MS + 200, token)
    throw new Error('timeout of ' + TIMEOUT_MS + 'ms exceeded')
  }

  const endAt = params.endAt ?? Date.now()
  const range: TimeRange = {
    startTime: formatTime(endAt - PERIOD_SPAN[params.period]),
    endTime: formatTime(endAt)
  }

  // empty 场景模拟该井在所选时间窗内无作业数据
  if (scenario === 'empty') {
    return { range, points: [], logs: [], alarms: [] }
  }

  const step = PERIOD_STEP[params.period]
  const startAt = endAt - PERIOD_SPAN[params.period]
  const clock = getClock(wellId)
  const depthBase = clock.depth - (endAt - clock.lastAt) / 1000 * REALTIME_DEPTH_RATE

  const points: DrillingPoint[] = []
  for (let t = startAt; t <= endAt; t += step) {
    const depth = depthBase + ((t - startAt) / 1000) * REALTIME_DEPTH_RATE
    points.push({ time: formatTime(t), ...buildParams(wellId, t, depth) })
  }

  const alarms = buildAlarms(wellId, points)
  const logs = buildLogs(points, alarms)
  return { range, points, logs, alarms }
}

export async function fetchDrillingRealtime(
  wellId: number,
  token?: AbortToken
): Promise<DrillingPoint> {
  await delay(300, token)
  if (scenario === 'timeout') {
    await delay(TIMEOUT_MS + 200, token)
    throw new Error('timeout of ' + TIMEOUT_MS + 'ms exceeded')
  }
  if (scenario === 'empty') {
    // 实时接口在空数据场景返回明确的无作业标记
    throw Object.assign(new Error('当前无钻井作业数据'), { code: 'NO_DATA' })
  }

  const clock = getClock(wellId)
  const now = Date.now()
  // 每次实时轮询固定推进一个可观测步长（0.1m），避免小数位精度把变化抹掉
  clock.depth += (REALTIME_INTERVAL_MS / 1000) * REALTIME_DEPTH_RATE
  clock.lastAt = now
  const point: DrillingPoint = {
    time: formatTime(now),
    ...buildParams(wellId, now, clock.depth)
  }
  return point
}

