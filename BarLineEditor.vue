<template>
  <div class="barline-editor">
    <span class="barline-hint">点击表头批量修改</span>
    <table class="barline-table barline-table-head">
      <thead>
        <tr>
          <th style="width: 44px">序号</th>
          <th
            class="barline-col-edit"
            style="width: 90px"
            title="点击整列修改"
            @click="batchEdit('bpm')"
          >
            BPM
          </th>
          <th
            class="barline-col-edit"
            style="width: 70px"
            title="点击整列修改"
            @click="batchEdit('numerator')"
          >
            拍号分子
          </th>
          <th
            class="barline-col-edit"
            style="width: 70px"
            title="点击整列修改"
            @click="batchEdit('denominator')"
          >
            拍号分母
          </th>
          <th>生效小节</th>
          <th style="width: 40px"></th>
        </tr>
      </thead>
    </table>
    <div class="barline-table-wrap">
      <table class="barline-table">
        <tbody>
          <tr v-for="(segment, index) in segments" :key="index">
            <td style="width: 44px">{{ index + 1 }}</td>
            <td style="width: 90px">
              <input
                type="number"
                :min="BPM_MIN"
                :max="BPM_MAX"
                step="1"
                :value="segment.bpm"
                @input="onBpmInput(index, $event)"
                @change="onBpmChange(index, $event)"
              />
            </td>
            <td style="width: 70px">
              <input
                type="number"
                :min="NUMERATOR_MIN"
                :max="NUMERATOR_MAX"
                step="1"
                :value="segment.numerator"
                @input="onNumeratorInput(index, $event)"
                @change="onNumeratorChange(index, $event)"
              />
            </td>
            <td style="width: 70px">
              <input
                type="text"
                inputmode="numeric"
                :value="segment.denominator"
                @input="onDenominatorInput(index, $event)"
                @change="onDenominatorChange(index, $event)"
              />
            </td>
            <td>
              <div v-if="index === 0" class="barline-firstbeat">
                第一拍时间
                <input
                  type="text"
                  :value="formatTime(segment.firstBeatTime ?? 0)"
                  placeholder="m:ss.mmm"
                  @change="onFirstBeatChange($event)"
                />
                <span class="barline-firstbeat-btns">
                  <button type="button" title="往前一拍" @click="nudgeFirstBeat(-1)">◀</button>
                  <button type="button" title="往后一拍" @click="nudgeFirstBeat(1)">▶</button>
                </span>
              </div>
              <input
                v-else
                type="number"
                min="2"
                step="1"
                :value="segment.startBar ?? 2"
                @input="onStartBarInput(index, $event)"
                @change="onStartBarChange(index, $event)"
              />
            </td>
            <td style="width: 40px" class="barline-tap-slot">
              <button
                v-if="index !== 0"
                class="barline-seg-remove2"
                title="删除"
                @click="removeSegment(index)"
              >
                ✕
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="barline-row">
      <span class="barline-hint">共 {{ segments.length }} 段</span>
    </div>
    <div class="barline-add-row">
      <button type="button" @click="addSegment">新增段落</button>
    </div>

    <div class="barline-tapbar">
      <button class="barline-tapbar-btn" type="button" :disabled="videoPaused" @click="tap()">
        打拍子
      </button>
      <span class="barline-tap-value" :class="{ active: tapValue }">
        {{ videoPaused ? '请先播放视频' : tapValue ? `${tapValue}` : '—' }}
      </span>
      <span class="barline-tapbar-col">
        <span class="barline-tapbar-group">
          <button type="button" :disabled="!tapValue" @click="copyTapBpm">
            {{ copied ? '已复制' : '复制' }}
          </button>
        </span>
        <span class="barline-tapbar-group">
          <button type="button" @click="clearTap">清空</button>
        </span>
      </span>
      <span class="barline-tapbar-col">
        <label class="barline-tapbar-check">
          <input v-model="snapFirstBeat" type="checkbox" />第一拍位置吸附到拍子
        </label>
        <label class="barline-tapbar-check">
          <input v-model="tempMetronomeOff" type="checkbox" />临时关闭节拍器
        </label>
      </span>
    </div>

    <fieldset class="barline-handoff">
      <legend>发送到 BiliTabCapture</legend>
      <label>起始小节 <input v-model.number="handoffFirst" type="number" min="1" step="1"></label>
      <label>结束小节 <input v-model.number="handoffLast" type="number" min="1" step="1" placeholder="必填"></label>
      <label>谱线 / 弦数
        <select v-model.number="handoffStrings"><option v-for="n in [4, 5, 6, 7]" :key="n" :value="n">{{ n }} 弦</option></select>
      </label>
      <label>本地应用地址 <input v-model="handoffAddress" type="url" placeholder="http://127.0.0.1:5000"></label>
      <p>先启动 BiliTabCapture。未启动或任务较大时，可导出 JSON 文件后拖入应用。调弦在后续转谱时确认。</p>
      <button type="button" @click="sendHandoff">打开并发送</button>
      <button type="button" @click="downloadHandoff">导出任务 JSON</button>
      <p role="status">{{ handoffMessage }}</p>
    </fieldset>

    <div class="barline-actions">
      <button v-if="hasConfig" type="button" class="danger" @click="deleteAll">删除配置</button>
      <button type="button" @click="cancel">关闭</button>
    </div>
  </div>
