<template>
  <div class="drilling-container">
    <el-row :gutter="20" class="mb-20">
      <el-col :span="8">
        <el-select
          :model-value="store.selectedWellId"
          placeholder="请选择井"
          style="width: 100%"
          @change="handleWellChange"
        >
          <el-option v-for="well in store.wellList" :key="well.id" :label="well.wellName" :value="well.id" />
        </el-select>
      </el-col>
      <el-col :span="16">
        <div class="drilling-status">
          <span class="status-label">当前井深:</span>
          <span class="status-value">{{ depthDisplay }}m</span>
          <span class="status-label">机械钻速:</span>
          <span class="status-value">{{ ropDisplay }}m/h</span>
          <el-tag :type="store.topStatus.type" size="large" effect="dark">
            {{ store.topStatus.text }}
          </el-tag>
          <span v-if="store.realtimeState === 'stale'" class="realtime-dot stale" />
          <span v-else-if="store.realtimeState === 'live'" class="realtime-dot live" />
        </div>
        <div v-if="store.range" class="range-hint">
          数据时间范围：{{ store.range.startTime }} ~ {{ store.range.endTime }}
          <span v-if="store.realtimeAt" class="realtime-at">（实时更新至 {{ store.realtimeAt }}）</span>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="mb-20">
      <el-col :span="6" v-for="card in paramCards" :key="card.key">
        <div class="param-card" :class="{ 'param-alarm': card.overLimit }">
          <div class="param-title">
            {{ card.title }}
            <el-tag v-if="card.overLimit" type="danger" size="small">超限</el-tag>
          </div>
          <div class="param-value">{{ card.display }} {{ card.unit }}</div>
          <el-progress :percentage="card.percentage" :color="card.overLimit ? '#ef4444' : progressColor" />
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="mb-20">
      <el-col :span="24">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>实时参数曲线</span>
              <div class="header-tools">
                <el-radio-group :model-value="store.period" size="small" @change="handlePeriodChange">
                  <el-radio-button label="1h">1小时</el-radio-button>
                  <el-radio-button label="6h">6小时</el-radio-button>
                  <el-radio-button label="24h">24小时</el-radio-button>
                </el-radio-group>
                <el-button-group class="scenario-tools">
                  <el-tooltip content="联调演示：模拟数据为空" placement="top">
                    <el-button size="small" :type="scenario === 'empty' ? 'warning' : ''" @click="setScenario('empty')">空数据</el-button>
                  </el-tooltip>
                  <el-tooltip content="联调演示：模拟请求超时" placement="top">
                    <el-button size="small" :type="scenario === 'timeout' ? 'danger' : ''" @click="setScenario('timeout')">超时</el-button>
                  </el-tooltip>
                  <el-tooltip content="联调演示：恢复正常" placement="top">
                    <el-button size="small" :type="scenario === 'normal' ? 'success' : ''" @click="setScenario('normal')">正常</el-button>
                  </el-tooltip>
                </el-button-group>
              </div>
            </div>
          </template>
          <div class="chart-wrapper">
            <div ref="realTimeChart" class="chart-large"></div>
            <div v-if="store.panelState === 'loading'" class="chart-mask">
              <el-icon class="is-loading"><Loading /></el-icon>
              <span>数据加载中…</span>
            </div>
            <div v-else-if="store.panelState === 'empty'" class="chart-mask">
              <el-icon :size="36"><Files /></el-icon>
              <span>{{ emptyHint }}</span>
            </div>
            <div v-else-if="store.panelState === 'error'" class="chart-mask">
              <el-icon :size="36" color="#ef4444"><WarningFilled /></el-icon>
              <span>{{ /timeout/i.test(store.errorMessage) ? '数据请求超时，请检查网络后重试' : '数据加载失败：' + store.errorMessage }}</span>
              <el-button type="primary" size="small" @click="store.retry()">重试</el-button>
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
              <span>钻井日志</span>
              <el-button type="primary" size="small" :disabled="store.panelState !== 'success'">导出日志</el-button>
            </div>
          </template>
          <el-table
            :data="store.logs"
            size="small"
            max-height="400"
            v-loading="store.panelState === 'loading'"
          >
            <template #empty>
              <el-empty v-if="store.panelState === 'empty'" :description="emptyHint" :image-size="60" />
              <el-empty v-else-if="store.panelState === 'error'" description="日志加载失败" :image-size="60">
                <el-button type="primary" size="small" @click="store.retry()">重试</el-button>
              </el-empty>
              <el-empty v-else description="暂无日志" :image-size="60" />
            </template>
            <el-table-column prop="time" label="时间" width="180" />
            <el-table-column prop="wellDepth" label="井深(m)" width="100" />
            <el-table-column prop="bitDepth" label="钻头深度(m)" width="120" />
            <el-table-column prop="wob" label="钻压(kN)" width="100" />
            <el-table-column prop="rpm" label="转速(rpm)" width="100" />
            <el-table-column prop="rop" label="钻速(m/h)" width="100" />
            <el-table-column prop="remark" label="备注" />
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>
                告警信息
                <el-badge :value="store.rangeAlarms.length" class="alarm-badge" type="danger" />
              </span>
              <el-tooltip content="切换周期/井不会清除已产生的历史告警" placement="top">
                <span class="alarm-total">历史累计 {{ store.historicAlarmCount }} 条</span>
              </el-tooltip>
            </div>
          </template>
          <div class="alarm-list" v-loading="store.panelState === 'loading'">
            <el-empty
              v-if="store.panelState === 'empty'"
              :description="emptyHint"
              :image-size="60"
            />
            <el-empty
              v-else-if="store.panelState === 'error'"
              description="告警加载失败"
              :image-size="60"
            >
              <el-button type="primary" size="small" @click="store.retry()">重试</el-button>
            </el-empty>
            <template v-else>
              <div
                v-for="alarm in store.rangeAlarms"
                :key="alarm.id"
                class="alarm-item"
                :class="'level-' + alarm.level"
              >
                <div class="alarm-header">
                  <el-tag :type="alarm.level === '严重' ? 'danger' : 'warning'" size="small">
                    {{ alarm.level }}
                  </el-tag>
                  <span class="alarm-time">{{ alarm.time }}</span>
                </div>
                <div class="alarm-content">{{ alarm.content }}</div>
              </div>
              <el-empty v-if="!store.rangeAlarms.length" description="当前时段无告警" :image-size="60" />
            </template>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import * as echarts from 'echarts'
