<template>
  <div class="drilling-container">
    <el-row :gutter="20" class="mb-20">
      <el-col :span="8">
        <el-select v-model="selectedWell" placeholder="请选择井" style="width: 100%">
          <el-option v-for="well in wellList" :key="well.id" :label="well.wellName" :value="well.id" />
        </el-select>
      </el-col>
      <el-col :span="16">
        <div class="drilling-status">
          <span class="status-label">当前井深:</span>
          <span class="status-value">{{ currentPoint ? currentPoint.wellDepth : '--' }}m</span>
          <span class="status-label">机械钻速:</span>
          <span class="status-value">{{ currentPoint ? currentPoint.rop : '--' }}m/h</span>
          <el-tag :type="statusTagType" size="large">{{ statusText }}</el-tag>
          <span class="status-message">{{ statusMessage }}</span>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="mb-20">
      <el-col :span="6">
        <div class="param-card">
          <div class="param-title">钻压 (WOB)</div>
          <div class="param-value">{{ currentPoint ? currentPoint.wob : '--' }} kN</div>
          <el-progress :percentage="getPercentage(currentPoint?.wob, 500)" :color="getProgressColor(currentPoint?.wob, 250)" />
        </div>
      </el-col>
      <el-col :span="6">
        <div class="param-card">
          <div class="param-title">转速 (RPM)</div>
          <div class="param-value">{{ currentPoint ? currentPoint.rpm : '--' }} rpm</div>
          <el-progress :percentage="getPercentage(currentPoint?.rpm, 200)" :color="getProgressColor(currentPoint?.rpm, 180)" />
        </div>
      </el-col>
      <el-col :span="6">
        <div class="param-card">
          <div class="param-title">扭矩 (Torque)</div>
          <div class="param-value">{{ currentPoint ? currentPoint.torque : '--' }} kN·m</div>
          <el-progress :percentage="getPercentage(currentPoint?.torque, 60)" :color="getProgressColor(currentPoint?.torque, 55)" />
        </div>
      </el-col>
      <el-col :span="6">
        <div class="param-card">
          <div class="param-title">立管压力</div>
          <div class="param-value">{{ currentPoint ? currentPoint.spp : '--' }} MPa</div>
          <el-progress :percentage="getPercentage(currentPoint?.spp, 40)" :color="getProgressColor(currentPoint?.spp, 35)" />
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="mb-20">
      <el-col :span="24">
        <el-card>
          <template #header>
            <div class="card-header chart-card-header">
              <div>
                <div>实时参数曲线</div>
                <div class="range-hint">数据范围：{{ rangeLabel }}</div>
              </div>
              <div class="chart-controls">
                <el-radio-group v-model="chartPeriod" size="small">
                  <el-radio-button label="1h">1小时</el-radio-button>
                  <el-radio-button label="6h">6小时</el-radio-button>
                  <el-radio-button label="24h">24小时</el-radio-button>
                </el-radio-group>
                <el-select v-if="isDev" v-model="dataScenario" size="small" class="scenario-select">
                  <el-option label="正常数据" value="normal" />
                  <el-option label="数据为空" value="empty" />
                  <el-option label="请求超时" value="timeout" />
                </el-select>
              </div>
            </div>
          </template>
          <div class="chart-wrapper">
            <div ref="realTimeChart" class="chart-large"></div>
            <div v-if="monitorState !== 'normal'" class="chart-state" :class="`is-${monitorState}`">
              <template v-if="isLoading">
                <el-icon class="state-icon is-loading"><Loading /></el-icon>
                <span>正在切换至新周期数据…</span>
              </template>
              <template v-else-if="monitorState === 'empty'">
                <el-icon class="state-icon"><DataLine /></el-icon>
                <span>当前时间范围暂无可展示的曲线数据</span>
              </template>
              <template v-else>
                <el-icon class="state-icon"><WarningFilled /></el-icon>
                <span>{{ statusMessage }}</span>
                <el-button type="primary" size="small" @click="retryLoad">立即重试</el-button>
              </template>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="14">
        <el-card>
          <template #header>
            <div class="card-header">
              <div>
                <div>钻井日志</div>
                <div class="range-hint">与曲线同为：{{ rangeLabel }}</div>
              </div>
              <el-button type="primary" size="small">导出日志</el-button>
            </div>
          </template>
          <el-table :data="logList" size="small" max-height="400">
            <el-table-column prop="time" label="时间" width="180" />
            <el-table-column prop="wellDepth" label="井深(m)" width="100" />
            <el-table-column prop="bitDepth" label="钻头深度(m)" width="120" />
            <el-table-column prop="wob" label="钻压(kN)" width="100" />
            <el-table-column prop="rpm" label="转速(rpm)" width="100" />
            <el-table-column prop="rop" label="钻速(m/h)" width="100" />
            <el-table-column prop="remark" label="备注" />
          </el-table>
          <el-empty v-if="!isLoading && logList.length === 0" description="当前时间范围暂无钻井日志" />
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card>
          <template #header>
            <div class="card-header">
              <div>
                <div>告警信息</div>
                <div class="range-hint">仅显示当前时间范围</div>
              </div>
              <el-badge :value="visibleAlarms.length" class="item" type="danger" />
            </div>
          </template>
          <div class="alarm-list">
            <div v-if="visibleAlarms.length === 0" class="alarm-empty">
              <el-empty :description="isLoading ? '正在加载告警数据' : '当前时间范围暂无告警'" />
            </div>
            <div
              v-for="alarm in visibleAlarms"
              :key="alarm.id"
              class="alarm-item"
              :class="'level-' + alarm.level"
            >
              <div class="alarm-header">
                <el-tag :type="getAlarmType(alarm.level)" size="small">{{ alarm.level }}</el-tag>
                <span class="alarm-time">{{ alarm.time }}</span>
              </div>
              <div class="alarm-content">{{ alarm.content }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { ChartPeriod, DrillingAlarm, DrillingLog, MonitorState, MonitoringPoint } from '@/api/drilling'
import { fetchDrillingSnapshot, formatTime } from '@/services/drillingMonitor'
import type { DataScenario } from '@/services/drillingMonitor'
import { useDrillingMonitorStore } from '@/store/modules/drillingMonitor'

const POLLING_INTERVAL = 5000

const selectedWell = ref(1)
const isDev = import.meta.env.DEV
const dataScenario = ref<DataScenario>('normal')
const realTimeChart = ref<HTMLElement>()
const monitorStore = useDrillingMonitorStore()

let chartInstance: echarts.ECharts | null = null
let timer: ReturnType<typeof setInterval> | null = null
let abortController: AbortController | null = null
let requestSequence = 0
let resizeHandler: (() => void) | null = null

const wellList = [
  { id: 1, wellName: 'A-01井' },
  { id: 2, wellName: 'B-03井' },
  { id: 3, wellName: 'C-02井' },
  { id: 4, wellName: 'D-05井' },
  { id: 5, wellName: 'E-01井' }
]

const currentPoint = ref<MonitoringPoint | null>(null)
const chartPoints = ref<MonitoringPoint[]>([])
const logList = ref<DrillingLog[]>([])
const monitorState = ref<MonitorState>('loading')
const rangeStart = ref<number | null>(null)
const rangeEnd = ref<number | null>(null)

const chartPeriod = computed<ChartPeriod>({
  get: () => monitorStore.period,
  set: value => {
    if (value !== monitorStore.period) {
      monitorStore.savePeriod(value)
      loadSnapshot(true)
    }
  }
})

const isLoading = computed(() => monitorState.value === 'loading')
const rangeLabel = computed(() => {
  if (rangeStart.value === null || rangeEnd.value === null) return '正在同步'
  return `${formatTime(rangeStart.value)} 至 ${formatTime(rangeEnd.value)}`
})

const visibleAlarms = computed<DrillingAlarm[]>(() => {
  const start = rangeStart.value
  const end = rangeEnd.value
  if (start === null || end === null) return []
  return monitorStore
    .getAlarms(selectedWell.value)
    .filter(alarm => alarm.timestamp >= start && alarm.timestamp <= end)
    .sort((a, b) => b.timestamp - a.timestamp)
})

const highestAlarm = computed(() => {
  if (visibleAlarms.value.some(alarm => alarm.level === '严重')) return '严重'
  if (visibleAlarms.value.some(alarm => alarm.level === '警告')) return '警告'
  if (visibleAlarms.value.length > 0) return '提示'
  return null
})

const statusTagType = computed(() => {
  if (isLoading.value) return 'info'
  if (monitorState.value === 'timeout') return 'danger'
  if (monitorState.value === 'empty') return 'info'
  if (highestAlarm.value === '严重') return 'danger'
  if (highestAlarm.value === '警告' || highestAlarm.value === '提示') return 'warning'
  return 'success'
})

const statusText = computed(() => {
  if (isLoading.value) return '数据加载中'
  if (monitorState.value === 'timeout') return '请求超时'
  if (monitorState.value === 'empty') return '暂无数据'
  if (highestAlarm.value) return highestAlarm.value === '严重' ? '严重告警' : '告警处理中'
  return '正常钻井中'
})

const statusMessage = computed(() => {
  if (isLoading.value) return '曲线、参数卡、日志和告警正在按新周期同步'
  if (monitorState.value === 'timeout') return '监控数据请求超时，已停止展示旧周期数据，恢复后将从当前时刻继续'
  if (monitorState.value === 'empty') return '所选时间范围内没有监控数据'
  if (highestAlarm.value === '严重') return '当前时间范围存在严重告警，请立即处理'
  if (highestAlarm.value) return '当前时间范围存在待处理告警'
  return '当前时间范围数据正常'
})

const getAlarmType = (level: DrillingAlarm['level']) => {
  if (level === '严重') return 'danger'
  if (level === '警告') return 'warning'
  return 'info'
}

const getPercentage = (value: number | undefined, max: number) => {
  if (value === undefined) return 0
  return Math.min(100, Math.round((value / max) * 100))
}

const getProgressColor = (value: number | undefined, threshold: number) => {
  if (value === undefined) return '#94a3b8'
  if (value > threshold) return '#ef4444'
  if (value > threshold * 0.9) return '#f59e0b'
  return '#22c55e'
}

const getBaseChartOption = (points: MonitoringPoint[]) => ({
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['钻压', '转速', '扭矩', '机械钻速'] },
  grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
  xAxis: { type: 'category' as const, boundaryGap: false, data: points.map(point => point.time) },
  yAxis: [
    { type: 'value' as const, name: '钻压(kN)', position: 'left' as const, axisLine: { lineStyle: { color: '#3b82f6' } } },
    { type: 'value' as const, name: '转速(rpm)', position: 'left' as const, offset: 60, axisLine: { lineStyle: { color: '#22c55e' } } },
    { type: 'value' as const, name: '扭矩(kN·m)', position: 'right' as const, axisLine: { lineStyle: { color: '#f59e0b' } } },
    { type: 'value' as const, name: '钻速(m/h)', position: 'right' as const, offset: 60, axisLine: { lineStyle: { color: '#ef4444' } } }
  ],
  series: [
    { name: '钻压', type: 'line' as const, smooth: true, data: points.map(point => point.wob), yAxisIndex: 0, itemStyle: { color: '#3b82f6' } },
    { name: '转速', type: 'line' as const, smooth: true, data: points.map(point => point.rpm), yAxisIndex: 1, itemStyle: { color: '#22c55e' } },
    { name: '扭矩', type: 'line' as const, smooth: true, data: points.map(point => point.torque), yAxisIndex: 2, itemStyle: { color: '#f59e0b' } },
    { name: '机械钻速', type: 'line' as const, smooth: true, data: points.map(point => point.rop), yAxisIndex: 3, itemStyle: { color: '#ef4444' } }
  ]
})

