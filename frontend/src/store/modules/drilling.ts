import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  DrillingAlarm,
  DrillingLogItem,
  DrillingParams,
  DrillingPoint,
  Period,
  TimeRange
} from '@/api/drilling'
import {
  fetchDrillingRange,
  fetchDrillingRealtime,
  REALTIME_INTERVAL_MS,
  type AbortToken
} from '@/api/drillingMock'

/** 数据面板（曲线/日志/告警）的请求状态机 */
export type PanelState = 'idle' | 'loading' | 'success' | 'empty' | 'error'
/** 实时数据（参数卡/井深）连接状态机 */
export type RealtimeState = 'idle' | 'connecting' | 'live' | 'stale' | 'nodata'

const PERIODS: Period[] = ['1h', '6h', '24h']
const PERIOD_STEP: Record<Period, number> = {
  '1h': 60 * 1000,
  '6h': 5 * 60 * 1000,
  '24h': 15 * 60 * 1000
}
const PERIOD_POINTS: Record<Period, number> = { '1h': 61, '6h': 73, '24h': 97 }

const PERIOD_STORE_KEY = 'drilling:periods'
const alarmsKey = (wellId: number) => `drilling:alarms:${wellId}`

function loadPeriod(wellId: number): Period {
  try {
    const map = JSON.parse(localStorage.getItem(PERIOD_STORE_KEY) || '{}')
    return (PERIODS as string[]).includes(map[wellId]) ? map[wellId] : '1h'
  } catch {
    return '1h'
  }
}

function savePeriod(wellId: number, period: Period) {
  try {
    const map = JSON.parse(localStorage.getItem(PERIOD_STORE_KEY) || '{}')
    map[wellId] = period
    localStorage.setItem(PERIOD_STORE_KEY, JSON.stringify(map))
  } catch {
    /* localStorage 不可用时退化为内存态 */
  }
}

function loadHistoricAlarms(wellId: number): DrillingAlarm[] {
  try {
    return JSON.parse(localStorage.getItem(alarmsKey(wellId)) || '[]')
  } catch {
    return []
  }
}

function saveHistoricAlarms(wellId: number, alarms: DrillingAlarm[]) {
  try {
    // 仅做上限保护，旧告警始终保留
    localStorage.setItem(alarmsKey(wellId), JSON.stringify(alarms.slice(0, 500)))
  } catch {
    /* ignore */
  }
}