import { Loading, Files, WarningFilled } from '@element-plus/icons-vue'
import { useDrillingStore } from '@/store/modules/drilling'
import { mockControls, type MockScenario } from '@/api/drillingMock'
import type { DrillingPoint, Period } from '@/api/drilling'

const store = useDrillingStore()

const realTimeChart = ref<HTMLElement>()
const chartInstance = shallowRef<echarts.ECharts | null>(null)
const scenario = ref<MockScenario>('normal')

const progressColor = '#3b82f6'

const WOB_LIMIT = 250
const RPM_LIMIT = 180
const TORQUE_LIMIT = 40
const SPP_LIMIT = 35

const fmt = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? '--' : Number(v).toFixed(digits)

const depthDisplay = computed(() => fmt(store.latestParams?.wellDepth))
const ropDisplay = computed(() => fmt(store.latestParams?.rop))

interface ParamCard {
  key: string
  title: string
  unit: string
  display: string
  percentage: number
  overLimit: boolean
}

const paramCards = computed<ParamCard[]>(() => {
  const p = store.latestParams
  const ratio = (v: number | undefined, max: number) => Math.min(100, Math.round(((v ?? 0) / max) * 100))
  return [
    {
      key: 'wob',
      title: '钻压 (WOB)',
      unit: 'kN',
      display: fmt(p?.wob),
      percentage: ratio(p?.wob, 500),
      overLimit: (p?.wob ?? 0) > WOB_LIMIT
    },
    {
      key: 'rpm',
      title: '转速 (RPM)',
      unit: 'rpm',
      display: fmt(p?.rpm, 0),
      percentage: ratio(p?.rpm, 200),
      overLimit: (p?.rpm ?? 0) > RPM_LIMIT
    },
    {
      key: 'torque',
      title: '扭矩 (Torque)',
      unit: 'kN·m',
      display: fmt(p?.torque),
      percentage: ratio(p?.torque, 60),
      overLimit: (p?.torque ?? 0) > TORQUE_LIMIT
    },
    {
      key: 'spp',
      title: '立管压力',
      unit: 'MPa',
      display: fmt(p?.spp),
      percentage: ratio(p?.spp, 40),
      overLimit: (p?.spp ?? 0) > SPP_LIMIT
    }
  ]
})

const emptyHint = computed(
  () => `当前时段（${store.period}）无钻井作业数据，恢复后将从当前时刻继续`
)

const axisLabel = (time: string) => {
  // 长周期只展示 时:分，短周期同样如此；时间窗信息在顶部统一展示完整日期
  return time.slice(11, 16)
}