const renderChart = () => {
  if (!chartInstance) return
  chartInstance.setOption(getBaseChartOption(chartPoints.value), true)
}

const initChart = () => {
  if (!realTimeChart.value) return
  chartInstance = echarts.init(realTimeChart.value)
  renderChart()
  resizeHandler = () => chartInstance?.resize()
  window.addEventListener('resize', resizeHandler)
}

const clearSnapshot = () => {
  currentPoint.value = null
  chartPoints.value = []
  logList.value = []
  rangeStart.value = null
  rangeEnd.value = null
  renderChart()
}

async function loadSnapshot(showLoading: boolean) {
  const requestId = ++requestSequence
  abortController?.abort()

  if (showLoading) {
    monitorState.value = 'loading'
    clearSnapshot()
  }

  const controller = new AbortController()
  abortController = controller

  try {
    const snapshot = await fetchDrillingSnapshot(selectedWell.value, chartPeriod.value, controller.signal, dataScenario.value)
    if (requestId !== requestSequence || controller.signal.aborted) return

    rangeStart.value = snapshot.range.start
    rangeEnd.value = snapshot.range.end
    chartPoints.value = snapshot.points
    logList.value = snapshot.logs
    currentPoint.value = snapshot.current
    monitorStore.mergeAlarms(selectedWell.value, snapshot.alarms)
    monitorState.value = snapshot.points.length > 0 && currentPoint.value ? 'normal' : 'empty'
    renderChart()
  } catch {
    if (requestId !== requestSequence || controller.signal.aborted) return

    clearSnapshot()
    monitorState.value = 'timeout'
  }
}

