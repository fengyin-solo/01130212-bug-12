<template>
  <div class="dashboard-container">
    <el-row :gutter="20" class="mb-20">
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-icon well">
            <el-icon><Position /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ statistics.wellCount || 0 }}</div>
            <div class="stat-label">总井数</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-icon drilling">
            <el-icon><Monitor /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ statistics.drillingCount || 0 }}</div>
            <div class="stat-label">钻井中</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-icon production">
            <el-icon><TrendCharts /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ statistics.productionCount || 0 }}</div>
            <div class="stat-label">生产中</div>
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="stat-card">
          <div class="stat-icon alarm">
            <el-icon><Warning /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ statistics.alarmCount || 0 }}</div>
            <div class="stat-label">告警数量</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="mb-20">
      <el-col :span="16">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header">
              <span>产量趋势</span>
            </div>
          </template>
          <div ref="productionTrendChart" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header">
              <span>井状态分布</span>
            </div>
          </template>
          <div ref="wellStatusChart" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="map-card">
          <template #header>
            <div class="card-header">
              <span>井位分布图</span>
            </div>
          </template>
          <div ref="mapContainer" class="map-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="list-card">
          <template #header>
            <div class="card-header">
              <span>实时告警</span>
              <el-button type="primary" size="small" @click="goDrillingMonitor">查看全部</el-button>
            </div>
          </template>
          <el-table :data="alarmList" style="width: 100%">
            <el-table-column prop="wellName" label="井名" width="100" />
            <el-table-column prop="alarmType" label="告警类型" width="120" />
            <el-table-column prop="level" label="级别" width="100">
              <template #default="{ row }">
                <el-tag :type="getAlarmType(row.level)" size="small">{{ row.level }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="time" label="时间" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import * as echarts from 'echarts'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { DrillingAlarm } from '@/api/drilling'
import { useDrillingMonitorStore } from '@/store/modules/drillingMonitor'

const router = useRouter()
const drillingMonitorStore = useDrillingMonitorStore()

const wellNameMap: Record<number, string> = {
  1: 'A-01井',
  2: 'B-03井',
  3: 'C-02井',
  4: 'D-05井',
  5: 'E-01井'
}

const statistics = computed(() => ({
  wellCount: 156,
  drillingCount: 12,
  productionCount: 89,
  alarmCount: drillingMonitorStore.allAlarms.length
}))

const alarmList = computed(() => drillingMonitorStore.allAlarms.slice(0, 8).map((alarm: DrillingAlarm) => ({
  id: alarm.id,
  wellName: wellNameMap[alarm.wellId] || `井${alarm.wellId}`,
  alarmType: alarm.content.includes('钻压') ? '钻压异常' : alarm.level,
  level: alarm.level,
  time: alarm.time
})))

const productionTrendChart = ref<HTMLElement>()
const wellStatusChart = ref<HTMLElement>()
const mapContainer = ref<HTMLElement>()

const getAlarmType = (level: string) => {
  const map: Record<string, any> = {
    '严重': 'danger',
    '警告': 'warning',
    '提示': 'info'
  }
  return map[level] || 'info'
}

const goDrillingMonitor = () => {
  router.push('/drilling')
}

const initProductionTrendChart = () => {
  if (!productionTrendChart.value) return
  const chart = echarts.init(productionTrendChart.value)
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['日产油量', '日产水量'] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: ['1月', '2月', '3月', '4月', '5月', '6月', '7月']
    },
    yAxis: { type: 'value' },
    series: [
      {
        name: '日产油量',
        type: 'line',
        smooth: true,
        data: [120, 132, 101, 134, 90, 230, 210],
        itemStyle: { color: '#3b82f6' }
      },
      {
        name: '日产水量',
        type: 'line',
        smooth: true,
        data: [220, 182, 191, 234, 290, 330, 310],
        itemStyle: { color: '#06b6d4' }
      }
    ]
  })
  window.addEventListener('resize', () => chart.resize())
}

const initWellStatusChart = () => {
  if (!wellStatusChart.value) return
  const chart = echarts.init(wellStatusChart.value)
  chart.setOption({
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', left: 'left' },
    series: [
      {
        name: '井状态',
        type: 'pie',
        radius: '60%',
        data: [
          { value: 89, name: '生产中', itemStyle: { color: '#22c55e' } },
          { value: 12, name: '钻井中', itemStyle: { color: '#3b82f6' } },
          { value: 35, name: '待修井', itemStyle: { color: '#f59e0b' } },
          { value: 20, name: '关停井', itemStyle: { color: '#ef4444' } }
        ],
        emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0, 0, 0, 0.5)' } }
      }
    ]
  })
  window.addEventListener('resize', () => chart.resize())
}

const initMap = () => {
  if (!mapContainer.value) return
  mapboxgl.accessToken = 'pk.eyJ1IjoibW9ja3Rva2VuIiwiYSI6ImNsa2M4OXF2ZjAxemgzYnA2djBqYjhxN3MifQ.Q'
  try {
    const map = new mapboxgl.Map({
      container: mapContainer.value,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [118.8, 38.5],
      zoom: 6
    })
    
    map.on('load', () => {
      const wells = [
        { lng: 118.5, lat: 38.2, name: 'A-01井', status: 'production' },
        { lng: 118.8, lat: 38.5, name: 'B-03井', status: 'drilling' },
        { lng: 119.1, lat: 38.3, name: 'C-02井', status: 'production' },
        { lng: 118.6, lat: 38.7, name: 'D-05井', status: 'maintenance' }
      ]
      
      wells.forEach(well => {
        const el = document.createElement('div')
        el.className = 'well-marker'
        el.style.backgroundColor = well.status === 'production' ? '#22c55e' : well.status === 'drilling' ? '#3b82f6' : '#f59e0b'
        el.style.width = '16px'
        el.style.height = '16px'
        el.style.borderRadius = '50%'
        el.style.border = '2px solid #fff'
        el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)'
        
        new mapboxgl.Marker(el)
          .setLngLat([well.lng, well.lat])
          .setPopup(new mapboxgl.Popup({ offset: 25 }).setHTML(`<h4>${well.name}</h4><p>状态: ${well.status}</p>`))
          .addTo(map)
      })
    })
  } catch (e) {
    console.log('Mapbox token is mock, map will not display')
  }
}

onMounted(() => {
  initProductionTrendChart()
  initWellStatusChart()
  initMap()
})
</script>

<style scoped lang="scss">
.dashboard-container {
  width: 100%;
}

.stat-card {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.08);
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: #fff;
  
  &.well { background: linear-gradient(135deg, #3b82f6, #1d4ed8); }
  &.drilling { background: linear-gradient(135deg, #8b5cf6, #6d28d9); }
  &.production { background: linear-gradient(135deg, #22c55e, #16a34a); }
  &.alarm { background: linear-gradient(135deg, #ef4444, #dc2626); }
}

.stat-content {
  flex: 1;
  
  .stat-value {
    font-size: 28px;
    font-weight: 600;
    color: #1e293b;
    line-height: 1;
    margin-bottom: 6px;
  }
  
  .stat-label {
    font-size: 14px;
    color: #64748b;
  }
}

.chart-card,
.map-card,
.list-card {
  height: 100%;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  color: #1e293b;
}

.chart-container {
  width: 100%;
  height: 300px;
}

.map-container {
  width: 100%;
  height: 350px;
  background: #f8fafc;
  border-radius: 4px;
}
</style>