function renderChart(points: DrillingPoint[]) {
  if (!chartInstance.value) return
  // notMerge 保证旧周期曲线被整体替换，不残留短周期数据
  chartInstance.value.setOption(
    {
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const first = Array.isArray(params) ? params[0] : params
          const point = points[first.dataIndex]
          const head = point ? point.time : first.axisValue
          const rows = (Array.isArray(params) ? params : [params])
            .map((s: any) => `${s.marker}${s.seriesName}: ${Number(s.value).toFixed(1)}`)
            .join('<br/>')
          return `${head}<br/>${rows}`
        }
      },
      legend: { data: ['钻压', '转速', '扭矩', '机械钻速'] },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: points.map(p => axisLabel(p.time))
      },
      yAxis: [
        { type: 'value', name: '钻压(kN)', position: 'left', axisLine: { lineStyle: { color: '#3b82f6' } } },
        { type: 'value', name: '转速(rpm)', position: 'left', offset: 60, axisLine: { lineStyle: { color: '#22c55e' } } },
        { type: 'value', name: '扭矩(kN·m)', position: 'right', axisLine: { lineStyle: { color: '#f59e0b' } } },
        { type: 'value', name: '钻速(m/h)', position: 'right', offset: 60, axisLine: { lineStyle: { color: '#ef4444' } } }
      ],
      series: [
        { name: '钻压', type: 'line', smooth: true, showSymbol: false, data: points.map(p => p.wob), yAxisIndex: 0, itemStyle: { color: '#3b82f6' } },
        { name: '转速', type: 'line', smooth: true, showSymbol: false, data: points.map(p => p.rpm), yAxisIndex: 1, itemStyle: { color: '#22c55e' } },
        { name: '扭矩', type: 'line', smooth: true, showSymbol: false, data: points.map(p => p.torque), yAxisIndex: 2, itemStyle: { color: '#f59e0b' } },
        { name: '机械钻速', type: 'line', smooth: true, showSymbol: false, data: points.map(p => p.rop), yAxisIndex: 3, itemStyle: { color: '#ef4444' } }
      ]
    },
    { notMerge: true }
  )
}

function clearChart() {
  chartInstance.value?.setOption(
    {
      xAxis: { data: [] },
      series: [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]
    },
    { notMerge: true }
  )
}

watch(
  () => [store.panelState, store.points] as const,
  async ([state]) => {
    await nextTick()
    if (!chartInstance.value && realTimeChart.value) {
      chartInstance.value = echarts.init(realTimeChart.value)
    }
    if (state === 'success' && store.points.length) {
      chartInstance.value?.resize()
      renderChart(store.points)
    } else {
      clearChart()
    }
  },
  { deep: true }
)

const handlePeriodChange = (val: Period) => store.changePeriod(val)
const handleWellChange = (val: number) => store.changeWell(val)

const setScenario = (s: MockScenario) => {
  scenario.value = s
  mockControls.setScenario(s)
  // 切换场景后立即按当前时刻重新走一次完整状态流转
  store.retry()
}

const handleResize = () => chartInstance.value?.resize()

onMounted(async () => {
  await nextTick()
  if (realTimeChart.value) chartInstance.value = echarts.init(realTimeChart.value)
  window.addEventListener('resize', handleResize)
  await store.start()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  store.dispose()
  chartInstance.value?.dispose()
  chartInstance.value = null
})
</script>

<style scoped lang="scss">
.drilling-container {
  width: 100%;
}

.drilling-status {
  display: flex;
  align-items: center;
  gap: 30px;
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
    margin-left: 8px;
  }
}

.range-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #64748b;

  .realtime-at {
    color: #22c55e;
  }
}

.realtime-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;

  &.live {
    background: #22c55e;
    box-shadow: 0 0 6px #22c55e;
    animation: pulse 1.5s infinite;
  }

  &.stale {
    background: #ef4444;
    box-shadow: 0 0 6px #ef4444;
  }
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.3; }
  100% { opacity: 1; }
}

.param-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);

  &.param-alarm {
    box-shadow: 0 0 0 2px #ef4444 inset, 0 2px 12px 0 rgba(239, 68, 68, 0.25);
  }

  .param-title {
    font-size: 14px;
    color: #64748b;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
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

  .header-tools {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .scenario-tools {
    margin-left: 4px;
  }
}

.alarm-badge {
  margin-left: 8px;
}

.alarm-total {
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

.chart-mask {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.85);
  color: #475569;
  font-size: 14px;
}

.alarm-list {
  max-height: 400px;
  min-height: 200px;
  overflow-y: auto;
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