export const useDrillingStore = defineStore('drilling', () => {
  const wellList = ref([
    { id: 1, wellName: 'A-01井' },
    { id: 2, wellName: 'B-03井' },
    { id: 3, wellName: 'C-02井' }
  ])
  const selectedWellId = ref(1)
  const period = ref<Period>('1h')

  const panelState = ref<PanelState>('idle')
  const errorMessage = ref('')
  const range = ref<TimeRange | null>(null)
  const points = ref<DrillingPoint[]>([])
  const logs = ref<DrillingLogItem[]>([])
  const rangeAlarms = ref<DrillingAlarm[]>([])
  const historicAlarmCount = ref(0)

  const realtimeState = ref<RealtimeState>('idle')
  const realtime = ref<DrillingParams | null>(null)
  const realtimeAt = ref('')

  let rangeToken = 0
  let realtimeToken = 0
  let realtimeTimer: ReturnType<typeof setInterval> | null = null
  /** 当前在途请求的取消令牌；代际变化时旧令牌置为 aborted */
  let rangeAbort: AbortToken | null = null
  let realtimeAbort: AbortToken | null = null

  /** 参数卡：实时点优先，未连通时回退到时间窗末端点，保证与曲线同一时间口径 */
  const latestParams = computed<DrillingParams | null>(() => {
    if (realtime.value) return realtime.value
    const last = points.value[points.value.length - 1]
    if (!last) return null
    const { time, ...params } = last
    return params as DrillingParams
  })

  const hasSevereAlarm = computed(() => rangeAlarms.value.some(a => a.level === '严重'))
  const hasWarningAlarm = computed(() => rangeAlarms.value.some(a => a.level === '警告'))

  /** 顶部状态提示：面板状态机优先，其次实时连接状态，最后才是告警/正常 */
  const topStatus = computed(() => {
    if (panelState.value === 'loading') return { type: 'warning', text: '数据加载中…' }
    if (panelState.value === 'error') {
      return { type: 'danger', text: /timeout/i.test(errorMessage.value) ? '数据请求超时' : '数据加载失败' }
    }
    if (panelState.value === 'empty' || realtimeState.value === 'nodata') {
      return { type: 'info', text: '当前时段无钻井作业' }
    }
    if (realtimeState.value === 'stale') return { type: 'danger', text: '实时数据中断，重连中…' }
    if (realtimeState.value === 'connecting') return { type: 'warning', text: '实时数据连接中…' }
    if (hasSevereAlarm.value) return { type: 'danger', text: '严重告警' }
    if (hasWarningAlarm.value) return { type: 'warning', text: '告警' }
    return { type: 'success', text: '正常钻井中' }
  })

  function mergeHistoricAlarms(wellId: number, incoming: DrillingAlarm[]) {
    if (!incoming.length) {
      historicAlarmCount.value = loadHistoricAlarms(wellId).length
      return
    }
    const map = new Map<string, DrillingAlarm>()
    loadHistoricAlarms(wellId).forEach(a => map.set(a.id, a))
    incoming.forEach(a => map.set(a.id, a))
    const merged = [...map.values()].sort((a, b) => (a.time < b.time ? 1 : -1))
    saveHistoricAlarms(wellId, merged)
    historicAlarmCount.value = merged.length
  }

  /**
   * 拉取指定周期时间窗（端点为当前时刻）的全部面板数据。
   * 切换井/周期、重试、实时断流恢复后都走这里，保证曲线、参数卡、日志、
   * 告警列表使用同一个 [startTime, endTime]。
   */
  async function fetchRange(endAt?: number) {
    const token = ++rangeToken
    if (rangeAbort) rangeAbort.aborted = true
    const myAbort: AbortToken = { aborted: false }
    rangeAbort = myAbort
    const wellId = selectedWellId.value
    const requestedPeriod = period.value
    panelState.value = 'loading'
    errorMessage.value = ''
    // 立即清掉上一周期的残留曲线，避免短周期数据滞留
    points.value = []
    logs.value = []
    rangeAlarms.value = []
    range.value = null

    try {
      const data = await fetchDrillingRange(wellId, { period: requestedPeriod, endAt }, myAbort)
      // 在途期间若又切了井/周期，结果一律作废，防止旧请求回写污染新状态
      if (token !== rangeToken || wellId !== selectedWellId.value || requestedPeriod !== period.value) return
      range.value = data.range
      if (!data.points.length) {
        panelState.value = 'empty'
        mergeHistoricAlarms(wellId, [])
        return
      }
      points.value = data.points
      logs.value = data.logs
      rangeAlarms.value = data.alarms
      mergeHistoricAlarms(wellId, data.alarms)
      panelState.value = 'success'
    } catch (e: any) {
      if (token !== rangeToken || wellId !== selectedWellId.value || requestedPeriod !== period.value) return
      if (/aborted/.test(e?.message || '')) return
      panelState.value = 'error'
      errorMessage.value = e?.message || '网络异常'
    }
  }

  async function changePeriod(next: Period) {
    if (next === period.value && panelState.value !== 'error') return
    period.value = next
    savePeriod(selectedWellId.value, next)
    await fetchRange(Date.now())
  }

  async function changeWell(wellId: number) {
    if (wellId === selectedWellId.value) return
    stopRealtime()
    selectedWellId.value = wellId
    period.value = loadPeriod(wellId)
    realtime.value = null
    realtimeState.value = 'idle'
    historicAlarmCount.value = loadHistoricAlarms(wellId).length
    await fetchRange(Date.now())
    startRealtime()
  }

  /** 实时点入曲线：按当前周期粒度更新当前时间桶，曲线随实时井深一起推进 */
  function applyRealtimePoint(point: DrillingPoint) {
    if (panelState.value !== 'success' || !points.value.length) return
    const step = PERIOD_STEP[period.value]
    const pointAt = new Date(point.time.replace(' ', 'T')).getTime()
    const bucket = Math.floor(pointAt / step) * step
    const last = points.value[points.value.length - 1]
    const lastBucket = Math.floor(new Date(last.time.replace(' ', 'T')).getTime() / step) * step
    if (bucket === lastBucket) {
      points.value[points.value.length - 1] = { ...point, time: last.time }
    } else if (bucket > lastBucket) {
      const d = new Date(bucket)
      const pad = (n: number) => n.toString().padStart(2, '0')
      const bucketTime = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
        d.getHours()
      )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      points.value.push({ ...point, time: bucketTime })
      if (points.value.length > PERIOD_POINTS[period.value]) points.value.shift()
    }
  }

  async function tickRealtime() {
    const token = realtimeToken
    const rangeGeneration = rangeToken
    const wellId = selectedWellId.value
    const myAbort: AbortToken = { aborted: false }
    realtimeAbort = myAbort
    try {
      const point = await fetchDrillingRealtime(wellId, myAbort)
      if (token !== realtimeToken || wellId !== selectedWellId.value) return
      const { time, ...params } = point
      realtime.value = params
      realtimeAt.value = time
      const wasStale = realtimeState.value === 'stale'
      realtimeState.value = 'live'
      applyRealtimePoint(point)
      // 断流恢复后以当前时刻重新对齐时间窗；若期间已发起新的拉取（重试/切周期）则让位
      if (wasStale && rangeGeneration === rangeToken) await fetchRange(Date.now())
    } catch (e: any) {
      if (token !== realtimeToken || wellId !== selectedWellId.value) return
      if (e?.code === 'NO_DATA') {
        realtimeState.value = 'nodata'
      } else if (!/aborted/.test(e?.message || '')) {
        realtimeState.value = 'stale'
      }
    }
  }

  function startRealtime() {
    if (realtimeTimer) return
    realtimeToken++
    realtimeState.value = 'connecting'
    tickRealtime()
    realtimeTimer = setInterval(tickRealtime, REALTIME_INTERVAL_MS)
  }

  function stopRealtime() {
    realtimeToken++ // 作废在途的实时请求，防止旧数据回写
    if (realtimeAbort) realtimeAbort.aborted = true
    if (realtimeTimer) {
      clearInterval(realtimeTimer)
      realtimeTimer = null
    }
  }

  /** 超时/失败后的手动重试：按当前时刻重新拉取并重连实时通道 */
  async function retry() {
    realtime.value = null
    stopRealtime()
    await fetchRange(Date.now())
    startRealtime()
  }

  function init() {
    period.value = loadPeriod(selectedWellId.value)
    historicAlarmCount.value = loadHistoricAlarms(selectedWellId.value).length
  }

  async function start() {
    init()
    await fetchRange(Date.now())
    startRealtime()
  }

  function dispose() {
    stopRealtime()
    rangeToken++ // 让在途的时间窗请求作废
    if (rangeAbort) rangeAbort.aborted = true
  }

  return {
    wellList,
    selectedWellId,
    period,
    panelState,
    errorMessage,
    range,
    points,
    logs,
    rangeAlarms,
    historicAlarmCount,
    realtimeState,
    realtime,
    realtimeAt,
    latestParams,
    topStatus,
    fetchRange,
    changePeriod,
    changeWell,
    startRealtime,
    stopRealtime,
    retry,
    init,
    start,
    dispose
  }
})
