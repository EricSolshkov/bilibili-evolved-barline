<template>
  <div class="barline-editor">
    <div class="barline-seg-container">
      <div v-for="(segment, index) in segments" :key="index" class="barline-seg">
        <div class="barline-seg-title">
          {{ `段落 ${index + 1}` }}
          <button
            v-if="index !== 0"
            type="button"
            class="barline-seg-remove"
            title="删除"
            @click="removeSegment(index)"
          >
            ✕
          </button>
        </div>
        <div class="barline-row">
          <label>BPM</label>
          <input
            type="number"
            :min="BPM_MIN"
            :max="BPM_MAX"
            step="1"
            :value="segment.bpm"
            style="max-width: 76px"
            @input="onBpmInput(index, $event)"
            @change="onBpmChange(index, $event)"
          />
          <button type="button" @click="tapSegment(index)">跟着节拍点击</button>
        </div>
        <div class="barline-row">
          <label>拍号</label>
          <input
            type="number"
            :min="NUMERATOR_MIN"
            :max="NUMERATOR_MAX"
            step="1"
            :value="segment.numerator"
            style="max-width: 76px"
            @input="onNumeratorInput(index, $event)"
            @change="onNumeratorChange(index, $event)"
          />
          <span>/</span>
          <input
            type="text"
            inputmode="numeric"
            :value="segment.denominator"
            style="max-width: 56px"
            @input="onDenominatorInput(index, $event)"
            @change="onDenominatorChange(index, $event)"
          />
        </div>
        <div v-if="index === 0" class="barline-row">
          <div class="barline-col">
            <div>
              <label>第一拍位置</label>
              <input
                type="text"
                :value="formatTime(segment.firstBeatTime ?? 0)"
                style="max-width: 120px"
                placeholder="m:ss.mmm"
                @change="onFirstBeatChange($event)"
              />
              <button type="button" title="更早一拍" @click="nudgeFirstBeat(-1)">往前一拍</button>
              <button type="button" title="更晚一拍" @click="nudgeFirstBeat(1)">往后一拍</button>
            </div>
            <div class="barline-hint">第一拍位置会随打拍子变动</div>
          </div>
        </div>
        <div v-else class="barline-row">
          <label>生效小节</label>
          <span>第</span>
          <input
            type="number"
            min="2"
            step="1"
            :value="segment.startBar ?? 2"
            style="max-width: 76px"
            @input="onStartBarInput(index, $event)"
            @change="onStartBarChange(index, $event)"
          />
          <span>小节</span>
        </div>
      </div>
    </div>
    <div class="barline-row">
      <label></label>
      <button type="button" @click="addSegment">增加段落</button>
    </div>
    <div class="barline-row">
      <label></label>
      <span class="barline-hint"
        >共 {{ segments.length }} 段 · 起始 BPM {{ segments[0]?.bpm }}</span
      >
    </div>
    <div class="barline-actions">
      <button v-if="hasConfig" type="button" class="danger" @click="deleteAll">删除配置</button>
      <button type="button" @click="cancel">关闭</button>
    </div>
  </div>
</template>

<script lang="ts">
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
  normalizeConfig,
  parseTime,
  segmentBeatDuration,
} from './config'

export default Vue.extend({
  name: 'BarLineEditor',
  props: {
    video: { type: Object, required: true },
    initial: { type: Object, required: true },
    hasConfig: { type: Boolean, default: false },
    onDelete: { type: Function, required: true },
    onPreview: { type: Function, required: true },
  },
  data() {
    const normalized = normalizeConfig(this.initial as BarConfig)
    return {
      segments: normalized.segments.map(s => ({ ...s })) as TimeSignatureSegment[],
      metronomeMuted: normalized.metronomeMuted,
      metronomeVolume: normalized.metronomeVolume,
      tapTimes: {} as Record<number, number[]>,
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
  },
  mounted() {
    document.addEventListener('keydown', this.onKeydown, true)
    this.onPreview(this.draft)
  },
  beforeDestroy() {
    document.removeEventListener('keydown', this.onKeydown, true)
  },
  methods: {
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
    nudgeFirstBeat(direction: number) {
      const beat = segmentBeatDuration(this.segments[0])
      this.segments[0].firstBeatTime = Math.max(
        0,
        (this.segments[0].firstBeatTime ?? 0) + direction * beat,
      )
    },
    addSegment() {
      const last = this.segments[this.segments.length - 1] ?? DEFAULT_SEGMENT
      const startBar = this.segments.length === 1 ? 2 : Math.max(2, (last.startBar ?? 2) + 1)
      this.segments.push({
        bpm: last.bpm,
        numerator: last.numerator,
        denominator: last.denominator,
        startBar,
      })
    },
    removeSegment(index: number) {
      this.segments.splice(index, 1)
      this.tapTimes = lodash.omit(this.tapTimes, String(index))
    },
    tapSegment(index: number) {
      const video = this.video as HTMLVideoElement
      if (video.paused) {
        return
      }
      const now = video.currentTime
      const taps = this.tapTimes[index] || []
      if (taps.length > 0 && now - taps[taps.length - 1] > 3) {
        taps.length = 0
      }
      taps.push(now)
      this.tapTimes[index] = taps
      if (taps.length < 2) {
        return
      }
      const intervals: number[] = []
      for (let i = 1; i < taps.length; i += 1) {
        intervals.push(taps[i] - taps[i - 1])
      }
      const sorted = [...intervals].sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]
      const valid = intervals.filter(d => d > median * 0.5 && d < median * 1.5)
      if (valid.length === 0) {
        taps.length = 0
        return
      }
      const avg = valid.reduce((sum, d) => sum + d, 0) / valid.length
      const bpm = clamp(Math.round(60 / avg), BPM_MIN, BPM_MAX)
      this.segments[index].bpm = bpm
      if (index === 0) {
        this.segments[0].firstBeatTime = taps[0]
      }
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
