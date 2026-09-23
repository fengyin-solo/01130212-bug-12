import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ChartPeriod, DrillingAlarm } from '@/api/drilling'
import { formatTime } from '@/services/drillingMonitor'

const PERIOD_STORAGE_KEY = 'drilling-monitor-period'
const ALARM_STORAGE_KEY = 'drilling-monitor-alarms'

const defaultAlarms: Array<Omit<DrillingAlarm, 'id' | 'timestamp' | 'time'> & { offset: number }> = [
  { wellId: 1, level: '严重', offset: 5 * 60 * 1000, content: '钻压超出上限阈值，当前值: 285kN，阈值: 250kN' },
  { wellId: 1, level: '警告', offset: 45 * 60 * 1000, content: '泥浆出口流量波动较大，需要关注' },
  { wellId: 1, level: '警告', offset: 95 * 60 * 1000, content: '扭矩接近上限阈值，当前值: 58kN·m' },
  { wellId: 2, level: '警告', offset: 12 * 60 * 1000, content: '泥浆出口温度超标，需要关注' },
  { wellId: 3, level: '严重', offset: 25 * 60 * 1000, content: '转盘电机通讯中断' },
  { wellId: 4, level: '提示', offset: 38 * 60 * 1000, content: '机械钻速低于提示阈值' },
  { wellId: 5, level: '警告', offset: 70 * 60 * 1000, content: '环保指标接近预警值' }
]

const createSeedAlarms = (): Record<number, DrillingAlarm[]> => {
  const now = Date.now()
  const alignedOffset = (offset: number) => Math.floor((now - offset) / 300000) * 300000
  return defaultAlarms.reduce<Record<number, DrillingAlarm[]>>((result, item) => {
    const timestamp = alignedOffset(item.offset)
    if (!result[item.wellId]) result[item.wellId] = []
    result[item.wellId].push({
      id: `${item.wellId}-${item.level}-${timestamp}`,
      wellId: item.wellId,
      level: item.level,
      timestamp,
      time: formatTime(timestamp),
      content: item.content
    })
    return result
  }, {})
}

const readStoredPeriod = (): ChartPeriod => {
  const period = localStorage.getItem(PERIOD_STORAGE_KEY)
  return period === '6h' || period === '24h' ? period : '1h'
}

const readStoredAlarms = (): Record<number, DrillingAlarm[]> => {
  const seeded = createSeedAlarms()
  const stored = localStorage.getItem(ALARM_STORAGE_KEY)

  if (!stored) return seeded

  try {
    const parsed = JSON.parse(stored) as Record<number, DrillingAlarm[]>
    const result = Object.entries(parsed).reduce<Record<number, DrillingAlarm[]>>((deduplicated, [storedWellId, alarms]) => {
      const id = Number(storedWellId)
      const latest = new Map<string, DrillingAlarm>()
      alarms.forEach(alarm => {
        const previous = latest.get(alarm.content)
        if (!previous || alarm.timestamp > previous.timestamp) {
          latest.set(alarm.content, alarm)
        }
      })
      deduplicated[id] = Array.from(latest.values()).sort((a, b) => b.timestamp - a.timestamp)
      return deduplicated
    }, {})

    Object.entries(seeded).forEach(([wellId, seedAlarms]) => {
      const id = Number(wellId)
      const storedAlarms = result[id] || []
      const seedContents = new Set(seedAlarms.map(alarm => alarm.content))
      result[id] = storedAlarms.filter(alarm => !seedContents.has(alarm.content)).concat(seedAlarms)
    })
    return result
  } catch {
    return seeded
  }
}

export const useDrillingMonitorStore = defineStore('drillingMonitor', () => {
  const period = ref<ChartPeriod>(readStoredPeriod())
  const alarmsByWell = ref<Record<number, DrillingAlarm[]>>(readStoredAlarms())

  const allAlarms = computed(() => Object.values(alarmsByWell.value).flat().sort((a, b) => b.timestamp - a.timestamp))

  const savePeriod = (nextPeriod: ChartPeriod) => {
    period.value = nextPeriod
    localStorage.setItem(PERIOD_STORAGE_KEY, nextPeriod)
  }

  const persistAlarms = () => {
    localStorage.setItem(ALARM_STORAGE_KEY, JSON.stringify(alarmsByWell.value))
  }

  const getAlarms = (wellId: number) => alarmsByWell.value[wellId] || []

  const mergeAlarms = (wellId: number, alarms: DrillingAlarm[]) => {
    const merged = new Map<string, DrillingAlarm>()
    const latestByContent = new Map<string, DrillingAlarm>()
    const upsert = (alarm: DrillingAlarm) => {
      const normalized = { ...alarm, wellId }
      merged.set(normalized.id, normalized)

      const previous = latestByContent.get(normalized.content)
      if (!previous || normalized.timestamp > previous.timestamp) {
        latestByContent.set(normalized.content, normalized)
      }
    }

    ;(alarmsByWell.value[wellId] || []).forEach(upsert)
    alarms.forEach(upsert)

    const currentIds = new Set(Array.from(latestByContent.values()).map(alarm => alarm.id))
    alarmsByWell.value = {
      ...alarmsByWell.value,
      [wellId]: Array.from(merged.values())
        .filter(alarm => currentIds.has(alarm.id))
        .sort((a, b) => b.timestamp - a.timestamp)
    }
    persistAlarms()
  }

  return {
    period,
    allAlarms,
    savePeriod,
    getAlarms,
    mergeAlarms
  }
})