const retryLoad = () => {
  loadSnapshot(true)
}

watch(selectedWell, () => loadSnapshot(true))
watch(dataScenario, () => loadSnapshot(true))

onMounted(() => {
  initChart()
  loadSnapshot(true)
  timer = setInterval(() => {
    if (monitorState.value !== 'loading') {
      loadSnapshot(false)
    }
  }, POLLING_INTERVAL)
})

onUnmounted(() => {
  requestSequence += 1
  abortController?.abort()
  if (timer) clearInterval(timer)
  if (resizeHandler) window.removeEventListener('resize', resizeHandler)
  if (chartInstance) chartInstance.dispose()
  chartInstance = null
})
</script>

<style scoped lang="scss">
.drilling-container {
  width: 100%;
}

.drilling-status {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 60px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #1e3a8a, #3b82f6);
  border-radius: 8px;
  color: #fff;

  .status-label {
    font-size: 14px;
    opacity: 0.8;
  }

  .status-value {
    font-size: 20px;
    font-weight: 600;
    margin-left: -8px;
  }

  .status-message {
    font-size: 13px;
    opacity: 0.9;
    margin-left: auto;
  }
}

.param-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);

  .param-title {
    font-size: 14px;
    color: #64748b;
    margin-bottom: 10px;
  }

  .param-value {
    font-size: 32px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 15px;
  }
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}

