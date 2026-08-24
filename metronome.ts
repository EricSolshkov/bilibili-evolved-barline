/**
 * 「音乐小节线」组件 —— Web Audio 节拍器。
 *
 * 关键实现：不做实时秒计时，而是用 requestAnimationFrame 检测
 * `video.currentTime` 跨越「视频时间节拍网格」的边界，每跨过一拍触发一次点击。
 * 拍网格由拍号段动态计算，因此对变速 / 变拍号、拖动进度、暂停/跳转都天然同步。
 */

import { BarConfig, TimeSignatureSegment, nextBeatAt, segmentBeatDuration } from './config'

export class Metronome {
  private ctx: AudioContext | null = null
  private rafId = 0
  private nextBeatTime = 0
  private nextBeatIsBar = false
  private video: HTMLVideoElement | null = null
  private cfg: BarConfig | null = null
  private muted = false
  private volume = 1
  private loopRunning = false
  private countInTimerIds: number[] = []
  private countInOscs: OscillatorNode[] = []
  private seekedHandler = () => this.resync()

  setVideo(video: HTMLVideoElement | null) {
    if (this.video) {
      this.video.removeEventListener('seeked', this.seekedHandler)
    }
    this.video = video
    if (video) {
      video.addEventListener('seeked', this.seekedHandler)
    }
    this.resync()
    this.ensureLoop()
  }

  setConfig(cfg: BarConfig | null) {
    this.cfg = cfg
    this.resync()
    this.ensureLoop()
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (muted) {
      this.stopLoop()
    } else {
      this.ensureLoop()
    }
  }

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume))
  }

  /** 未静音时保证打拍循环在运行。 */
  private ensureLoop() {
    if (this.muted || !this.video || !this.cfg) {
      return
    }
    this.ensureContext()
    this.startLoop()
  }

  private ensureContext() {
    if (!this.ctx) {
      const AC =
        (
          window as unknown as {
            AudioContext?: typeof AudioContext
            webkitAudioContext?: typeof AudioContext
          }
        ).AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (AC) {
        this.ctx = new AC()
      }
    }
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume().catch(none)
    }
  }

  /** 依据当前视频时间重算下一拍。 */
  resync() {
    if (!this.video || !this.cfg) {
      return
    }
    const next = nextBeatAt(this.cfg, this.video.currentTime)
    if (next) {
      this.nextBeatTime = next.time
      this.nextBeatIsBar = next.isBar
    }
  }

  private startLoop() {
    if (this.loopRunning) {
      return
    }
    this.loopRunning = true
    this.resync()
    const loop = () => {
      if (!this.loopRunning) {
        return
      }
      if (this.muted) {
        // 静音时不再调度点击，但保留循环，取消静音后可立即继续。
        this.rafId = requestAnimationFrame(loop)
        return
      }
      if (this.video && this.cfg && !this.video.paused && !this.video.ended) {
        const t = this.video.currentTime
        // 拖动进度/跳转后，下一拍可能落后当前时间很远，直接重算避免爆音。
        if (t - this.nextBeatTime > 2) {
          this.resync()
        }
        // 一次性补发因掉帧/卡顿而积压的拍；上限放到足够大，避免正常播放漏拍。
        let crossed = 0
        while (this.nextBeatTime <= t && crossed < 200) {
          this.playClick(this.nextBeatIsBar)
          const next = nextBeatAt(this.cfg, this.nextBeatTime)
          if (!next || next.time <= this.nextBeatTime) {
            // 防止浮点误差导致原地打转，强制前进。
            this.nextBeatTime += 0.00001
            crossed += 1
            continue
          }
          this.nextBeatTime = next.time
          this.nextBeatIsBar = next.isBar
          crossed += 1
        }
      }
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)
  }

  private stopLoop() {
    this.loopRunning = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
  }

  /**
   * 播放一个点击。
   * @param maxVolume 是否固定用最大音量（预备拍使用），忽略静音/音量设置。
   */
  private scheduleClick(
    accent: boolean,
    delaySeconds: number,
    maxVolume = false,
  ): OscillatorNode | null {
    if (!this.ctx || this.ctx.state !== 'running') {
      return null
    }
    if (!maxVolume && (this.muted || this.volume <= 0.001)) {
      return null
    }
    const { ctx } = this
    const t0 = ctx.currentTime + delaySeconds
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = accent ? 1760 : 1320
    const peak = (accent ? 3.6 : 2.4) * (maxVolume ? 1 : this.volume)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t0)
    osc.stop(t0 + 0.06)
    return osc
  }

  private playClick(accent: boolean) {
    this.scheduleClick(accent, 0)
  }

  /**
   * 打一小节的预备拍（负号倒计时）：每拍通过 onCountBeat 回调（-count ... -1），
   * 结束后回调 onComplete。调用 cancelCountIn 可中途停止。
   */
  countIn(
    segment: TimeSignatureSegment,
    onCountBeat: (beat: number) => void,
    onComplete: () => void,
  ) {
    this.ensureContext()
    this.cancelCountIn()
    if (!this.ctx) {
      onComplete()
      return
    }
    const beat = segmentBeatDuration(segment)
    const count = segment.numerator
    for (let i = 0; i < count; i += 1) {
      // 预备拍固定用最大音量，忽略静音/音量设置。
      const osc = this.scheduleClick(i === 0, i * beat, true)
      if (osc) {
        this.countInOscs.push(osc)
      }
      const display = -(count - i)
      if (i === 0) {
        onCountBeat(display)
      } else {
        const timerId = window.setTimeout(() => onCountBeat(display), i * beat * 1000)
        this.countInTimerIds.push(timerId)
      }
    }
    const doneId = window.setTimeout(() => {
      this.countInTimerIds = []
      this.countInOscs = []
      this.resync()
      onComplete()
    }, count * beat * 1000)
    this.countInTimerIds.push(doneId)
  }

  /** 停止预备拍（清除尚未触发的点击与定时器）。 */
  cancelCountIn() {
    for (const id of this.countInTimerIds) {
      window.clearTimeout(id)
    }
    this.countInTimerIds = []
    for (const osc of this.countInOscs) {
      try {
        osc.stop()
      } catch {
        // 已经停止的节点会抛异常，忽略。
      }
    }
    this.countInOscs = []
  }

  dispose() {
    this.stopLoop()
    this.cancelCountIn()
    this.muted = true
    if (this.video) {
      this.video.removeEventListener('seeked', this.seekedHandler)
    }
    this.video = null
    this.ctx?.close().catch(none)
    this.ctx = null
  }
}