</template>

<script lang="ts">
import { createBarlistTask, createHandoffUrl } from './handoff'
import {
  BarConfig,
  BPM_MAX,
  BPM_MIN,
  DEFAULT_SEGMENT,
  DENOMINATORS,
  NUMERATOR_MAX,
  NUMERATOR_MIN,
  TimeSignatureSegment,
  clamp,
  formatTime,
  locateBar,
  normalizeConfig,
  parseTime,
  segmentBeatDuration,
} from './config'

export default Vue.extend({
  name: 'BarLineEditor',
  props: {
    video: { type: Object, required: true },
    handoffVideo: { type: Object, required: true },
    initial: { type: Object, required: true },
    hasConfig: { type: Boolean, default: false },
    onDelete: { type: Function, required: true },
    onPreview: { type: Function, required: true },
    onTempMute: { type: Function, required: true },
  },
  data() {
    const normalized = normalizeConfig(this.initial as BarConfig)
    return {
      segments: normalized.segments.map(s => ({ ...s })) as TimeSignatureSegment[],
      handoffFirst: 1,
      handoffLast: '' as number | string,
      handoffStrings: 6,
      handoffAddress: localStorage.getItem('barline.captureAddress') || 'http://127.0.0.1:5000',
      handoffMessage: '',
      metronomeMuted: normalized.metronomeMuted,
      metronomeVolume: normalized.metronomeVolume,
      tapTimes: [] as number[],
      tapValue: 0,
      copied: false,
      snapFirstBeat: false,
      tempMetronomeOff: false,
      videoPaused: true,
      videoListeners: null as ((this: HTMLVideoElement, ev: Event) => void) | null,
      BPM_MIN,
      BPM_MAX,
      NUMERATOR_MIN,
      NUMERATOR_MAX,
      DENOMINATORS,
    }
  },
  computed: {
    draft(): BarConfig {
      return normalizeConfig({
        segments: this.segments,
        metronomeMuted: this.metronomeMuted,
        metronomeVolume: this.metronomeVolume,
      })
    },
  },
  watch: {
    segments: {
      deep: true,
      handler() {
        this.onPreview(this.draft)
      },
    },
    tempMetronomeOff(value: boolean) {
      // 仅实时静音/恢复，不写入配置。
      this.onTempMute(value)
    },
  },
  mounted() {
    document.addEventListener('keydown', this.onKeydown, true)
    const video = this.video as HTMLVideoElement
    this.videoPaused = video.paused
    const update = () => {
      this.videoPaused = video.paused
    }
    video.addEventListener('play', update)
    video.addEventListener('pause', update)
    this.videoListeners = update
    this.onPreview(this.draft)
  },
  beforeDestroy() {
    document.removeEventListener('keydown', this.onKeydown, true)
    const video = this.video as HTMLVideoElement
    if (this.videoListeners) {
      video.removeEventListener('play', this.videoListeners)
      video.removeEventListener('pause', this.videoListeners)
    }
  },
  methods: {
    buildHandoff() {
      return createBarlistTask(this.draft, {
        ...this.handoffVideo,
        duration: (this.video as HTMLVideoElement).duration,
      } as Parameters<typeof createBarlistTask>[1], this.handoffFirst, Number(this.handoffLast), this.handoffStrings)
    },
    sendHandoff() {
      try {
        const url = createHandoffUrl(this.handoffAddress, this.buildHandoff())
        localStorage.setItem('barline.captureAddress', this.handoffAddress)
        window.open(url, '_blank', 'noopener,noreferrer')
        this.handoffMessage = '已请求打开本地应用；如未打开，请检查应用地址或导出 JSON。'
      } catch (e) { this.handoffMessage = (e as Error).message }
    },
    downloadHandoff() {
      try {
        const task = this.buildHandoff()
        const url = URL.createObjectURL(new Blob([JSON.stringify(task, null, 2)], { type: 'application/json' }))
        const a = document.createElement('a')
        a.href = url
        a.download = `${task.taskId}.barlist.json`
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        this.handoffMessage = '任务文件已导出，可拖入 BiliTabCapture。'
      } catch (e) { this.handoffMessage = (e as Error).message }
    },
    formatTime,
    onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        this.$emit('dialog-close')
      }
    },
    onBpmInput(index: number, e: Event) {
      const value = Number((e.target as HTMLInputElement).value)
      if (Number.isFinite(value)) {
        this.segments[index].bpm = value
      }
    },
    onBpmChange(index: number, e: Event) {
      this.segments[index].bpm = clamp(
        Number((e.target as HTMLInputElement).value) || DEFAULT_SEGMENT.bpm,
        BPM_MIN,
        BPM_MAX,
      )
    },
    onNumeratorInput(index: number, e: Event) {
      const value = Math.round(Number((e.target as HTMLInputElement).value))
      if (Number.isFinite(value)) {
        this.segments[index].numerator = value
      }
    },
    onNumeratorChange(index: number, e: Event) {
      this.segments[index].numerator = clamp(
        Math.round(Number((e.target as HTMLInputElement).value) || DEFAULT_SEGMENT.numerator),
        NUMERATOR_MIN,
        NUMERATOR_MAX,
      )
    },
    onDenominatorInput(index: number, e: Event) {
      const value = Number((e.target as HTMLInputElement).value)
      if ((DENOMINATORS as readonly number[]).includes(value)) {
        this.segments[index].denominator = value
      }
    },
    onDenominatorChange(index: number, e: Event) {
      const input = e.target as HTMLInputElement
      const value = Number(input.value)
      this.segments[index].denominator = (DENOMINATORS as readonly number[]).includes(value)
        ? value
        : DEFAULT_SEGMENT.denominator
      input.value = String(this.segments[index].denominator)
    },
    onFirstBeatChange(e: Event) {
      const input = e.target as HTMLInputElement
      const parsed = parseTime(input.value)
      if (!Number.isNaN(parsed)) {
        this.segments[0].firstBeatTime = Math.max(0, parsed)
      }
      // 失焦后统一还原为规范格式，输入过程中不打断。
      input.value = formatTime(this.segments[0].firstBeatTime ?? 0)
    },
    nudgeFirstBeat(direction: number) {
      const beat = segmentBeatDuration(this.segments[0])
      this.segments[0].firstBeatTime = Math.max(
        0,
        (this.segments[0].firstBeatTime ?? 0) + direction * beat,
      )
    },
    onStartBarInput(index: number, e: Event) {
      const value = Math.round(Number((e.target as HTMLInputElement).value))
      if (Number.isFinite(value)) {
        this.segments[index].startBar = value
      }
    },
    onStartBarChange(index: number, e: Event) {
      this.segments[index].startBar = Math.max(
        2,
        Math.round(Number((e.target as HTMLInputElement).value) || 2),
      )
    },
    batchEdit(mode: 'bpm' | 'numerator' | 'denominator') {
      const maps = { bpm: 'BPM', numerator: '分子', denominator: '分母' } as const
      const label = maps[mode]
      const value = prompt(`输入新的${label}，将应用到所有段落：`)
      if (value === null) {
        return
      }
      const num = Number(value)
      if (!Number.isFinite(num)) {
        return
      }
      if (mode === 'bpm') {
        const v = clamp(num, BPM_MIN, BPM_MAX)
        this.segments.forEach(s => {
          s.bpm = v
        })
      } else if (mode === 'numerator') {
        const v = clamp(Math.round(num), NUMERATOR_MIN, NUMERATOR_MAX)
        this.segments.forEach(s => {
          s.numerator = v
        })
      } else {
        const v = (DENOMINATORS as readonly number[]).includes(num)
          ? num
          : DEFAULT_SEGMENT.denominator
        this.segments.forEach(s => {
          s.denominator = v
        })
      }
    },
    addSegment() {
      const video = this.video as HTMLVideoElement
      const loc = locateBar(this.draft, video.currentTime)
      const curBar = loc ? Math.max(2, loc.bar) : 2
      const last = this.segments[this.segments.length - 1] ?? DEFAULT_SEGMENT
      const startBar = Math.max(curBar, last?.startBar ?? 1)
      this.segments.push({
        bpm: last?.bpm ?? DEFAULT_SEGMENT.bpm,
        numerator: last?.numerator ?? DEFAULT_SEGMENT.numerator,
        denominator: last?.denominator ?? DEFAULT_SEGMENT.denominator,
        startBar,
      })
    },
    removeSegment(index: number) {
      this.segments.splice(index, 1)
    },
    tap() {
      const video = this.video as HTMLVideoElement
      if (video.paused) {
        return
      }
      const now = video.currentTime
      if (this.tapTimes.length > 0 && now - this.tapTimes[this.tapTimes.length - 1] > 3) {
        this.tapTimes.length = 0
      }
      this.tapTimes.push(now)
      if (this.tapTimes.length < 2) {
        return
      }
      const intervals: number[] = []
      for (let i = 1; i < this.tapTimes.length; i += 1) {
        intervals.push(this.tapTimes[i] - this.tapTimes[i - 1])
      }
      const sorted = [...intervals].sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]
      const valid = intervals.filter(d => d > median * 0.5 && d < median * 1.5)
      if (valid.length === 0) {
        this.tapTimes.length = 0
        return
      }
      const avg = valid.reduce((sum, d) => sum + d, 0) / valid.length
      this.tapValue = clamp(Math.round(60 / avg), BPM_MIN, BPM_MAX)
      // 「吸附到拍子」勾选时同步第一拍位置到网格锚点。
      if (this.snapFirstBeat && this.segments[0]) {
        const bd = segmentBeatDuration({ ...this.segments[0], bpm: this.tapValue })
        this.segments[0].firstBeatTime = ((this.tapTimes[0] % bd) + bd) % bd
      }
    },
    copyTapBpm() {
      if (!this.tapValue) {
        return
      }
      navigator.clipboard?.writeText(String(this.tapValue)).catch(none)
      this.copied = true
      window.setTimeout(() => {
        this.copied = false
      }, 1200)
    },
    clearTap() {
      this.tapTimes.length = 0
      this.tapValue = 0
    },
    cancel() {
      this.$emit('dialog-close')
    },
    deleteAll() {
      this.onDelete()
      this.$emit('dialog-close')
    },
  },
})
</script>