.chart-card-header {
  width: 100%;
}

.chart-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.scenario-select {
  width: 110px;
}

.range-hint {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 400;
  color: #64748b;
}

.chart-wrapper {
  position: relative;
}

.chart-large {
  width: 100%;
  height: 350px;
}

.chart-state {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.92);
  color: #64748b;

  &.is-empty {
    color: #64748b;
  }

  &.is-timeout {
    color: #dc2626;
  }

  .state-icon {
    font-size: 36px;

    &.is-loading {
      animation: rotate 1.2s linear infinite;
    }
  }
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.alarm-list {
  max-height: 400px;
  min-height: 120px;
  overflow-y: auto;
}

.alarm-empty {
  display: flex;
  justify-content: center;
}

.alarm-item {
  padding: 15px;
  border-radius: 6px;
  margin-bottom: 10px;

  &.level-严重 {
    background: rgba(239, 68, 68, 0.1);
    border-left: 4px solid #ef4444;
  }

  &.level-警告 {
    background: rgba(245, 158, 11, 0.1);
    border-left: 4px solid #f59e0b;
  }

  &.level-提示 {
    background: rgba(59, 130, 246, 0.1);
    border-left: 4px solid #3b82f6;
  }

  .alarm-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .alarm-time {
    font-size: 12px;
    color: #64748b;
  }

  .alarm-content {
    font-size: 14px;
    color: #1e293b;
  }
}
</style>
